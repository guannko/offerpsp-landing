-- ============================================================
-- Impact Control v2 — backend enforcement + full workflow
-- 20260808120000_offerpsp_impact_control_v2.sql
--
-- Fixes from independent audit:
--  1. respond_offerpsp_option + request_offerpsp_introduction
--     reject stale items at the DB layer
--  2. Pre-selected stale offers → mandatory manual resolution
--     (queue item has_client_selection = true; dismiss blocked)
--  3. prepare_offerpsp_offer_update validates replacement is
--     published + flow/currency-compatible
--  4. create_offerpsp_shortlist_v_next: build vN+1 with fresh
--     client_snapshot
--  5. confirm_offerpsp_offer_update_sent requires shared v_next
--  6. offerpsp_process_expired_routes for scheduled expiry
--  7. publish_offerpsp_route auto-links queue items for old route
--  8. Provider pause/archive cascades to published routes
--  9. Portal CSS staleness styles (in styles.css — see separate edit)
-- ============================================================

-- ── 1. Queue table: add has_client_selection + compatibility_check ──
ALTER TABLE private.offerpsp_offer_update_queue
  ADD COLUMN IF NOT EXISTS has_client_selection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compatibility_check jsonb;

-- Backfill: mark existing queue items where the shortlist item was already selected
UPDATE private.offerpsp_offer_update_queue q
SET has_client_selection = true
FROM public.offerpsp_shortlist_items si
WHERE si.id = q.shortlist_item_id
  AND si.client_response = 'interested'
  AND q.has_client_selection = false;

-- ── 2. Trigger: track pre-selected stale offers ──
CREATE OR REPLACE FUNCTION private.tg_offerpsp_route_staleness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_staleness text;
  v_item record;
BEGIN
  IF NEW.status = OLD.status
     AND (NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at) THEN
    RETURN NEW;
  END IF;

  v_staleness := private.offerpsp_compute_route_staleness(NEW.id);

  IF v_staleness IS NULL THEN
    UPDATE public.offerpsp_shortlist_items
    SET route_staleness_status = NULL, updated_at = now()
    WHERE offer_route_id = NEW.id
      AND route_staleness_status IS NOT NULL;
    RETURN NEW;
  END IF;

  FOR v_item IN
    SELECT si.id, si.shortlist_id, sl.lead_id, si.client_response
    FROM public.offerpsp_shortlist_items si
    JOIN public.offerpsp_shortlists sl ON sl.id = si.shortlist_id
    WHERE si.offer_route_id = NEW.id
      AND sl.status = 'shared'
  LOOP
    UPDATE public.offerpsp_shortlist_items
    SET route_staleness_status = v_staleness, updated_at = now()
    WHERE id = v_item.id;

    INSERT INTO private.offerpsp_offer_update_queue
      (lead_id, shortlist_id, shortlist_item_id, old_route_id,
       trigger_event, has_client_selection, due_at)
    SELECT
      v_item.lead_id,
      v_item.shortlist_id,
      v_item.id,
      NEW.id,
      v_staleness,
      (v_item.client_response = 'interested'),
      CASE WHEN v_item.client_response = 'interested'
           THEN now() + interval '1 day'
           ELSE now() + interval '3 days'
      END
    WHERE NOT EXISTS (
      SELECT 1 FROM private.offerpsp_offer_update_queue q
      WHERE q.shortlist_item_id = v_item.id
        AND q.old_route_id = NEW.id
        AND q.status IN ('pending', 'in_progress')
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_offerpsp_route_staleness ON private.offerpsp_offer_routes;
CREATE TRIGGER tg_offerpsp_route_staleness
  AFTER UPDATE OF status, expires_at ON private.offerpsp_offer_routes
  FOR EACH ROW EXECUTE FUNCTION private.tg_offerpsp_route_staleness();

-- ── 3. respond_offerpsp_option: reject stale items ──
CREATE OR REPLACE FUNCTION public.respond_offerpsp_option(
  p_option_code text,
  p_response text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_response NOT IN ('interested', 'need_details', 'not_suitable') THEN
    RAISE EXCEPTION 'Unsupported option response';
  END IF;

  SELECT si.*
  INTO v_item
  FROM public.offerpsp_shortlist_items si
  JOIN public.offerpsp_shortlists s ON s.id = si.shortlist_id
  WHERE si.public_code = p_option_code
    AND s.status = 'shared'
    AND public.can_access_offerpsp_client_lead(s.lead_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OfferPSP option not found';
  END IF;

  -- Block selection of stale offers
  IF p_response = 'interested' AND v_item.route_staleness_status IS NOT NULL THEN
    RAISE EXCEPTION 'This offer is no longer available (%). Your manager will prepare an updated version.',
      v_item.route_staleness_status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.offerpsp_shortlists
  WHERE id = v_item.shortlist_id;

  UPDATE public.offerpsp_shortlist_items
  SET client_response = p_response,
      client_responded_at = now(),
      selected_at = CASE WHEN p_response = 'interested' THEN now() ELSE selected_at END
  WHERE id = v_item.id;

  IF p_response = 'interested' THEN
    UPDATE public.offerpsp_leads
    SET status = 'option_selected'
    WHERE lead_id = v_lead_id
      AND status NOT IN ('provider_reviewing', 'provider_needs_info', 'provider_accepted',
                         'telegram_created', 'zoom_scheduled', 'won', 'lost');
  END IF;

  INSERT INTO public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) VALUES (
    v_lead_id, auth.uid(), 'client', 'option_response',
    'Workspace user responded to an anonymous option',
    jsonb_build_object('option_code', p_option_code, 'response', p_response),
    true
  );

  RETURN jsonb_build_object('option_code', p_option_code, 'response', p_response);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_offerpsp_option(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_offerpsp_option(text, text) TO authenticated;

-- ── 4. request_offerpsp_introduction: reject stale items ──
CREATE OR REPLACE FUNCTION public.request_offerpsp_introduction(p_option_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
  v_dossier private.offerpsp_merchant_dossiers;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT si.*
  INTO v_item
  FROM public.offerpsp_shortlist_items si
  JOIN public.offerpsp_shortlists s ON s.id = si.shortlist_id
  WHERE si.public_code = p_option_code
    AND s.status = 'shared'
    AND public.can_access_offerpsp_client_lead(s.lead_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OfferPSP option not found';
  END IF;

  -- Block introduction on stale offer
  IF v_item.route_staleness_status IS NOT NULL THEN
    RAISE EXCEPTION 'Introduction cannot be requested for a stale offer (%). Your manager will prepare an updated version.',
      v_item.route_staleness_status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_item.offer_route_id IS NULL OR v_item.private_provider_id IS NULL THEN
    RAISE EXCEPTION 'This legacy option must be reissued from the private offer database before introduction';
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.offerpsp_shortlists
  WHERE id = v_item.shortlist_id;

  UPDATE public.offerpsp_shortlist_items
  SET client_response = 'interested',
      client_responded_at = COALESCE(client_responded_at, now()),
      selected_at = COALESCE(selected_at, now()),
      introduction_requested_at = now()
  WHERE id = v_item.id;

  v_dossier := private.refresh_offerpsp_merchant_dossier(v_lead_id);

  UPDATE public.offerpsp_leads
  SET status = CASE WHEN v_dossier.status = 'ready' THEN 'dossier_ready' ELSE 'needs_clarification' END
  WHERE lead_id = v_lead_id;

  INSERT INTO public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) VALUES (
    v_lead_id, auth.uid(), 'client', 'introduction_requested',
    'Workspace user requested an introduction',
    CASE WHEN v_dossier.status = 'ready'
      THEN 'The merchant dossier is ready for staff verification.'
      ELSE 'Additional merchant information is required before PSP review.'
    END,
    jsonb_build_object(
      'option_code', p_option_code,
      'dossier_status', v_dossier.status,
      'missing_fields', v_dossier.missing_fields
    ),
    true
  );

  RETURN jsonb_build_object(
    'option_code', p_option_code,
    'status', v_dossier.status,
    'missing_fields', v_dossier.missing_fields
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_offerpsp_introduction(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_offerpsp_introduction(text) TO authenticated;

-- ── 5. prepare_offerpsp_offer_update: validate replacement ──
CREATE OR REPLACE FUNCTION public.prepare_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_new_route_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_old_route private.offerpsp_offer_routes;
  v_new_route private.offerpsp_offer_routes;
  v_compat jsonb;
  v_flow_ok boolean;
  v_currency_ok boolean;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate new route if provided
  IF p_new_route_id IS NOT NULL THEN
    -- Must exist and be published
    SELECT * INTO v_new_route
    FROM private.offerpsp_offer_routes
    WHERE id = p_new_route_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Replacement route not found';
    END IF;
    IF v_new_route.status <> 'published' THEN
      RAISE EXCEPTION 'Replacement route must be published (current status: %)', v_new_route.status;
    END IF;

    -- Fetch old route for compatibility check
    SELECT r.*
    INTO v_old_route
    FROM private.offerpsp_offer_update_queue q
    JOIN private.offerpsp_offer_routes r ON r.id = q.old_route_id
    WHERE q.id = p_queue_item_id;

    IF FOUND THEN
      v_flow_ok := (v_old_route.flow = v_new_route.flow)
                   OR v_new_route.flow = 'both'
                   OR v_old_route.flow = 'both';
      v_currency_ok := (v_old_route.currencies && v_new_route.currencies);

      v_compat := jsonb_build_object(
        'flow_match', v_flow_ok,
        'currency_overlap', v_currency_ok,
        'old_flow', v_old_route.flow,
        'new_flow', v_new_route.flow,
        'old_currencies', to_jsonb(v_old_route.currencies),
        'new_currencies', to_jsonb(v_new_route.currencies),
        'warning', CASE
          WHEN NOT v_flow_ok THEN 'Flow mismatch: client was shown ' || v_old_route.flow || ', replacement is ' || v_new_route.flow
          WHEN NOT v_currency_ok THEN 'No currency overlap between old and replacement route'
          ELSE NULL
        END
      );
    ELSE
      v_compat := jsonb_build_object('note', 'Old route not found; compatibility not checked');
    END IF;
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET new_route_id = p_new_route_id,
      status = 'in_progress',
      assigned_to = auth.uid(),
      compatibility_check = v_compat,
      updated_at = now()
  WHERE id = p_queue_item_id
    AND status IN ('pending', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'queue_item_id', p_queue_item_id,
    'compatibility', v_compat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) TO authenticated;

-- ── 6. create_offerpsp_shortlist_v_next ──
CREATE OR REPLACE FUNCTION public.create_offerpsp_shortlist_v_next(
  p_queue_item_id uuid,
  p_new_route_id uuid,
  p_title text DEFAULT NULL,
  p_introduction text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
  v_old_sl public.offerpsp_shortlists;
  v_new_route private.offerpsp_offer_routes;
  v_new_sl_id uuid;
  v_new_version integer;
  v_snapshot jsonb;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  -- Validate replacement route
  SELECT * INTO v_new_route
  FROM private.offerpsp_offer_routes
  WHERE id = p_new_route_id AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement route must be published';
  END IF;

  -- Fetch old shortlist metadata
  SELECT * INTO v_old_sl
  FROM public.offerpsp_shortlists
  WHERE id = v_queue.shortlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original shortlist not found';
  END IF;

  -- Next version number for this lead
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_new_version
  FROM public.offerpsp_shortlists
  WHERE lead_id = v_old_sl.lead_id;

  -- Build client-safe snapshot from new route
  v_snapshot := private.offerpsp_build_client_route_snapshot(p_new_route_id, v_old_sl.lead_id);

  -- Create new shortlist (draft — staff must share separately)
  INSERT INTO public.offerpsp_shortlists (
    lead_id, version, title, introduction, status, created_by
  ) VALUES (
    v_old_sl.lead_id,
    v_new_version,
    COALESCE(NULLIF(TRIM(p_title), ''), v_old_sl.title || ' v' || v_new_version),
    COALESCE(NULLIF(TRIM(p_introduction), ''), v_old_sl.introduction),
    'draft',
    auth.uid()
  ) RETURNING id INTO v_new_sl_id;

  -- Copy all items from old shortlist, replacing the stale route with the new one
  INSERT INTO public.offerpsp_shortlist_items (
    shortlist_id, offer_route_id, private_provider_id, psp_id,
    rank, client_note, client_snapshot, route_match_id
  )
  SELECT
    v_new_sl_id,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN p_new_route_id ELSE si.offer_route_id END,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN v_new_route.provider_id ELSE si.private_provider_id END,
    si.psp_id,
    si.rank,
    si.client_note,
    CASE WHEN si.id = v_queue.shortlist_item_id
         THEN v_snapshot
         ELSE si.client_snapshot
    END,
    si.route_match_id
  FROM public.offerpsp_shortlist_items si
  WHERE si.shortlist_id = v_queue.shortlist_id
  ORDER BY si.rank;

  -- Link queue item to the new shortlist and confirm the replacement route
  UPDATE private.offerpsp_offer_update_queue
  SET new_route_id = p_new_route_id,
      prepared_shortlist_id = v_new_sl_id,
      status = 'in_progress',
      assigned_to = COALESCE(assigned_to, auth.uid()),
      updated_at = now()
  WHERE id = p_queue_item_id;

  INSERT INTO public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) VALUES (
    v_old_sl.lead_id, auth.uid(), 'staff', 'shortlist_updated',
    'Updated shortlist v' || v_new_version || ' prepared',
    jsonb_build_object(
      'queue_item_id', p_queue_item_id,
      'old_shortlist_id', v_queue.shortlist_id,
      'new_shortlist_id', v_new_sl_id,
      'new_version', v_new_version,
      'new_route_id', p_new_route_id
    ),
    false
  );

  RETURN jsonb_build_object(
    'new_shortlist_id', v_new_sl_id,
    'version', v_new_version,
    'lead_id', v_old_sl.lead_id,
    'new_route_id', p_new_route_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_offerpsp_shortlist_v_next(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_offerpsp_shortlist_v_next(uuid, uuid, text, text) TO authenticated;

-- ── 7. confirm_offerpsp_offer_update_sent: require shared v_next ──
CREATE OR REPLACE FUNCTION public.confirm_offerpsp_offer_update_sent(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
  v_sl_status text;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  -- Require a prepared shortlist that has been shared with the client
  IF v_queue.prepared_shortlist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot mark as sent: create and share a new shortlist version first (use create_offerpsp_shortlist_v_next then share_offerpsp_shortlist)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_sl_status
  FROM public.offerpsp_shortlists
  WHERE id = v_queue.prepared_shortlist_id;

  IF v_sl_status IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'Cannot mark as sent: shortlist v_next (%) has not been shared yet (status: %)',
      v_queue.prepared_shortlist_id, COALESCE(v_sl_status, 'not found')
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'sent',
      client_notified_at = now(),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_queue_item_id;

  INSERT INTO public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) VALUES (
    v_queue.lead_id, auth.uid(), 'staff', 'offer_update_sent',
    'Client notified of updated offer',
    jsonb_build_object(
      'queue_item_id', p_queue_item_id,
      'prepared_shortlist_id', v_queue.prepared_shortlist_id,
      'notes', p_notes
    ),
    true
  );

  RETURN jsonb_build_object('success', true, 'shortlist_id', v_queue.prepared_shortlist_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) TO authenticated;

-- ── 8. dismiss_offerpsp_offer_update: block on client selection ──
CREATE OR REPLACE FUNCTION public.dismiss_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  -- Block dismissal when the client already selected this offer
  IF v_queue.has_client_selection THEN
    RAISE EXCEPTION 'Cannot dismiss: the client already selected this offer. Prepare an updated shortlist version first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
    RAISE EXCEPTION 'A reason note is required to dismiss a queue item'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'dismissed',
      notes = TRIM(p_notes),
      updated_at = now()
  WHERE id = p_queue_item_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) TO authenticated;

-- ── 9. Scheduled: expire routes where expires_at has passed ──
CREATE OR REPLACE FUNCTION public.offerpsp_process_expired_routes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_route_id uuid;
  v_items_updated integer := 0;
  v_tasks_created integer := 0;
  v_item record;
BEGIN
  -- Only service-role or staff can run this
  IF auth.uid() IS NOT NULL AND NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- For each published route whose expires_at has passed, process staleness directly
  FOR v_route_id IN
    SELECT id
    FROM private.offerpsp_offer_routes
    WHERE status = 'published'
      AND expires_at IS NOT NULL
      AND expires_at::date <= current_date
  LOOP
    FOR v_item IN
      SELECT si.id, si.shortlist_id, sl.lead_id, si.client_response
      FROM public.offerpsp_shortlist_items si
      JOIN public.offerpsp_shortlists sl ON sl.id = si.shortlist_id
      WHERE si.offer_route_id = v_route_id
        AND sl.status = 'shared'
        AND (si.route_staleness_status IS DISTINCT FROM 'expired')
    LOOP
      UPDATE public.offerpsp_shortlist_items
      SET route_staleness_status = 'expired', updated_at = now()
      WHERE id = v_item.id;
      v_items_updated := v_items_updated + 1;

      INSERT INTO private.offerpsp_offer_update_queue
        (lead_id, shortlist_id, shortlist_item_id, old_route_id,
         trigger_event, has_client_selection, due_at)
      SELECT
        v_item.lead_id, v_item.shortlist_id, v_item.id,
        v_route_id, 'expired',
        (v_item.client_response = 'interested'),
        CASE WHEN v_item.client_response = 'interested'
             THEN now() + interval '1 day'
             ELSE now() + interval '2 days'
        END
      WHERE NOT EXISTS (
        SELECT 1 FROM private.offerpsp_offer_update_queue q
        WHERE q.shortlist_item_id = v_item.id
          AND q.old_route_id = v_route_id
          AND q.status IN ('pending', 'in_progress')
      );

      IF FOUND THEN
        v_tasks_created := v_tasks_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'items_updated', v_items_updated,
    'tasks_created', v_tasks_created,
    'processed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offerpsp_process_expired_routes() FROM public, anon, authenticated;
-- Called by pg_cron (service role) or staff via execute_sql; not exposed to normal authenticated users

-- ── 10. publish_offerpsp_route: auto-link queue items for old route ──
CREATE OR REPLACE FUNCTION public.publish_offerpsp_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_route private.offerpsp_offer_routes;
  v_provider private.offerpsp_providers;
  v_open_errors integer;
  v_invalid_limits integer;
  v_margin_ready boolean;
  v_remaining_routes integer;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'OfferPSP staff access required';
  END IF;

  SELECT * INTO v_route
  FROM private.offerpsp_offer_routes
  WHERE id = p_route_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OfferPSP route not found';
  END IF;
  IF v_route.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Only a draft or review route can be published';
  END IF;

  SELECT * INTO v_provider FROM private.offerpsp_providers WHERE id = v_route.provider_id;

  SELECT COUNT(*) INTO v_open_errors
  FROM private.offerpsp_route_anomalies
  WHERE route_id = v_route.id AND status = 'open' AND severity = 'error';

  SELECT COUNT(*) INTO v_invalid_limits
  FROM private.offerpsp_offer_limits
  WHERE route_id = v_route.id
    AND minimum_amount IS NOT NULL AND maximum_amount IS NOT NULL
    AND maximum_amount < minimum_amount;

  v_margin_ready := v_provider.margin_included_default OR EXISTS (
    SELECT 1 FROM private.offerpsp_margin_policies mp
    WHERE mp.provider_id = v_route.provider_id
      AND (mp.route_id IS NULL OR mp.route_id = v_route.id)
      AND mp.merchant_lead_id IS NULL
      AND mp.flow IN ('all', v_route.flow)
      AND mp.active
      AND mp.effective_from <= now()
      AND (mp.effective_to IS NULL OR mp.effective_to > now())
  );

  IF v_open_errors > 0 THEN RAISE EXCEPTION 'Resolve all route errors before publication'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.offerpsp_offer_fee_components WHERE route_id = v_route.id) THEN
    RAISE EXCEPTION 'The route requires at least one fee before publication';
  END IF;
  IF (v_route.coverage_scope = 'specific' AND cardinality(v_route.geos) = 0)
     OR cardinality(v_route.currencies) = 0 OR cardinality(v_route.methods) = 0 THEN
    RAISE EXCEPTION 'The route requires GEO coverage, currency and payment method before publication';
  END IF;
  IF v_invalid_limits > 0 THEN RAISE EXCEPTION 'Resolve invalid transaction limits before publication'; END IF;
  IF v_route.expires_at IS NOT NULL AND v_route.expires_at < current_date THEN
    RAISE EXCEPTION 'An expired route cannot be published';
  END IF;
  IF v_provider.last_verified_at IS NULL
     OR v_provider.last_verified_at + make_interval(days => v_route.freshness_days) < now() THEN
    RAISE EXCEPTION 'Confirm current PSP terms before publication';
  END IF;
  IF NOT v_margin_ready THEN RAISE EXCEPTION 'A current margin policy is required before publication'; END IF;

  -- Archive old route if this is a revision
  IF v_route.revision_of_route_id IS NOT NULL THEN
    UPDATE private.offerpsp_offer_routes
    SET status = 'archived', updated_at = now()
    WHERE id = v_route.revision_of_route_id
      AND status IN ('published', 'paused');
    -- The trigger fires above and will set staleness to 'updated' on affected items
  END IF;

  UPDATE private.offerpsp_offer_routes
  SET status = 'published', updated_at = now()
  WHERE id = v_route.id;

  -- Auto-link pending queue items from the old route to the new published route
  IF v_route.revision_of_route_id IS NOT NULL THEN
    UPDATE private.offerpsp_offer_update_queue
    SET new_route_id = p_route_id,
        updated_at = now()
    WHERE old_route_id = v_route.revision_of_route_id
      AND status IN ('pending', 'in_progress')
      AND new_route_id IS NULL;
  END IF;

  SELECT COUNT(*) INTO v_remaining_routes
  FROM private.offerpsp_offer_routes
  WHERE batch_id = v_route.batch_id AND status IN ('draft', 'review');

  UPDATE private.offerpsp_rate_card_batches
  SET status = CASE WHEN v_remaining_routes = 0 THEN 'published' ELSE 'review' END,
      published_by = CASE WHEN v_remaining_routes = 0 THEN auth.uid() ELSE published_by END,
      published_at = CASE WHEN v_remaining_routes = 0 THEN now() ELSE published_at END,
      updated_at = now()
  WHERE id = v_route.batch_id;

  UPDATE private.offerpsp_providers
  SET relationship_status = CASE
        WHEN relationship_status IN ('prospect', 'onboarding') THEN 'active'
        ELSE relationship_status END,
      updated_at = now()
  WHERE id = v_route.provider_id;

  INSERT INTO private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state
  ) VALUES (
    v_route.provider_id, v_route.id, v_route.batch_id, auth.uid(),
    'route_published', 'Individual normalized offer published',
    jsonb_build_object('status', 'published', 'revision_of_route_id', v_route.revision_of_route_id)
  );

  INSERT INTO private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  VALUES ('offer', v_route.id::text, 'published', auth.uid(),
    jsonb_build_object('status', 'published', 'batch_id', v_route.batch_id));

  RETURN jsonb_build_object(
    'route_id', v_route.id,
    'batch_id', v_route.batch_id,
    'provider_id', v_route.provider_id,
    'status', 'published',
    'revision_of_route_id', v_route.revision_of_route_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_offerpsp_route(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_offerpsp_route(uuid) TO authenticated;

-- ── 11. Provider status cascade: pause/archive → routes ──
CREATE OR REPLACE FUNCTION public.offerpsp_cascade_provider_status(
  p_provider_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_routes_affected integer;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_new_status = 'paused' THEN
    -- Pause all published routes (trigger fires → shortlist items marked stale)
    UPDATE private.offerpsp_offer_routes
    SET status = 'paused', updated_at = now()
    WHERE provider_id = p_provider_id AND status = 'published';
    GET DIAGNOSTICS v_routes_affected = ROW_COUNT;

  ELSIF p_new_status = 'archived' THEN
    -- Archive all active routes (trigger fires for each)
    UPDATE private.offerpsp_offer_routes
    SET status = 'archived', updated_at = now()
    WHERE provider_id = p_provider_id AND status IN ('published', 'paused');
    GET DIAGNOSTICS v_routes_affected = ROW_COUNT;

  ELSE
    v_routes_affected := 0;
  END IF;

  RETURN jsonb_build_object(
    'provider_id', p_provider_id,
    'new_status', p_new_status,
    'routes_affected', v_routes_affected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.offerpsp_cascade_provider_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.offerpsp_cascade_provider_status(uuid, text) TO authenticated;

-- Patch save_offerpsp_provider_profile to call cascade on pause/archive
-- We add a trigger on offerpsp_providers to handle this automatically
CREATE OR REPLACE FUNCTION private.tg_offerpsp_provider_status_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
BEGIN
  -- Only fire when status changes to paused or archived
  IF NEW.relationship_status = OLD.relationship_status THEN
    RETURN NEW;
  END IF;

  IF NEW.relationship_status = 'paused' THEN
    UPDATE private.offerpsp_offer_routes
    SET status = 'paused', updated_at = now()
    WHERE provider_id = NEW.id AND status = 'published';

  ELSIF NEW.relationship_status = 'archived' THEN
    UPDATE private.offerpsp_offer_routes
    SET status = 'archived', updated_at = now()
    WHERE provider_id = NEW.id AND status IN ('published', 'paused');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_offerpsp_provider_status_cascade ON private.offerpsp_providers;
CREATE TRIGGER tg_offerpsp_provider_status_cascade
  AFTER UPDATE OF relationship_status ON private.offerpsp_providers
  FOR EACH ROW EXECUTE FUNCTION private.tg_offerpsp_provider_status_cascade();

-- ── 12. get_offerpsp_offer_update_queue: include has_client_selection ──
CREATE OR REPLACE FUNCTION public.get_offerpsp_offer_update_queue(
  p_status_filter text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'lead_id', q.lead_id,
        'shortlist_id', q.shortlist_id,
        'shortlist_item_id', q.shortlist_item_id,
        'old_route_id', q.old_route_id,
        'new_route_id', q.new_route_id,
        'trigger_event', q.trigger_event,
        'status', q.status,
        'has_client_selection', q.has_client_selection,
        'compatibility_check', q.compatibility_check,
        'assigned_to', q.assigned_to,
        'due_at', q.due_at,
        'prepared_shortlist_id', q.prepared_shortlist_id,
        'client_notified_at', q.client_notified_at,
        'notes', q.notes,
        'created_at', q.created_at,
        'shortlist_title', sl.title,
        'shortlist_version', sl.version,
        'public_code', si.public_code,
        'current_staleness', si.route_staleness_status,
        'old_route_title', r_old.client_title,
        'new_route_title', r_new.client_title
      ) ORDER BY q.has_client_selection DESC, q.due_at ASC NULLS LAST, q.created_at ASC
    )
    FROM private.offerpsp_offer_update_queue q
    JOIN public.offerpsp_shortlists sl ON sl.id = q.shortlist_id
    JOIN public.offerpsp_shortlist_items si ON si.id = q.shortlist_item_id
    LEFT JOIN private.offerpsp_offer_routes r_old ON r_old.id = q.old_route_id
    LEFT JOIN private.offerpsp_offer_routes r_new ON r_new.id = q.new_route_id
    WHERE (p_status_filter IS NULL OR q.status = ANY(p_status_filter))
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) TO authenticated;

REVOKE ALL ON FUNCTION private.tg_offerpsp_provider_status_cascade() FROM public, anon, authenticated;
