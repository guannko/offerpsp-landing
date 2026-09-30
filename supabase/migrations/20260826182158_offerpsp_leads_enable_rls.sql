-- The original shared project enabled this outside the OfferPSP migration chain.
-- Dedicated projects must enforce the existing staff/client policies explicitly.
alter table public.offerpsp_leads enable row level security;
