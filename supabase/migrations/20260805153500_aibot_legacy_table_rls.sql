alter table public.casino_leads enable row level security;
alter table public.psp_providers enable row level security;
alter table public.bot_tasks enable row level security;
alter table public.chat_logs enable row level security;
alter table public.email_drafts enable row level security;

revoke all on table public.casino_leads from anon, authenticated;
revoke all on table public.psp_providers from anon, authenticated;
revoke all on table public.bot_tasks from anon, authenticated;
revoke all on table public.chat_logs from anon, authenticated;
revoke all on table public.email_drafts from anon, authenticated;

grant select, insert, update, delete on table public.casino_leads to service_role;
grant select, insert, update, delete on table public.psp_providers to service_role;
grant select, insert, update, delete on table public.bot_tasks to service_role;
grant select, insert, update, delete on table public.chat_logs to service_role;
grant select, insert, update, delete on table public.email_drafts to service_role;

revoke all on sequence public.casino_leads_id_seq from anon, authenticated;
revoke all on sequence public.psp_providers_id_seq from anon, authenticated;
revoke all on sequence public.bot_tasks_id_seq from anon, authenticated;
revoke all on sequence public.chat_logs_id_seq from anon, authenticated;
revoke all on sequence public.email_drafts_id_seq from anon, authenticated;

grant usage, select on sequence public.casino_leads_id_seq to service_role;
grant usage, select on sequence public.psp_providers_id_seq to service_role;
grant usage, select on sequence public.bot_tasks_id_seq to service_role;
grant usage, select on sequence public.chat_logs_id_seq to service_role;
grant usage, select on sequence public.email_drafts_id_seq to service_role;
