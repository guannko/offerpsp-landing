-- RLS already restricts UPDATE and DELETE to active OfferPSP staff.
-- Table privileges must exist before PostgreSQL evaluates those policies.
grant update, delete on table public.offerpsp_leads to authenticated;
