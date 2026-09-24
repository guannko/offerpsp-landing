-- ============================================================
-- Impact Control v3 — correctness fixes
-- 20260808180000_offerpsp_impact_control_v3.sql
--
-- Fixes from second independent audit:
--  1. All 7 RPCs: private.is_offerpsp_staff() → public.is_offerpsp_staff()
--  2. offerpsp_compute_route_staleness: 'updated' only for published revision
--  3. Hard-block incompatible replacement (not just warn)
--     via shared private validator used by both prepare and create_v_next
--  4. create_offerpsp_shortlist_v_next: idempotent + advisory lock +
--     compatibility hard-check + correct PSP/provider mapping +
--     block if other items in source shortlist are also stale
--  5. dismiss P0001 message explicitly names the business rule
--  6. offerpsp_cascade_provider_status: fix search_path
-- ============================================================

-- ── 1. Fix staleness: 'updated' only when a PUBLISHED revision exists ──
CREATE OR REPLACE FUNCTION private.offerpsp_compute_route_staleness(p_route_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN r.status = 'published'
           AND (r.expires_at IS NULL OR r.expires_at::date > current_date) THEN NULL
      WHEN r.status = 'published'
           AND r.expires_at::date <= current_date THEN 'expired'
      WHEN r.status = 'paused' THEN 'paused'
      WHEN r.status IN ('archived', 'superseded')
           AND EXISTS (
             SELECT 1 FROM private.offerpsp_offer_routes
             WHERE revision_of_route_id = r.id
               AND status = 'published'          -- only a live published revision counts
           ) THEN 'updated'
      WHEN r.status IN ('archived', 'superseded') THEN 'unavailable'
      ELSE NULL
    END
  FROM private.offerpsp_offer_routes r
  WHERE r.id = p_route_id
$$;

-- ── 2. Shared replacement validator (raises on incompatibility) ──
CREATE OR REPLACE FUNCTION private.offerpsp_validate_route_replacement(
  p_old_route_id uuid,
  p_new_route_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
  v_flow_ok boolean;
  v_currency_ok boolean;
BEGIN
  SELECT * INTO v_new FROM private.offerpsp_offer_routes WHERE id = p_new_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement route not found' USING ERRCODE = 'P0001';
  END IF;
  IF v_new.status <> 'published' THEN
    RAISE EXCEPTION 'Replacement route must be published (current status: %)', v_new.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_old_route_id IS NOT NULL THEN
    SELECT * INTO v_old FROM private.offerpsp_offer_routes WHERE id = p_old_route_id;
    IF FOUND THEN
      v_flow_ok := (v_old.flow = v_new.flow) OR v_new.flow = 'both' OR v_old.flow = 'both';
      v_currency_ok := (v_old.currencies && v_new.currencies);

      IF NOT v_flow_ok THEN
        RAISE EXCEPTION 'Incompatible replacement: flow mismatch (old=%, new=%). Choose a route with matching flow.',
          v_old.flow, v_new.flow USING ERRCODE = 'P0001';
      END IF;
      IF NOT v_currency_ok THEN
        RAISE EXCEPTION 'Incompatible replacement: no currency overlap (old=%, new=%). Choose a route with at least one matching currency.',
          array_to_string(v_old.currencies, ','), array_to_string(v_new.currencies, ',')
          USING ERRCODE = 'P0001';
      END IF;

      RETURN jsonb_build_object(
        'flow_match', v_flow_ok,
        'currency_overlap', v_currency_ok,
        'old_flow', v_old.flow, 'new_flow', v_new.flow,
        'old_currencies', to_jsonb(v_old.currencies),
        'new_currencies', to_jsonb(v_new.currencies)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('note', 'Old route not found; compatibility assumed OK');
END;
$$;

REVOKE ALL ON FUNCTION private.offerpsp_validate_route_replacement(uuid, uuid) FROM public, anon, authenticated;

-- ── 3. refresh_offerpsp_shortlist_staleness — fix search_path ──
CREATE OR REPLACE FUNCTION public.refresh_offerpsp_shortlist_staleness(
  p_route_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.offerpsp_shortlist_items si
  SET route_staleness_status = private.offerpsp_compute_route_staleness(si.offer_route_id),
      updated_at = now()
  FROM public.offerpsp_shortlists sl
  WHERE sl.id = si.shortlist_id
    AND sl.status = 'shared'
    AND si.offer_route_id IS NOT NULL
    AND (p_route_id IS NULL OR si.offer_route_id = p_route_id)
    AND si.route_staleness_status
        IS DISTINCT FROM private.offerpsp_compute_route_staleness(si.offer_route_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_offerpsp_shortlist_staleness(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_offerpsp_shortlist_staleness(uuid) TO authenticated;

-- ── 4. get_offerpsp_route_impact — fix search_path ──
CREATE OR REPLACE FUNCTION public.get_offerpsp_route_impact(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'route_id', p_route_id,
      'affected_count', COUNT(*),
      'affected_items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'item_id', si.id,
          'shortlist_id', si.shortlist_id,
          'shortlist_version', sl.version,
          'shortlist_title', sl.title,
          'lead_id', sl.lead_id,
          'public_code', si.public_code,
          'current_staleness', si.route_staleness_status,
          'shared_at', sl.shared_at
        ) ORDER BY sl.shared_at DESC
      ), '[]'::jsonb)
    )
    FROM public.offerpsp_shortlist_items si
    JOIN public.offerpsp_shortlists sl ON sl.id = si.shortlist_id
    WHERE si.offer_route_id = p_route_id
      AND sl.status = 'shared'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_offerpsp_route_impact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_offerpsp_route_impact(uuid) TO authenticated;

-- ── 5. get_offerpsp_offer_update_queue — fix search_path ──
CREATE OR REPLACE FUNCTION public.get_offerpsp_offer_update_queue(p_status_filter text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id, 'lead_id', q.lead_id,
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

-- ── 6. prepare_offerpsp_offer_update — fix + hard-block incompatible ──
CREATE OR REPLACE FUNCTION public.prepare_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_new_route_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_old_route_id uuid;
  v_compat jsonb;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT old_route_id INTO v_old_route_id
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id;

  -- Raises P0001 on incompatible route (hard block)
  IF p_new_route_id IS NOT NULL THEN
    v_compat := private.offerpsp_validate_route_replacement(v_old_route_id, p_new_route_id);
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

-- ── 7. create_offerpsp_shortlist_v_next — all fixes ──
CREATE OR REPLACE FUNCTION public.create_offerpsp_shortlist_v_next(
  p_queue_item_id uuid,
  p_new_route_id uuid,
  p_title text DEFAULT NULL,
  p_introduction text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
  v_old_sl public.offerpsp_shortlists;
  v_new_route private.offerpsp_offer_routes;
  v_new_sl_id uuid;
  v_new_version integer;
  v_snapshot jsonb;
  v_stale_others integer;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Advisory lock: prevent parallel calls for the same queue item
  IF NOT pg_try_advisory_xact_lock(hashtext(p_queue_item_id::text)) THEN
    RAISE EXCEPTION 'Another operation is in progress for this queue item. Retry in a moment.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  -- Idempotency: if vNext already prepared with same route, return it
  IF v_queue.prepared_shortlist_id IS NOT NULL AND v_queue.new_route_id = p_new_route_id THEN
    RETURN jsonb_build_object(
      'new_shortlist_id', v_queue.prepared_shortlist_id,
      'idempotent', true,
      'new_route_id', p_new_route_id
    );
  END IF;

  -- Hard compatibility check (raises P0001 on mismatch)
  PERFORM private.offerpsp_validate_route_replacement(v_queue.old_route_id, p_new_route_id);

  -- Fetch new route (validator already confirmed it's published)
  SELECT * INTO v_new_route FROM private.offerpsp_offer_routes WHERE id = p_new_route_id;

  -- Fetch source shortlist
  SELECT * INTO v_old_sl FROM public.offerpsp_shortlists WHERE id = v_queue.shortlist_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original shortlist not found';
  END IF;

  -- Block if OTHER items in the same shortlist are also stale (must resolve all)
  SELECT COUNT(*) INTO v_stale_others
  FROM public.offerpsp_shortlist_items
  WHERE shortlist_id = v_queue.shortlist_id
    AND id <> v_queue.shortlist_item_id
    AND route_staleness_status IS NOT NULL;

  IF v_stale_others > 0 THEN
    RAISE EXCEPTION 'Cannot create vNext: % other item(s) in this shortlist also have stale routes. Create queue tasks for all stale items and resolve them first, or use refresh_offerpsp_shortlist_staleness.',
      v_stale_others USING ERRCODE = 'P0001';
  END IF;

  -- Next version number for this lead
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM public.offerpsp_shortlists WHERE lead_id = v_old_sl.lead_id;

  -- Build fresh client-safe snapshot from new route
  v_snapshot := private.offerpsp_build_client_route_snapshot(p_new_route_id, v_old_sl.lead_id);

  -- Create new shortlist draft
  INSERT INTO public.offerpsp_shortlists(lead_id, version, title, introduction, status, created_by)
  VALUES (
    v_old_sl.lead_id, v_new_version,
    COALESCE(NULLIF(TRIM(p_title), ''), v_old_sl.title || ' v' || v_new_version),
    COALESCE(NULLIF(TRIM(p_introduction), ''), v_old_sl.introduction),
    'draft', auth.uid()
  ) RETURNING id INTO v_new_sl_id;

  -- Copy items: for the replaced item use new route + new snapshot + correct PSP mapping
  --             for unchanged items copy exactly (no route_match_id for replaced item)
  INSERT INTO public.offerpsp_shortlist_items(
    shortlist_id, offer_route_id, private_provider_id, psp_id,
    rank, client_note, client_snapshot, route_match_id
  )
  SELECT
    v_new_sl_id,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN p_new_route_id   ELSE si.offer_route_id   END,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN v_new_route.provider_id ELSE si.private_provider_id END,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN NULL              ELSE si.psp_id           END,
    si.rank, si.client_note,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN v_snapshot        ELSE si.client_snapshot  END,
    CASE WHEN si.id = v_queue.shortlist_item_id THEN NULL              ELSE si.route_match_id   END
  FROM public.offerpsp_shortlist_items si
  WHERE si.shortlist_id = v_queue.shortlist_id
  ORDER BY si.rank;

  -- Link queue item to new shortlist + lock in the replacement route
  UPDATE private.offerpsp_offer_update_queue
  SET new_route_id = p_new_route_id,
      prepared_shortlist_id = v_new_sl_id,
      status = 'in_progress',
      assigned_to = COALESCE(assigned_to, auth.uid()),
      updated_at = now()
  WHERE id = p_queue_item_id;

  INSERT INTO public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) VALUES (
    v_old_sl.lead_id, auth.uid(), 'staff', 'shortlist_updated',
    'Updated shortlist v' || v_new_version || ' prepared for review',
    jsonb_build_object(
      'queue_item_id', p_queue_item_id,
      'old_shortlist_id', v_queue.shortlist_id,
      'new_shortlist_id', v_new_sl_id,
      'new_version', v_new_version,
      'new_route_id', p_new_route_id
    ), false
  );

  RETURN jsonb_build_object(
    'new_shortlist_id', v_new_sl_id,
    'version', v_new_version,
    'lead_id', v_old_sl.lead_id,
    'new_route_id', p_new_route_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_offerpsp_shortlist_v_next(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_offerpsp_shortlist_v_next(uuid, uuid, text, text) TO authenticated;

-- ── 8. confirm_offerpsp_offer_update_sent — fix search_path ──
CREATE OR REPLACE FUNCTION public.confirm_offerpsp_offer_update_sent(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
  v_sl_status text;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  IF v_queue.prepared_shortlist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot mark as sent: create and share a new shortlist version first (create_offerpsp_shortlist_v_next → share_offerpsp_shortlist)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_sl_status
  FROM public.offerpsp_shortlists WHERE id = v_queue.prepared_shortlist_id;

  IF v_sl_status IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'Cannot mark as sent: shortlist is not shared yet (status: %). Share it with the client first.',
      COALESCE(v_sl_status, 'not found') USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'sent', client_notified_at = now(),
      notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE id = p_queue_item_id;

  INSERT INTO public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) VALUES (
    v_queue.lead_id, auth.uid(), 'staff', 'offer_update_sent',
    'Client notified of updated offer options',
    jsonb_build_object('queue_item_id', p_queue_item_id,
                       'prepared_shortlist_id', v_queue.prepared_shortlist_id,
                       'notes', p_notes), true
  );

  RETURN jsonb_build_object('success', true, 'shortlist_id', v_queue.prepared_shortlist_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) TO authenticated;

-- ── 9. dismiss_offerpsp_offer_update — fix + explicit P0001 ──
CREATE OR REPLACE FUNCTION public.dismiss_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_queue private.offerpsp_offer_update_queue;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_queue
  FROM private.offerpsp_offer_update_queue
  WHERE id = p_queue_item_id AND status IN ('pending', 'in_progress')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  IF v_queue.has_client_selection THEN
    RAISE EXCEPTION 'Business rule: cannot dismiss — the client already selected this offer (code %). '
      'Prepare and share an updated shortlist version, then mark as sent.',
      (SELECT public_code FROM public.offerpsp_shortlist_items WHERE id = v_queue.shortlist_item_id)
      USING ERRCODE = 'P0001';
  END IF;

  IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
    RAISE EXCEPTION 'A reason note is required to dismiss a queue item'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'dismissed', notes = TRIM(p_notes), updated_at = now()
  WHERE id = p_queue_item_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) TO authenticated;

-- ── 10. offerpsp_cascade_provider_status — fix search_path ──
CREATE OR REPLACE FUNCTION public.offerpsp_cascade_provider_status(
  p_provider_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_routes_affected integer;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_new_status = 'paused' THEN
    UPDATE private.offerpsp_offer_routes
    SET status = 'paused', updated_at = now()
    WHERE provider_id = p_provider_id AND status = 'published';
    GET DIAGNOSTICS v_routes_affected = ROW_COUNT;
  ELSIF p_new_status = 'archived' THEN
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
