-- The production portal has used list_offerpsp_client_offers() since the
-- Telegram-style offer rollout. Keeping the older SECURITY DEFINER view would
-- leave a second, unnecessary client-data surface in the exposed public schema.
drop view if exists public.offerpsp_client_shortlist;
