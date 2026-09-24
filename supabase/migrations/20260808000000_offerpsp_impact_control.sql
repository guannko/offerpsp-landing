-- ============================================================
-- Impact Control + Merchant Offer Updates
-- 20260808000000_offerpsp_impact_control.sql
--
-- What this does:
--   1. Adds route_staleness_status to public.offerpsp_shortlist_items
--   2. Creates private.offerpsp_offer_update_queue admin work queue
--   3. Adds trigger on route status changes → auto-update staleness + enqueue
--   4. Adds RPCs: get_offerpsp_route_impact, get_offerpsp_offer_update_queue,
--      prepare_offerpsp_offer_update, confirm_offerpsp_offer_update_sent,
--      dismiss_offerpsp_offer_update, refresh_offerpsp_shortlist_staleness
--   5. Updates list_offerpsp_client_offers to expose route_staleness_status
--   6. Backfills staleness for all existing shared shortlist items
-- ============================================================

-- 1. Staleness column on shortlist items
ALTER TABLE public.offerpsp_shortlist_items
  ADD COLUMN IF NOT EXISTS route_staleness_status text
  CONSTRAINT offerpsp_shortlist_items_staleness_values
  CHECK (route_staleness_status IN ('updated', 'paused', 'unavailable', 'expired'));

ALTER TABLE public.offerpsp_shortlist_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Admin work queue for merchant offer updates
CREATE TABLE IF NOT EXISTS private.offerpsp_offer_update_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  shortlist_id uuid NOT NULL REFERENCES public.offerpsp_shortlists(id),
  shortlist_item_id uuid NOT NULL REFERENCES public.offerpsp_shortlist_items(id),
  old_route_id uuid REFERENCES private.offerpsp_offer_routes(id),
  new_route_id uuid REFERENCES private.offerpsp_offer_routes(id),
  trigger_event text NOT NULL CHECK (trigger_event IN ('paused', 'updated', 'unavailable', 'expired')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'sent', 'dismissed')),
  assigned_to uuid REFERENCES auth.users(id),
  due_at timestamptz,
  prepared_shortlist_id uuid REFERENCES public.offerpsp_shortlists(id),
  client_notified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offerpsp_offer_update_queue_status_idx
  ON private.offerpsp_offer_update_queue(status, due_at);
CREATE INDEX IF NOT EXISTS offerpsp_offer_update_queue_route_idx
  ON private.offerpsp_offer_update_queue(old_route_id);
CREATE INDEX IF NOT EXISTS offerpsp_offer_update_queue_item_idx
  ON private.offerpsp_offer_update_queue(shortlist_item_id);

-- 3. Helper: compute staleness for a route based on its current state
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
           ) THEN 'updated'
      WHEN r.status IN ('archived', 'superseded') THEN 'unavailable'
      ELSE NULL
    END
  FROM private.offerpsp_offer_routes r
  WHERE r.id = p_route_id
$$;

-- 4. Trigger: on route status/expiry change → refresh staleness + enqueue update tasks
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
  -- Skip if neither status nor expires_at changed
  IF NEW.status = OLD.status
     AND (NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at) THEN
    RETURN NEW;
  END IF;

  v_staleness := private.offerpsp_compute_route_staleness(NEW.id);

  IF v_staleness IS NULL THEN
    -- Route became active again (e.g. unpaused); clear staleness on its items
    UPDATE public.offerpsp_shortlist_items
    SET route_staleness_status = NULL, updated_at = now()
    WHERE offer_route_id = NEW.id
      AND route_staleness_status IS NOT NULL;
    RETURN NEW;
  END IF;

  -- Update staleness on all shared shortlist items and enqueue update tasks
  FOR v_item IN
    SELECT si.id, si.shortlist_id, sl.lead_id
    FROM public.offerpsp_shortlist_items si
    JOIN public.offerpsp_shortlists sl ON sl.id = si.shortlist_id
    WHERE si.offer_route_id = NEW.id
      AND sl.status = 'shared'
  LOOP
    UPDATE public.offerpsp_shortlist_items
    SET route_staleness_status = v_staleness, updated_at = now()
    WHERE id = v_item.id;

    -- Idempotent enqueue: skip if a pending/in_progress task already exists
    INSERT INTO private.offerpsp_offer_update_queue
      (lead_id, shortlist_id, shortlist_item_id, old_route_id, trigger_event, due_at)
    SELECT
      v_item.lead_id,
      v_item.shortlist_id,
      v_item.id,
      NEW.id,
      v_staleness,
      now() + interval '3 days'
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

-- 5. Refresh staleness manually (staff-triggered or scheduled)
CREATE OR REPLACE FUNCTION public.refresh_offerpsp_shortlist_staleness(
  p_route_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
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

-- 6. Impact check: which shared shortlist items reference this route?
CREATE OR REPLACE FUNCTION public.get_offerpsp_route_impact(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
BEGIN
  IF NOT private.is_offerpsp_staff() THEN
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

-- 7. Admin queue view
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
      ) ORDER BY q.due_at ASC NULLS LAST, q.created_at ASC
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

-- 8. Assign replacement route and take ownership of queue item
CREATE OR REPLACE FUNCTION public.prepare_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_new_route_id uuid DEFAULT NULL
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

  UPDATE private.offerpsp_offer_update_queue
  SET new_route_id = p_new_route_id,
      status = 'in_progress',
      assigned_to = auth.uid(),
      updated_at = now()
  WHERE id = p_queue_item_id
    AND status IN ('pending', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  RETURN jsonb_build_object('success', true, 'queue_item_id', p_queue_item_id);
END;
$$;

-- 9. Mark client notified after manual outreach
CREATE OR REPLACE FUNCTION public.confirm_offerpsp_offer_update_sent(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
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

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'sent',
      client_notified_at = now(),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_queue_item_id
    AND status IN ('pending', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. Dismiss a queue item (no action needed / handled outside system)
CREATE OR REPLACE FUNCTION public.dismiss_offerpsp_offer_update(
  p_queue_item_id uuid,
  p_notes text DEFAULT NULL
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

  UPDATE private.offerpsp_offer_update_queue
  SET status = 'dismissed',
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_queue_item_id
    AND status IN ('pending', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already completed';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. Update list_offerpsp_client_offers to expose staleness to portal
-- PostgreSQL cannot change a RETURNS TABLE signature with CREATE OR REPLACE.
-- Drop the previous projection explicitly so a clean migration replay works.
DROP FUNCTION IF EXISTS public.list_offerpsp_client_offers(uuid);
CREATE OR REPLACE FUNCTION public.list_offerpsp_client_offers(p_lead_id uuid DEFAULT NULL)
RETURNS TABLE (
  shortlist_id uuid,
  lead_id uuid,
  version integer,
  title text,
  introduction text,
  status text,
  shared_at timestamptz,
  rank integer,
  option_code text,
  client_note text,
  client_response text,
  client_responded_at timestamptz,
  route_title text,
  coverage_scope text,
  geos jsonb,
  currencies jsonb,
  flow text,
  methods jsonb,
  card_brands jsonb,
  card_issue text,
  traffic_types jsonb,
  integrations jsonb,
  client_fees jsonb,
  limits jsonb,
  settlement jsonb,
  risk_terms jsonb,
  valid_through text,
  route_staleness_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    s.id,
    s.lead_id,
    s.version,
    s.title::text,
    s.introduction::text,
    s.status::text,
    s.shared_at,
    si.rank,
    si.public_code::text,
    COALESCE(
      NULLIF(si.client_note, ''),
      'Selected for your operating profile. Detailed partner terms are disclosed during the managed introduction.'
    )::text,
    si.client_response::text,
    si.client_responded_at,
    (si.client_snapshot ->> 'title')::text,
    (si.client_snapshot ->> 'coverage_scope')::text,
    si.client_snapshot -> 'geos',
    si.client_snapshot -> 'currencies',
    (si.client_snapshot ->> 'flow')::text,
    si.client_snapshot -> 'methods',
    si.client_snapshot -> 'card_brands',
    (si.client_snapshot ->> 'card_issue')::text,
    si.client_snapshot -> 'traffic_types',
    si.client_snapshot -> 'integrations',
    si.client_snapshot -> 'client_fees',
    si.client_snapshot -> 'limits',
    COALESCE((
      SELECT jsonb_agg(
        settlement_term - 'fee_percent' - 'fixed_fee' - 'fixed_fee_currency'
        ORDER BY ordinal
      )
      FROM jsonb_array_elements(COALESCE(si.client_snapshot -> 'settlement', '[]'::jsonb))
        WITH ORDINALITY AS settlement_terms(settlement_term, ordinal)
    ), '[]'::jsonb),
    COALESCE(si.client_snapshot -> 'risk_terms', '{}'::jsonb),
    (si.client_snapshot ->> 'valid_through')::text,
    si.route_staleness_status
  FROM public.offerpsp_shortlists s
  JOIN public.offerpsp_shortlist_items si ON si.shortlist_id = s.id
  WHERE s.status = 'shared'
    AND (p_lead_id IS NULL OR s.lead_id = p_lead_id)
    AND public.can_access_offerpsp_client_lead(s.lead_id)
  ORDER BY s.shared_at DESC, si.rank;
$$;

-- Grants for new and updated functions
REVOKE ALL ON FUNCTION public.list_offerpsp_client_offers(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_offerpsp_client_offers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_offerpsp_shortlist_staleness(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_offerpsp_shortlist_staleness(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_offerpsp_route_impact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_offerpsp_route_impact(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_offerpsp_offer_update_queue(text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.prepare_offerpsp_offer_update(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_offerpsp_offer_update_sent(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_offerpsp_offer_update(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION private.offerpsp_compute_route_staleness(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_offerpsp_route_staleness() FROM public, anon, authenticated;

-- 12. Backfill staleness for existing shared shortlist items
UPDATE public.offerpsp_shortlist_items si
SET route_staleness_status = private.offerpsp_compute_route_staleness(si.offer_route_id)
FROM public.offerpsp_shortlists sl
WHERE sl.id = si.shortlist_id
  AND sl.status = 'shared'
  AND si.offer_route_id IS NOT NULL
  AND si.route_staleness_status
      IS DISTINCT FROM private.offerpsp_compute_route_staleness(si.offer_route_id);

-- Enqueue tasks for items that are already stale and have no pending task
INSERT INTO private.offerpsp_offer_update_queue
  (lead_id, shortlist_id, shortlist_item_id, old_route_id, trigger_event, due_at)
SELECT
  sl.lead_id,
  si.shortlist_id,
  si.id,
  si.offer_route_id,
  si.route_staleness_status,
  now() + interval '1 day'
FROM public.offerpsp_shortlist_items si
JOIN public.offerpsp_shortlists sl ON sl.id = si.shortlist_id
WHERE si.route_staleness_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM private.offerpsp_offer_update_queue q
    WHERE q.shortlist_item_id = si.id
      AND q.old_route_id = si.offer_route_id
      AND q.status IN ('pending', 'in_progress')
  );
