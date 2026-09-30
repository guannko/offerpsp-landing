-- Complete the public merchant brief without weakening the existing service-only
-- intake RPC. Structured fields travel inside the preserved attribution envelope
-- and are copied into canonical lead columns only for created or verified-merge
-- submissions. Identity-review submissions never overwrite an existing company.

alter table public.offerpsp_leads
  add column if not exists average_ticket_amount numeric,
  add column if not exists average_ticket_currency text,
  add column if not exists profile_unknown_fields text[] not null default '{}';

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_average_ticket_check;
alter table public.offerpsp_leads
  add constraint offerpsp_leads_average_ticket_check
  check (average_ticket_amount is null or average_ticket_amount >= 0);

create or replace function private.offerpsp_apply_intake_brief()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_brief jsonb := new.payload #> '{attribution,intake_brief}';
  v_geos text[];
  v_currencies text[];
  v_flows text[];
  v_methods text[];
  v_traffic text[];
  v_unknown text[];
  v_volume numeric;
  v_ticket numeric;
begin
  if new.disposition not in ('created', 'merged')
      or v_brief is null or jsonb_typeof(v_brief) <> 'object' then
    return new;
  end if;

  v_geos := private.offerpsp_jsonb_text_array(v_brief -> 'target_geos');
  v_currencies := private.offerpsp_jsonb_text_array(v_brief -> 'requested_currencies');
  v_flows := private.offerpsp_jsonb_text_array(v_brief -> 'requested_flows');
  v_methods := private.offerpsp_jsonb_text_array(v_brief -> 'requested_methods');
  v_traffic := private.offerpsp_jsonb_text_array(v_brief -> 'traffic_types');
  select coalesce(array_agg(distinct lower(trim(item)) order by lower(trim(item))), '{}'::text[])
    into v_unknown
  from jsonb_array_elements_text(coalesce(v_brief -> 'profile_unknown_fields', '[]'::jsonb)) item
  where nullif(trim(item), '') is not null;
  v_volume := private.offerpsp_jsonb_numeric(v_brief, 'expected_monthly_volume');
  v_ticket := private.offerpsp_jsonb_numeric(v_brief, 'average_ticket_amount');

  update public.offerpsp_leads lead set
    target_geos = case when new.disposition = 'created' then v_geos when cardinality(lead.target_geos) = 0 and cardinality(v_geos) > 0 then v_geos else lead.target_geos end,
    requested_currencies = case when new.disposition = 'created' then v_currencies when cardinality(lead.requested_currencies) = 0 and cardinality(v_currencies) > 0 then v_currencies else lead.requested_currencies end,
    requested_flows = case when new.disposition = 'created' then v_flows when cardinality(lead.requested_flows) = 0 and cardinality(v_flows) > 0 then v_flows else lead.requested_flows end,
    requested_methods = case when new.disposition = 'created' then v_methods when cardinality(lead.requested_methods) = 0 and cardinality(v_methods) > 0 then v_methods else lead.requested_methods end,
    traffic_types = case when new.disposition = 'created' then v_traffic when cardinality(lead.traffic_types) = 0 and cardinality(v_traffic) > 0 then v_traffic else lead.traffic_types end,
    expected_monthly_volume = case when new.disposition = 'created' then v_volume else coalesce(lead.expected_monthly_volume, v_volume) end,
    volume_currency = case when new.disposition = 'created' then nullif(upper(trim(v_brief ->> 'volume_currency')), '') else coalesce(nullif(trim(lead.volume_currency), ''), nullif(upper(trim(v_brief ->> 'volume_currency')), '')) end,
    average_ticket_amount = case when new.disposition = 'created' then v_ticket else coalesce(lead.average_ticket_amount, v_ticket) end,
    average_ticket_currency = case when new.disposition = 'created' then nullif(upper(trim(v_brief ->> 'average_ticket_currency')), '') else coalesce(nullif(trim(lead.average_ticket_currency), ''), nullif(upper(trim(v_brief ->> 'average_ticket_currency')), '')) end,
    license_status = case when new.disposition = 'created' then nullif(trim(v_brief ->> 'license_status'), '') else coalesce(nullif(trim(lead.license_status), ''), nullif(trim(v_brief ->> 'license_status'), '')) end,
    profile_unknown_fields = (
      select coalesce(array_agg(distinct value order by value), '{}'::text[])
      from unnest(coalesce(lead.profile_unknown_fields, '{}'::text[]) || coalesce(v_unknown, '{}'::text[])) value
      where nullif(trim(value), '') is not null
    ),
    qualification_notes = case
      when lead.qualification_notes is null and v_brief ->> 'license_status' = 'not_required'
        then 'Public intake states that a licence is not required; this claim is not independently verified.'
      else lead.qualification_notes
    end,
    updated_at = now()
  where lead.lead_id = new.lead_id;

  return new;
end;
$$;

revoke all on function private.offerpsp_apply_intake_brief()
  from public, anon, authenticated, service_role;

drop trigger if exists offerpsp_apply_intake_brief on private.offerpsp_intake_submissions;
create trigger offerpsp_apply_intake_brief
after insert on private.offerpsp_intake_submissions
for each row execute function private.offerpsp_apply_intake_brief();

-- Keep the staff editor aligned with the canonical brief fields.
create or replace function public.save_offerpsp_managed_merchant(
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_leads;
  v_after public.offerpsp_leads;
  v_status text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Merchant payload must be an object'; end if;
  select * into v_before from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'OfferPSP merchant not found'; end if;

  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), v_before.status);
  if v_status not in (
    'new', 'qualifying', 'needs_clarification', 'matching', 'matched',
    'shortlist_ready', 'shared', 'option_selected', 'dossier_ready',
    'provider_reviewing', 'provider_needs_info', 'provider_accepted',
    'provider_declined', 'telegram_created', 'zoom_scheduled',
    'negotiating', 'won', 'lost', 'closed', 'spam'
  ) then raise exception 'Unsupported merchant status'; end if;

  update public.offerpsp_leads
  set company = coalesce(nullif(trim(p_payload ->> 'company'), ''), company),
      name = coalesce(nullif(trim(p_payload ->> 'name'), ''), name),
      work_email = coalesce(nullif(lower(trim(p_payload ->> 'work_email')), ''), work_email),
      telegram = case when p_payload ? 'telegram' then nullif(trim(p_payload ->> 'telegram'), '') else telegram end,
      company_url = case when p_payload ? 'company_url' then nullif(trim(p_payload ->> 'company_url'), '') else company_url end,
      vertical = coalesce(nullif(trim(p_payload ->> 'vertical'), ''), vertical),
      monthly_volume = case when p_payload ? 'monthly_volume' then nullif(trim(p_payload ->> 'monthly_volume'), '') else monthly_volume end,
      geos = coalesce(nullif(trim(p_payload ->> 'geos'), ''), geos),
      methods = case when p_payload ? 'methods' then nullif(trim(p_payload ->> 'methods'), '') else methods end,
      details = case when p_payload ? 'details' then nullif(trim(p_payload ->> 'details'), '') else details end,
      status = v_status,
      utm_source = case when p_payload ? 'utm_source' then nullif(trim(p_payload ->> 'utm_source'), '') else utm_source end,
      utm_campaign = case when p_payload ? 'utm_campaign' then nullif(trim(p_payload ->> 'utm_campaign'), '') else utm_campaign end,
      assigned_to = case when p_payload ? 'assigned_to' then nullif(trim(p_payload ->> 'assigned_to'), '')::uuid else assigned_to end,
      quality_score = case when p_payload ? 'quality_score' then private.offerpsp_jsonb_numeric(p_payload, 'quality_score')::smallint else quality_score end,
      quality_grade = case when p_payload ? 'quality_grade' then nullif(trim(p_payload ->> 'quality_grade'), '') else quality_grade end,
      registration_geo = case when p_payload ? 'registration_geo' then nullif(trim(p_payload ->> 'registration_geo'), '') else registration_geo end,
      target_geos = case when p_payload ? 'target_geos' then private.offerpsp_jsonb_text_array(p_payload -> 'target_geos') else target_geos end,
      requested_currencies = case when p_payload ? 'requested_currencies' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_currencies') else requested_currencies end,
      requested_flows = case when p_payload ? 'requested_flows' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_flows') else requested_flows end,
      requested_methods = case when p_payload ? 'requested_methods' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_methods') else requested_methods end,
      traffic_types = case when p_payload ? 'traffic_types' then private.offerpsp_jsonb_text_array(p_payload -> 'traffic_types') else traffic_types end,
      expected_monthly_volume = case when p_payload ? 'expected_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'expected_monthly_volume') else expected_monthly_volume end,
      volume_currency = case when p_payload ? 'volume_currency' then nullif(upper(trim(p_payload ->> 'volume_currency')), '') else volume_currency end,
      average_ticket_amount = case when p_payload ? 'average_ticket_amount' then private.offerpsp_jsonb_numeric(p_payload, 'average_ticket_amount') else average_ticket_amount end,
      average_ticket_currency = case when p_payload ? 'average_ticket_currency' then nullif(upper(trim(p_payload ->> 'average_ticket_currency')), '') else average_ticket_currency end,
      min_transaction_amount = case when p_payload ? 'min_transaction_amount' then private.offerpsp_jsonb_numeric(p_payload, 'min_transaction_amount') else min_transaction_amount end,
      max_transaction_amount = case when p_payload ? 'max_transaction_amount' then private.offerpsp_jsonb_numeric(p_payload, 'max_transaction_amount') else max_transaction_amount end,
      transaction_currency = case when p_payload ? 'transaction_currency' then nullif(upper(trim(p_payload ->> 'transaction_currency')), '') else transaction_currency end,
      business_model = case when p_payload ? 'business_model' then nullif(trim(p_payload ->> 'business_model'), '') else business_model end,
      license_status = case when p_payload ? 'license_status' then nullif(trim(p_payload ->> 'license_status'), '') else license_status end,
      license_jurisdiction = case when p_payload ? 'license_jurisdiction' then nullif(trim(p_payload ->> 'license_jurisdiction'), '') else license_jurisdiction end,
      license_number = case when p_payload ? 'license_number' then nullif(trim(p_payload ->> 'license_number'), '') else license_number end,
      license_evidence_url = case when p_payload ? 'license_evidence_url' then nullif(trim(p_payload ->> 'license_evidence_url'), '') else license_evidence_url end,
      launch_timeline = case when p_payload ? 'launch_timeline' then nullif(trim(p_payload ->> 'launch_timeline'), '') else launch_timeline end,
      current_processing_setup = case when p_payload ? 'current_processing_setup' then nullif(trim(p_payload ->> 'current_processing_setup'), '') else current_processing_setup end,
      qualification_notes = case when p_payload ? 'qualification_notes' then nullif(trim(p_payload ->> 'qualification_notes'), '') else qualification_notes end,
      merchant_organization_id = case when p_payload ? 'merchant_organization_id' then nullif(trim(p_payload ->> 'merchant_organization_id'), '')::uuid else merchant_organization_id end,
      agent_organization_id = case when p_payload ? 'agent_organization_id' then nullif(trim(p_payload ->> 'agent_organization_id'), '')::uuid else agent_organization_id end,
      updated_at = now()
  where lead_id = p_lead_id returning * into v_after;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('merchant', p_lead_id::text, 'updated', auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  insert into public.offerpsp_lead_activities(lead_id, actor_user_id, actor_type, activity_type, title, metadata)
  values (p_lead_id, auth.uid(), 'staff', 'merchant_record_updated', 'Merchant record updated',
    jsonb_build_object('changed_fields', coalesce((select jsonb_agg(key) from jsonb_each(p_payload)), '[]'::jsonb)));
  return to_jsonb(v_after);
end;
$$;

revoke all on function public.save_offerpsp_managed_merchant(uuid, jsonb) from public, anon;
grant execute on function public.save_offerpsp_managed_merchant(uuid, jsonb) to authenticated;

-- QA fixtures remain durable golden scenarios but must never create ordinary
-- Operations work. The trigger covers both registered fixture IDs and the two
-- explicit fixture markers used by controlled public-intake tests.
create or replace function private.offerpsp_task_is_qa_fixture(
  p_lead_id uuid,
  p_title text,
  p_details text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1 from private.offerpsp_qa_fixture_entities fixture
    where fixture.entity_type = 'merchant' and fixture.entity_id = p_lead_id
  ) or lower(concat_ws(' ', p_title, p_details)) ~ '(paysiski|winpiski)';
$$;

revoke all on function private.offerpsp_task_is_qa_fixture(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.offerpsp_guard_qa_operational_task()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if private.offerpsp_task_is_qa_fixture(new.lead_id, new.title, new.details) then
    new.status := 'cancelled';
    new.completed_at := coalesce(new.completed_at, now());
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'qa_fixture_suppressed', true,
      'qa_fixture_suppressed_at', now()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.offerpsp_guard_qa_operational_task()
  from public, anon, authenticated, service_role;

drop trigger if exists offerpsp_guard_qa_operational_task on public.offerpsp_tasks;
create trigger offerpsp_guard_qa_operational_task
before insert or update of lead_id, title, details, status
on public.offerpsp_tasks
for each row execute function private.offerpsp_guard_qa_operational_task();

update public.offerpsp_tasks task set
  status = 'cancelled',
  completed_at = coalesce(task.completed_at, now()),
  updated_at = now(),
  metadata = coalesce(task.metadata, '{}'::jsonb) || jsonb_build_object(
    'qa_fixture_suppressed', true,
    'qa_fixture_suppressed_at', now()
  )
where task.status in ('pending', 'in_progress')
  and private.offerpsp_task_is_qa_fixture(task.lead_id, task.title, task.details);

-- Make token lifecycle explicit and run a small hourly cleanup. Existing
-- execution guards remain in place; this only removes misleading active=true.
alter table private.offerpsp_telegram_intake_actions
  add column if not exists status text not null default 'active';

alter table private.offerpsp_telegram_intake_actions
  drop constraint if exists offerpsp_telegram_intake_actions_status_check;
alter table private.offerpsp_telegram_intake_actions
  add constraint offerpsp_telegram_intake_actions_status_check
  check (status in ('active', 'consumed', 'expired', 'superseded'));

create or replace function private.offerpsp_sync_telegram_action_status()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.receipt ->> 'outcome' = 'expired' or (new.receipt is null and new.expires_at <= now()) then
    new.status := 'expired';
    new.active := false;
  elsif new.receipt is not null or new.consumed_at is not null then
    new.status := 'consumed';
    new.active := false;
  elsif not new.active then
    new.status := 'superseded';
  else
    new.status := 'active';
  end if;
  return new;
end;
$$;

revoke all on function private.offerpsp_sync_telegram_action_status()
  from public, anon, authenticated, service_role;

drop trigger if exists offerpsp_sync_telegram_action_status on private.offerpsp_telegram_intake_actions;
create trigger offerpsp_sync_telegram_action_status
before insert or update on private.offerpsp_telegram_intake_actions
for each row execute function private.offerpsp_sync_telegram_action_status();

update private.offerpsp_telegram_intake_actions
set status = case
  when receipt ->> 'outcome' = 'expired' or (receipt is null and expires_at <= now()) then 'expired'
  when receipt is not null or consumed_at is not null then 'consumed'
  when not active then 'superseded'
  else 'active'
end,
active = case when receipt is null and consumed_at is null and expires_at > now() then active else false end;

create or replace function private.offerpsp_cleanup_expired_telegram_actions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_count integer;
begin
  update private.offerpsp_telegram_intake_actions
  set active = false, status = 'expired'
  where active and receipt is null and consumed_at is null and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.offerpsp_cleanup_expired_telegram_actions()
  from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'offerpsp-expire-telegram-actions') then
    perform cron.schedule(
      'offerpsp-expire-telegram-actions',
      '7 * * * *',
      'select private.offerpsp_cleanup_expired_telegram_actions();'
    );
  end if;
end;
$$;
