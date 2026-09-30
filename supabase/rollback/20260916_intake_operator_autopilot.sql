-- Coordinated rollback: first restore n8n graphs using the companion rollback manifest.
-- Do not delete tasks, drafts, delivery records or callback receipts.
alter table public.offerpsp_leads disable trigger offerpsp_lead_operator_task;
alter table public.offerpsp_leads disable trigger offerpsp_finish_intake_task;
update private.offerpsp_telegram_operators set enabled=false;
revoke execute on function public.authorize_offerpsp_telegram_operator(text,text) from service_role;
revoke execute on function public.prepare_offerpsp_telegram_intake_card(uuid) from service_role;
revoke execute on function public.execute_offerpsp_telegram_intake_action(uuid,text,text) from service_role;
revoke execute on function public.claim_offerpsp_telegram_intake_card(uuid) from service_role;
revoke execute on function public.complete_offerpsp_telegram_intake_card(uuid,text,text) from service_role;
