create table if not exists public.offerpsp_staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin', 'operator', 'viewer')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_offerpsp_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.offerpsp_staff_members
    where user_id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_offerpsp_staff() from public;
revoke execute on function public.is_offerpsp_staff() from anon;
grant execute on function public.is_offerpsp_staff() to authenticated;

alter table public.offerpsp_leads
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists client_user_id uuid references auth.users(id) on delete set null,
  add column if not exists quality_score smallint,
  add column if not exists quality_grade text,
  add column if not exists quality_reasons jsonb not null default '[]'::jsonb,
  add column if not exists last_activity_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'offerpsp_leads_quality_score_check'
  ) then
    alter table public.offerpsp_leads
      add constraint offerpsp_leads_quality_score_check
      check (quality_score is null or quality_score between 0 and 100);
  end if;
end
$$;

alter table public.psp_providers
  add column if not exists supported_countries text[] not null default '{}',
  add column if not exists supported_currencies text[] not null default '{}',
  add column if not exists payment_methods text[] not null default '{}',
  add column if not exists supported_verticals text[] not null default '{}',
  add column if not exists restricted_countries text[] not null default '{}',
  add column if not exists integration_types text[] not null default '{}',
  add column if not exists min_monthly_volume numeric,
  add column if not exists max_monthly_volume numeric,
  add column if not exists risk_appetite text,
  add column if not exists provider_status text not null default 'research',
  add column if not exists capabilities_verified_at timestamptz,
  add column if not exists capabilities_source text;

create table if not exists public.offerpsp_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'system'
    check (actor_type in ('staff', 'client', 'aibot', 'system')),
  activity_type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  client_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.offerpsp_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.offerpsp_leads(lead_id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'staff'
    check (source in ('staff', 'aibot', 'system', 'client')),
  title text not null,
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'cancelled', 'failed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  automation_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offerpsp_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  psp_id integer not null references public.psp_providers(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  eligibility text not null default 'review'
    check (eligibility in ('eligible', 'review', 'ineligible')),
  strengths jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  explanation text,
  algorithm_version text not null,
  model_name text,
  client_visible boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  generated_at timestamptz not null default now(),
  unique (lead_id, psp_id, algorithm_version)
);

create table if not exists public.offerpsp_shortlists (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  version integer not null default 1,
  title text not null default 'Recommended payment partners',
  introduction text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'shared', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, version)
);

create table if not exists public.offerpsp_shortlist_items (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.offerpsp_shortlists(id) on delete cascade,
  match_id uuid references public.offerpsp_matches(id) on delete set null,
  psp_id integer not null references public.psp_providers(id) on delete cascade,
  rank integer not null check (rank > 0),
  client_note text,
  created_at timestamptz not null default now(),
  unique (shortlist_id, psp_id),
  unique (shortlist_id, rank)
);

create table if not exists public.offerpsp_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  channel text not null check (channel in ('email', 'telegram', 'portal', 'phone', 'internal')),
  subject text,
  external_thread_id text,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offerpsp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.offerpsp_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('staff', 'client', 'aibot', 'system', 'psp')),
  sender_user_id uuid references auth.users(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  body text not null,
  external_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.offerpsp_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.offerpsp_leads(lead_id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'email', 'portal')),
  notification_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  external_id text,
  error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_leads_status_idx
  on public.offerpsp_leads(status, submitted_at desc);
create index if not exists offerpsp_leads_assigned_idx
  on public.offerpsp_leads(assigned_to, status);
create index if not exists offerpsp_activities_lead_idx
  on public.offerpsp_lead_activities(lead_id, created_at desc);
create index if not exists offerpsp_tasks_due_idx
  on public.offerpsp_tasks(status, due_at);
create index if not exists offerpsp_matches_lead_idx
  on public.offerpsp_matches(lead_id, score desc);
create index if not exists offerpsp_shortlists_lead_idx
  on public.offerpsp_shortlists(lead_id, created_at desc);
create index if not exists offerpsp_conversations_lead_idx
  on public.offerpsp_conversations(lead_id, updated_at desc);
create index if not exists offerpsp_notifications_pending_idx
  on public.offerpsp_notifications(status, scheduled_at);

create or replace function public.set_offerpsp_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_offerpsp_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.offerpsp_leads
  set last_activity_at = new.created_at,
      updated_at = now()
  where lead_id = new.lead_id;
  return new;
end;
$$;

create or replace function public.create_offerpsp_lead_intake_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offerpsp_lead_activities (
    lead_id,
    actor_type,
    activity_type,
    title,
    metadata
  )
  values (
    new.lead_id,
    'system',
    'lead_submitted',
    'New merchant request submitted',
    jsonb_build_object('source', new.source)
  );
  return new;
end;
$$;

drop trigger if exists offerpsp_leads_set_updated_at on public.offerpsp_leads;
create trigger offerpsp_leads_set_updated_at
before update on public.offerpsp_leads
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_staff_set_updated_at on public.offerpsp_staff_members;
create trigger offerpsp_staff_set_updated_at
before update on public.offerpsp_staff_members
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_tasks_set_updated_at on public.offerpsp_tasks;
create trigger offerpsp_tasks_set_updated_at
before update on public.offerpsp_tasks
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_shortlists_set_updated_at on public.offerpsp_shortlists;
create trigger offerpsp_shortlists_set_updated_at
before update on public.offerpsp_shortlists
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_conversations_set_updated_at on public.offerpsp_conversations;
create trigger offerpsp_conversations_set_updated_at
before update on public.offerpsp_conversations
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_activity_touch_lead on public.offerpsp_lead_activities;
create trigger offerpsp_activity_touch_lead
after insert on public.offerpsp_lead_activities
for each row execute function public.touch_offerpsp_lead_activity();

drop trigger if exists offerpsp_lead_intake_activity on public.offerpsp_leads;
create trigger offerpsp_lead_intake_activity
after insert on public.offerpsp_leads
for each row execute function public.create_offerpsp_lead_intake_activity();

revoke all on function public.touch_offerpsp_lead_activity() from public;
revoke execute on function public.touch_offerpsp_lead_activity() from anon, authenticated;
revoke all on function public.create_offerpsp_lead_intake_activity() from public;
revoke execute on function public.create_offerpsp_lead_intake_activity() from anon, authenticated;

alter table public.offerpsp_staff_members enable row level security;
alter table public.offerpsp_lead_activities enable row level security;
alter table public.offerpsp_tasks enable row level security;
alter table public.offerpsp_matches enable row level security;
alter table public.offerpsp_shortlists enable row level security;
alter table public.offerpsp_shortlist_items enable row level security;
alter table public.offerpsp_conversations enable row level security;
alter table public.offerpsp_messages enable row level security;
alter table public.offerpsp_notifications enable row level security;

drop policy if exists offerpsp_staff_read on public.offerpsp_staff_members;
create policy offerpsp_staff_read
on public.offerpsp_staff_members for select to authenticated
using (user_id = auth.uid() or public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_manage on public.offerpsp_staff_members;
create policy offerpsp_staff_manage
on public.offerpsp_staff_members for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_select_leads on public.offerpsp_leads;
create policy offerpsp_staff_select_leads
on public.offerpsp_leads for select to authenticated
using (public.is_offerpsp_staff() or client_user_id = auth.uid());

drop policy if exists offerpsp_staff_update_leads on public.offerpsp_leads;
create policy offerpsp_staff_update_leads
on public.offerpsp_leads for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_delete_leads on public.offerpsp_leads;
create policy offerpsp_staff_delete_leads
on public.offerpsp_leads for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_activities_staff_all on public.offerpsp_lead_activities;
create policy offerpsp_activities_staff_all
on public.offerpsp_lead_activities for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_activities_client_read on public.offerpsp_lead_activities;
create policy offerpsp_activities_client_read
on public.offerpsp_lead_activities for select to authenticated
using (
  client_visible
  and exists (
    select 1 from public.offerpsp_leads l
    where l.lead_id = offerpsp_lead_activities.lead_id
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_tasks_staff_all on public.offerpsp_tasks;
create policy offerpsp_tasks_staff_all
on public.offerpsp_tasks for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_matches_staff_all on public.offerpsp_matches;
create policy offerpsp_matches_staff_all
on public.offerpsp_matches for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_matches_client_read on public.offerpsp_matches;
create policy offerpsp_matches_client_read
on public.offerpsp_matches for select to authenticated
using (
  client_visible
  and exists (
    select 1 from public.offerpsp_leads l
    where l.lead_id = offerpsp_matches.lead_id
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_shortlists_staff_all on public.offerpsp_shortlists;
create policy offerpsp_shortlists_staff_all
on public.offerpsp_shortlists for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_shortlists_client_read on public.offerpsp_shortlists;
create policy offerpsp_shortlists_client_read
on public.offerpsp_shortlists for select to authenticated
using (
  status = 'shared'
  and exists (
    select 1 from public.offerpsp_leads l
    where l.lead_id = offerpsp_shortlists.lead_id
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_shortlist_items_staff_all on public.offerpsp_shortlist_items;
create policy offerpsp_shortlist_items_staff_all
on public.offerpsp_shortlist_items for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_shortlist_items_client_read on public.offerpsp_shortlist_items;
create policy offerpsp_shortlist_items_client_read
on public.offerpsp_shortlist_items for select to authenticated
using (
  exists (
    select 1
    from public.offerpsp_shortlists s
    join public.offerpsp_leads l on l.lead_id = s.lead_id
    where s.id = offerpsp_shortlist_items.shortlist_id
      and s.status = 'shared'
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_conversations_staff_all on public.offerpsp_conversations;
create policy offerpsp_conversations_staff_all
on public.offerpsp_conversations for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_conversations_client_read on public.offerpsp_conversations;
create policy offerpsp_conversations_client_read
on public.offerpsp_conversations for select to authenticated
using (
  client_visible
  and exists (
    select 1 from public.offerpsp_leads l
    where l.lead_id = offerpsp_conversations.lead_id
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_messages_staff_all on public.offerpsp_messages;
create policy offerpsp_messages_staff_all
on public.offerpsp_messages for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_messages_client_read on public.offerpsp_messages;
create policy offerpsp_messages_client_read
on public.offerpsp_messages for select to authenticated
using (
  exists (
    select 1
    from public.offerpsp_conversations c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where c.id = offerpsp_messages.conversation_id
      and c.client_visible
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_messages_client_insert on public.offerpsp_messages;
create policy offerpsp_messages_client_insert
on public.offerpsp_messages for insert to authenticated
with check (
  sender_type = 'client'
  and sender_user_id = auth.uid()
  and direction = 'inbound'
  and exists (
    select 1
    from public.offerpsp_conversations c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where c.id = offerpsp_messages.conversation_id
      and c.client_visible
      and l.client_user_id = auth.uid()
  )
);

drop policy if exists offerpsp_notifications_staff_all on public.offerpsp_notifications;
create policy offerpsp_notifications_staff_all
on public.offerpsp_notifications for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_notifications_recipient_read on public.offerpsp_notifications;
create policy offerpsp_notifications_recipient_read
on public.offerpsp_notifications for select to authenticated
using (recipient_user_id = auth.uid());

create or replace view public.offerpsp_conversion_summary
with (security_invoker = true)
as
select
  status,
  count(*)::bigint as lead_count,
  round(
    count(*)::numeric * 100 / nullif(sum(count(*)) over (), 0),
    1
  ) as share_percent
from public.offerpsp_leads
group by status;

grant select on public.offerpsp_conversion_summary to authenticated;
