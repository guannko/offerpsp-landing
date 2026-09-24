-- ============================================================
-- Impact Control v4 — atomic grouped recovery and resumable UI
-- 20260808210000_offerpsp_impact_control_v4.sql
-- ============================================================

-- Fail closed. Commercially critical dimensions block replacement;
-- GEO/method differences require an explicit staff override reason.
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
  v_geo_ok boolean;
  v_method_ok boolean;
BEGIN
  IF p_old_route_id IS NULL THEN
    RAISE EXCEPTION 'Original route is required for replacement validation'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old
  FROM private.offerpsp_offer_routes
  WHERE id = p_old_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original route not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_new
  FROM private.offerpsp_offer_routes
  WHERE id = p_new_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement route not found'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_new.status <> 'published' THEN
    RAISE EXCEPTION 'Replacement route must be published (current status: %)', v_new.status
      USING ERRCODE = 'P0001';
  END IF;
  IF v_new.expires_at IS NOT NULL AND v_new.expires_at::date <= current_date THEN
    RAISE EXCEPTION 'Replacement route is expired (%)', v_new.expires_at
      USING ERRCODE = 'P0001';
  END IF;

  v_flow_ok := COALESCE(
    v_old.flow = v_new.flow OR v_new.flow = 'both' OR v_old.flow = 'both',
    false
  );
  v_currency_ok := COALESCE(
    cardinality(v_old.currencies) > 0
    AND cardinality(v_new.currencies) > 0
    AND v_old.currencies && v_new.currencies,
    false
  );
  v_geo_ok := COALESCE(
    v_old.coverage_scope = 'global'
    OR v_new.coverage_scope = 'global'
    OR (
      cardinality(v_old.geos) > 0
      AND cardinality(v_new.geos) > 0
      AND v_old.geos && v_new.geos
    ),
    false
  );
  v_method_ok := COALESCE(
    cardinality(v_old.methods) > 0
    AND cardinality(v_new.methods) > 0
    AND v_old.methods && v_new.methods,
    false
  );

  IF NOT v_flow_ok THEN
    RAISE EXCEPTION 'Incompatible replacement: flow mismatch (old=%, new=%)',
      COALESCE(v_old.flow, 'missing'), COALESCE(v_new.flow, 'missing')
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_currency_ok THEN
    RAISE EXCEPTION 'Incompatible replacement: no currency overlap (old=%, new=%)',
      COALESCE(array_to_string(v_old.currencies, ','), 'missing'),
      COALESCE(array_to_string(v_new.currencies, ','), 'missing')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'compatible', true,
    'flow_match', v_flow_ok,
    'currency_overlap', v_currency_ok,
    'geo_overlap', v_geo_ok,
    'method_overlap', v_method_ok,
    'requires_override', NOT (v_geo_ok AND v_method_ok),
    'old_flow', v_old.flow,
    'new_flow', v_new.flow,
    'old_currencies', to_jsonb(v_old.currencies),
    'new_currencies', to_jsonb(v_new.currencies),
    'old_geos', to_jsonb(v_old.geos),
    'new_geos', to_jsonb(v_new.geos),
    'old_methods', to_jsonb(v_old.methods),
    'new_methods', to_jsonb(v_new.methods)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.offerpsp_validate_route_replacement(uuid, uuid)
  FROM public, anon, authenticated;

-- NULL-safe queue creation. An untouched client_response is NULL and must be
-- treated as "not selected", not inserted into the NOT NULL flag as NULL.
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

    INSERT INTO private.offerpsp_offer_update_queue(
      lead_id, shortlist_id, shortlist_item_id, old_route_id,
      trigger_event, has_client_selection, due_at
    )
    SELECT
      v_item.lead_id,
      v_item.shortlist_id,
      v_item.id,
      NEW.id,
      v_staleness,
      COALESCE(v_item.client_response = 'interested', false),
      CASE WHEN COALESCE(v_item.client_response = 'interested', false)
        THEN now() + interval '1 day'
        ELSE now() + interval '3 days'
      END
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.offerpsp_offer_update_queue q
      WHERE q.shortlist_item_id = v_item.id
        AND q.old_route_id = NEW.id
        AND q.status IN ('pending', 'in_progress')
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.tg_offerpsp_route_staleness()
  FROM public, anon, authenticated;

-- Queue state is complete enough to reconstruct the workflow after refresh.
CREATE OR REPLACE FUNCTION public.get_offerpsp_offer_update_queue(
  p_status_filter text[] DEFAULT NULL
)
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
        'prepared_shortlist_status', prepared.status,
        'client_notified_at', q.client_notified_at,
        'notes', q.notes,
        'created_at', q.created_at,
        'shortlist_title', sl.title,
        'shortlist_version', sl.version,
        'public_code', si.public_code,
        'current_staleness', si.route_staleness_status,
        'old_route_title', r_old.client_title,
        'old_route_flow', r_old.flow,
        'old_route_geos', to_jsonb(r_old.geos),
        'old_route_currencies', to_jsonb(r_old.currencies),
        'old_route_methods', to_jsonb(r_old.methods),
        'new_route_title', r_new.client_title
      ) ORDER BY q.has_client_selection DESC, q.due_at ASC NULLS LAST, q.created_at ASC
    )
    FROM private.offerpsp_offer_update_queue q
    JOIN public.offerpsp_shortlists sl ON sl.id = q.shortlist_id
    JOIN public.offerpsp_shortlist_items si ON si.id = q.shortlist_item_id
    LEFT JOIN public.offerpsp_shortlists prepared ON prepared.id = q.prepared_shortlist_id
    LEFT JOIN private.offerpsp_offer_routes r_old ON r_old.id = q.old_route_id
    LEFT JOIN private.offerpsp_offer_routes r_new ON r_new.id = q.new_route_id
    WHERE p_status_filter IS NULL OR q.status = ANY(p_status_filter)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) TO authenticated;

-- The legacy single-item preparation endpoint remains safe: warnings require
-- the grouped operation where an override reason can be recorded.
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
  WHERE id = p_queue_item_id
    AND status IN ('pending', 'in_progress')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;
  IF p_new_route_id IS NULL THEN
    RAISE EXCEPTION 'Replacement route is required' USING ERRCODE = 'P0001';
  END IF;

  v_compat := private.offerpsp_validate_route_replacement(v_old_route_id, p_new_route_id);
  IF COALESCE((v_compat ->> 'requires_override')::boolean, true) THEN
    RAISE EXCEPTION 'Replacement changes GEO or payment method. Use the grouped update and provide an override reason.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET new_route_id = p_new_route_id,
      status = 'in_progress',
      assigned_to = auth.uid(),
      compatibility_check = v_compat,
      updated_at = now()
  WHERE id = p_queue_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'queue_item_id', p_queue_item_id,
    'compatibility', v_compat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) TO authenticated;

-- One transaction resolves every stale option in a source shortlist and creates
-- exactly one replacement shortlist.
CREATE OR REPLACE FUNCTION public.create_offerpsp_shortlist_v_next_bulk(
  p_shortlist_id uuid,
  p_replacements jsonb,
  p_title text DEFAULT NULL,
  p_introduction text DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_old_sl public.offerpsp_shortlists;
  v_queue private.offerpsp_offer_update_queue;
  v_item record;
  v_new_route private.offerpsp_offer_routes;
  v_new_route_id uuid;
  v_compat jsonb;
  v_required_count integer;
  v_supplied_count integer;
  v_existing_prepared uuid;
  v_existing_count integer;
  v_new_sl_id uuid;
  v_new_version integer;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF jsonb_typeof(p_replacements) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Replacements must be a JSON object keyed by queue item ID'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old_sl
  FROM public.offerpsp_shortlists
  WHERE id = p_shortlist_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original shortlist not found' USING ERRCODE = 'P0001';
  END IF;
  IF v_old_sl.status <> 'shared' THEN
    RAISE EXCEPTION 'Only a shared shortlist can be replaced (current status: %)', v_old_sl.status
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_old_sl.lead_id::text));

  SELECT COUNT(*)::integer INTO v_required_count
  FROM private.offerpsp_offer_update_queue q
  JOIN public.offerpsp_shortlist_items si ON si.id = q.shortlist_item_id
  WHERE q.shortlist_id = p_shortlist_id
    AND q.status IN ('pending', 'in_progress')
    AND si.route_staleness_status IS NOT NULL;

  SELECT COUNT(*)::integer INTO v_supplied_count FROM jsonb_each_text(p_replacements);
  IF v_required_count = 0 THEN
    RAISE EXCEPTION 'No active stale offer updates exist for this shortlist'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_supplied_count <> v_required_count THEN
    RAISE EXCEPTION 'Every stale option must be replaced together (required %, supplied %)',
      v_required_count, v_supplied_count USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(p_replacements) replacement
    WHERE NOT EXISTS (
      SELECT 1
      FROM private.offerpsp_offer_update_queue q
      JOIN public.offerpsp_shortlist_items si ON si.id = q.shortlist_item_id
      WHERE q.id::text = replacement.key
        AND q.shortlist_id = p_shortlist_id
        AND q.status IN ('pending', 'in_progress')
        AND si.route_staleness_status IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Replacement map contains an unknown or inactive queue item'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT
    MIN(q.prepared_shortlist_id::text)::uuid,
    COUNT(DISTINCT q.prepared_shortlist_id)::integer
  INTO v_existing_prepared, v_existing_count
  FROM private.offerpsp_offer_update_queue q
  WHERE q.shortlist_id = p_shortlist_id
    AND q.status IN ('pending', 'in_progress')
    AND q.prepared_shortlist_id IS NOT NULL;

  IF v_existing_prepared IS NOT NULL THEN
    IF v_existing_count <> 1 OR EXISTS (
      SELECT 1
      FROM private.offerpsp_offer_update_queue q
      WHERE q.shortlist_id = p_shortlist_id
        AND q.status IN ('pending', 'in_progress')
        AND (
          q.prepared_shortlist_id IS DISTINCT FROM v_existing_prepared
          OR q.new_route_id IS DISTINCT FROM (p_replacements ->> q.id::text)::uuid
        )
    ) THEN
      RAISE EXCEPTION 'A different replacement draft already exists. Abandon it explicitly before changing routes.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'new_shortlist_id', v_existing_prepared,
      'idempotent', true,
      'replaced_count', v_required_count
    );
  END IF;

  FOR v_queue IN
    SELECT q.*
    FROM private.offerpsp_offer_update_queue q
    JOIN public.offerpsp_shortlist_items si ON si.id = q.shortlist_item_id
    WHERE q.shortlist_id = p_shortlist_id
      AND q.status IN ('pending', 'in_progress')
      AND si.route_staleness_status IS NOT NULL
    ORDER BY q.created_at, q.id
    FOR UPDATE OF q
  LOOP
    BEGIN
      v_new_route_id := (p_replacements ->> v_queue.id::text)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid replacement route ID for queue item %', v_queue.id
        USING ERRCODE = 'P0001';
    END;

    v_compat := private.offerpsp_validate_route_replacement(v_queue.old_route_id, v_new_route_id);
    IF COALESCE((v_compat ->> 'requires_override')::boolean, true)
       AND NULLIF(TRIM(p_override_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Replacement for option % changes GEO or payment method. Add an override reason.',
        v_queue.shortlist_item_id USING ERRCODE = 'P0001';
    END IF;

    UPDATE private.offerpsp_offer_update_queue
    SET new_route_id = v_new_route_id,
        status = 'in_progress',
        assigned_to = COALESCE(assigned_to, auth.uid()),
        compatibility_check = v_compat || jsonb_build_object(
          'override_reason', NULLIF(TRIM(p_override_reason), '')
        ),
        updated_at = now()
    WHERE id = v_queue.id;
  END LOOP;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM public.offerpsp_shortlists
  WHERE lead_id = v_old_sl.lead_id;

  INSERT INTO public.offerpsp_shortlists(
    lead_id, version, title, introduction, status, created_by
  ) VALUES (
    v_old_sl.lead_id,
    v_new_version,
    COALESCE(NULLIF(TRIM(p_title), ''), v_old_sl.title || ' v' || v_new_version),
    COALESCE(NULLIF(TRIM(p_introduction), ''), v_old_sl.introduction),
    'draft',
    auth.uid()
  ) RETURNING id INTO v_new_sl_id;

  FOR v_item IN
    SELECT si.*, q.new_route_id AS replacement_route_id
    FROM public.offerpsp_shortlist_items si
    LEFT JOIN private.offerpsp_offer_update_queue q
      ON q.shortlist_item_id = si.id
     AND q.shortlist_id = p_shortlist_id
     AND q.status = 'in_progress'
    WHERE si.shortlist_id = p_shortlist_id
    ORDER BY si.rank
  LOOP
    IF v_item.route_staleness_status IS NOT NULL AND v_item.replacement_route_id IS NULL THEN
      RAISE EXCEPTION 'Stale option % has no active replacement task', v_item.id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_item.replacement_route_id IS NOT NULL THEN
      SELECT * INTO v_new_route
      FROM private.offerpsp_offer_routes
      WHERE id = v_item.replacement_route_id;
      v_snapshot := private.offerpsp_build_client_route_snapshot(
        v_item.replacement_route_id,
        v_old_sl.lead_id
      );
    ELSE
      IF private.offerpsp_compute_route_staleness(v_item.offer_route_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Unresolved stale route remains in source shortlist'
          USING ERRCODE = 'P0001';
      END IF;
      v_new_route := NULL;
      v_snapshot := v_item.client_snapshot;
    END IF;

    INSERT INTO public.offerpsp_shortlist_items(
      shortlist_id, offer_route_id, private_provider_id, psp_id,
      rank, client_note, client_snapshot, route_match_id
    ) VALUES (
      v_new_sl_id,
      COALESCE(v_item.replacement_route_id, v_item.offer_route_id),
      CASE WHEN v_item.replacement_route_id IS NOT NULL
        THEN v_new_route.provider_id ELSE v_item.private_provider_id END,
      CASE WHEN v_item.replacement_route_id IS NOT NULL
        THEN NULL ELSE v_item.psp_id END,
      v_item.rank,
      v_item.client_note,
      v_snapshot,
      CASE WHEN v_item.replacement_route_id IS NOT NULL
        THEN NULL ELSE v_item.route_match_id END
    );
  END LOOP;

  UPDATE private.offerpsp_offer_update_queue
  SET prepared_shortlist_id = v_new_sl_id,
      updated_at = now()
  WHERE shortlist_id = p_shortlist_id
    AND status = 'in_progress';

  INSERT INTO public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type,
    title, metadata, client_visible
  ) VALUES (
    v_old_sl.lead_id,
    auth.uid(),
    'staff',
    'shortlist_updated',
    'Updated shortlist v' || v_new_version || ' prepared for review',
    jsonb_build_object(
      'old_shortlist_id', p_shortlist_id,
      'new_shortlist_id', v_new_sl_id,
      'new_version', v_new_version,
      'replacements', p_replacements,
      'override_reason', NULLIF(TRIM(p_override_reason), '')
    ),
    false
  );

  RETURN jsonb_build_object(
    'new_shortlist_id', v_new_sl_id,
    'version', v_new_version,
    'lead_id', v_old_sl.lead_id,
    'replaced_count', v_required_count,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_offerpsp_shortlist_v_next_bulk(uuid, jsonb, text, text, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_offerpsp_shortlist_v_next_bulk(uuid, jsonb, text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.abandon_offerpsp_prepared_update(
  p_shortlist_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_prepared_ids uuid[];
  v_archived integer := 0;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to abandon a prepared update'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.offerpsp_shortlists WHERE id = p_shortlist_id FOR UPDATE;
  SELECT ARRAY_AGG(DISTINCT prepared_shortlist_id)
  INTO v_prepared_ids
  FROM private.offerpsp_offer_update_queue
  WHERE shortlist_id = p_shortlist_id
    AND status IN ('pending', 'in_progress')
    AND prepared_shortlist_id IS NOT NULL;

  IF COALESCE(cardinality(v_prepared_ids), 0) = 0 THEN
    RAISE EXCEPTION 'No prepared replacement draft exists'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.offerpsp_shortlists
    WHERE id = ANY(v_prepared_ids) AND status = 'shared'
  ) THEN
    RAISE EXCEPTION 'A shared shortlist cannot be abandoned'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.offerpsp_shortlists
  SET status = 'archived', updated_at = now()
  WHERE id = ANY(v_prepared_ids)
    AND status IN ('draft', 'review');
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  UPDATE private.offerpsp_offer_update_queue
  SET prepared_shortlist_id = NULL,
      new_route_id = NULL,
      compatibility_check = NULL,
      status = 'pending',
      notes = CONCAT_WS(E'\n', notes, 'Abandoned: ' || TRIM(p_reason)),
      updated_at = now()
  WHERE shortlist_id = p_shortlist_id
    AND status IN ('pending', 'in_progress');

  RETURN jsonb_build_object('success', true, 'archived_drafts', v_archived);
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_offerpsp_prepared_update(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.abandon_offerpsp_prepared_update(uuid, text) TO authenticated;

-- Sharing is the last safety boundary. Revalidate live route state immediately
-- before the client can see the replacement shortlist.
CREATE OR REPLACE FUNCTION public.share_offerpsp_shortlist(p_shortlist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_lead_id uuid;
  v_status text;
  v_invalid_count integer;
  v_stale_count integer;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'OfferPSP staff access required';
  END IF;

  SELECT s.lead_id, s.status INTO v_lead_id, v_status
  FROM public.offerpsp_shortlists s
  WHERE s.id = p_shortlist_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shortlist not found';
  END IF;
  IF v_status = 'shared' THEN
    RETURN jsonb_build_object(
      'lead_id', v_lead_id,
      'shortlist_id', p_shortlist_id,
      'status', 'shared',
      'idempotent', true
    );
  END IF;
  IF v_status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Shortlist cannot be shared from status %', v_status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::integer INTO v_invalid_count
  FROM public.offerpsp_shortlist_items si
  WHERE si.shortlist_id = p_shortlist_id
    AND (
      si.private_provider_id IS NULL
      OR si.offer_route_id IS NULL
      OR si.client_snapshot IS NULL
      OR NULLIF(TRIM(si.client_snapshot ->> 'title'), '') IS NULL
      OR jsonb_array_length(CASE
        WHEN jsonb_typeof(si.client_snapshot -> 'currencies') = 'array'
          THEN si.client_snapshot -> 'currencies' ELSE '[]'::jsonb END) = 0
      OR jsonb_array_length(CASE
        WHEN jsonb_typeof(si.client_snapshot -> 'methods') = 'array'
          THEN si.client_snapshot -> 'methods' ELSE '[]'::jsonb END) = 0
      OR jsonb_array_length(CASE
        WHEN jsonb_typeof(si.client_snapshot -> 'client_fees') = 'array'
          THEN si.client_snapshot -> 'client_fees' ELSE '[]'::jsonb END) = 0
      OR (
        si.client_snapshot ->> 'coverage_scope' = 'specific'
        AND jsonb_array_length(CASE
          WHEN jsonb_typeof(si.client_snapshot -> 'geos') = 'array'
            THEN si.client_snapshot -> 'geos' ELSE '[]'::jsonb END) = 0
      )
    );

  IF NOT EXISTS (
    SELECT 1 FROM public.offerpsp_shortlist_items WHERE shortlist_id = p_shortlist_id
  ) THEN
    RAISE EXCEPTION 'Shortlist has no options';
  END IF;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Shortlist contains legacy or incomplete options. Rebuild it from current published routes before sharing';
  END IF;

  SELECT COUNT(*)::integer INTO v_stale_count
  FROM public.offerpsp_shortlist_items si
  LEFT JOIN private.offerpsp_offer_routes route ON route.id = si.offer_route_id
  WHERE si.shortlist_id = p_shortlist_id
    AND (
      route.id IS NULL
      OR route.status <> 'published'
      OR (route.expires_at IS NOT NULL AND route.expires_at::date <= current_date)
      OR private.offerpsp_compute_route_staleness(si.offer_route_id) IS NOT NULL
    );
  IF v_stale_count > 0 THEN
    RAISE EXCEPTION 'Shortlist contains % unavailable or expired route(s). Refresh replacements before sharing.',
      v_stale_count USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.offerpsp_shortlists
  SET status = 'archived', updated_at = now()
  WHERE lead_id = v_lead_id
    AND id <> p_shortlist_id
    AND status = 'shared';

  UPDATE public.offerpsp_shortlists
  SET status = 'shared',
      shared_at = COALESCE(shared_at, now()),
      updated_at = now()
  WHERE id = p_shortlist_id;

  UPDATE public.offerpsp_leads
  SET status = 'shared'
  WHERE lead_id = v_lead_id
    AND status NOT IN (
      'provider_reviewing', 'provider_needs_info', 'provider_accepted',
      'telegram_created', 'zoom_scheduled', 'won', 'lost'
    );

  INSERT INTO public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type,
    title, body, client_visible
  ) VALUES (
    v_lead_id,
    auth.uid(),
    'staff',
    'shortlist_shared',
    'Payment route shortlist shared',
    'Comparable route terms are now available in the client workspace.',
    true
  );

  RETURN jsonb_build_object(
    'lead_id', v_lead_id,
    'shortlist_id', p_shortlist_id,
    'status', 'shared',
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.share_offerpsp_shortlist(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.share_offerpsp_shortlist(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_offerpsp_offer_updates_sent(
  p_shortlist_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_prepared_id uuid;
  v_prepared_count integer;
  v_lead_id uuid;
  v_updated integer;
BEGIN
  IF NOT public.is_offerpsp_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT
    MIN(prepared_shortlist_id::text)::uuid,
    COUNT(DISTINCT prepared_shortlist_id)::integer,
    MIN(lead_id::text)::uuid
  INTO v_prepared_id, v_prepared_count, v_lead_id
  FROM private.offerpsp_offer_update_queue
  WHERE shortlist_id = p_shortlist_id
    AND status IN ('pending', 'in_progress');

  IF v_prepared_id IS NULL OR v_prepared_count <> 1 THEN
    RAISE EXCEPTION 'All active update tasks must reference one prepared shortlist'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.offerpsp_shortlists
    WHERE id = v_prepared_id AND status = 'shared'
  ) THEN
    RAISE EXCEPTION 'Prepared shortlist must be shared before confirming notification'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'sent',
      client_notified_at = now(),
      notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
      updated_at = now()
  WHERE shortlist_id = p_shortlist_id
    AND status IN ('pending', 'in_progress');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type,
    title, metadata, client_visible
  ) VALUES (
    v_lead_id,
    auth.uid(),
    'staff',
    'offer_update_sent',
    'Client notified of updated offer options',
    jsonb_build_object(
      'source_shortlist_id', p_shortlist_id,
      'prepared_shortlist_id', v_prepared_id,
      'updated_tasks', v_updated,
      'notes', p_notes
    ),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'shortlist_id', v_prepared_id,
    'updated_tasks', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_offerpsp_offer_updates_sent(uuid, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_offerpsp_offer_updates_sent(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
