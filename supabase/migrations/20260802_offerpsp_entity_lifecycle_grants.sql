-- Supabase applies explicit Data API grants to newly created public functions.
-- Keep these management RPCs available only to signed-in users; every RPC also
-- enforces the OfferPSP staff/owner boundary internally.
revoke execute on function public.get_offerpsp_management_registry() from anon;
revoke execute on function public.save_offerpsp_managed_provider(uuid, jsonb) from anon;
revoke execute on function public.save_offerpsp_managed_merchant(uuid, jsonb) from anon;
revoke execute on function public.set_offerpsp_merchant_record_state(uuid, text, text) from anon;
revoke execute on function public.purge_offerpsp_merchant(uuid, text) from anon;
revoke execute on function public.save_offerpsp_organization(uuid, text, jsonb) from anon;
revoke execute on function public.set_offerpsp_agent_assignment(uuid, uuid, text) from anon;
revoke execute on function public.set_offerpsp_agent_margin_policy(uuid, uuid, text, text, numeric, numeric, text, text) from anon;
revoke execute on function public.create_offerpsp_manual_route(uuid, jsonb) from anon;
revoke execute on function public.revise_offerpsp_route(uuid) from anon;
revoke execute on function public.deactivate_offerpsp_margin_policy(uuid, text) from anon;

