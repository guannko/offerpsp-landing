revoke all on function public.is_offerpsp_staff() from public;
revoke execute on function public.is_offerpsp_staff() from anon;
grant execute on function public.is_offerpsp_staff() to authenticated;

revoke all on function public.touch_offerpsp_lead_activity() from public;
revoke execute on function public.touch_offerpsp_lead_activity() from anon, authenticated;

revoke all on function public.create_offerpsp_lead_intake_activity() from public;
revoke execute on function public.create_offerpsp_lead_intake_activity() from anon, authenticated;

create index if not exists offerpsp_leads_client_user_idx
  on public.offerpsp_leads(client_user_id);
create index if not exists offerpsp_activities_actor_idx
  on public.offerpsp_lead_activities(actor_user_id);
create index if not exists offerpsp_matches_psp_idx
  on public.offerpsp_matches(psp_id);
create index if not exists offerpsp_matches_reviewer_idx
  on public.offerpsp_matches(reviewed_by);
create index if not exists offerpsp_messages_conversation_idx
  on public.offerpsp_messages(conversation_id, sent_at);
create index if not exists offerpsp_messages_sender_idx
  on public.offerpsp_messages(sender_user_id);
create index if not exists offerpsp_notifications_lead_idx
  on public.offerpsp_notifications(lead_id);
create index if not exists offerpsp_notifications_recipient_idx
  on public.offerpsp_notifications(recipient_user_id);
create index if not exists offerpsp_shortlist_items_match_idx
  on public.offerpsp_shortlist_items(match_id);
create index if not exists offerpsp_shortlist_items_psp_idx
  on public.offerpsp_shortlist_items(psp_id);
create index if not exists offerpsp_shortlists_creator_idx
  on public.offerpsp_shortlists(created_by);
create index if not exists offerpsp_tasks_assignee_idx
  on public.offerpsp_tasks(assigned_to);
create index if not exists offerpsp_tasks_creator_idx
  on public.offerpsp_tasks(created_by);
