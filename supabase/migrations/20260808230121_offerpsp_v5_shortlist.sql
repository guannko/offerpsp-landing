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
      OR private.offerpsp_compute_route_staleness(si.offer_route_id) IS NOT NULL
    );
  IF v_stale_count > 0 THEN
    RAISE EXCEPTION 'Shortlist contains % unavailable route(s). Refresh replacements before sharing.',
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

