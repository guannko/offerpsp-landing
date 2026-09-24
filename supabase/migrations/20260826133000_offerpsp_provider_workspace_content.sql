-- Provider-owned supply intake and future-catalogue content.
-- Everything remains private and RPC-scoped; providers cannot publish offers or updates.

create table if not exists public.offerpsp_provider_profile_details (
  provider_id uuid primary key references private.offerpsp_providers(id) on delete cascade,
  company_description text,
  headquarters_country text,
  founded_year integer check (founded_year is null or founded_year between 1900 and 2200),
  operating_geos text[] not null default '{}',
  supported_currencies text[] not null default '{}',
  payment_methods text[] not null default '{}',
  card_schemes text[] not null default '{}',
  supported_verticals text[] not null default '{}',
  prohibited_verticals text[] not null default '{}',
  integrations text[] not null default '{}',
  settlement_currencies text[] not null default '{}',
  support_languages text[] not null default '{}',
  licences jsonb not null default '[]'::jsonb check (jsonb_typeof(licences) = 'array'),
  compliance_summary text,
  onboarding_requirements text,
  onboarding_sla text,
  api_docs_url text,
  public_summary text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offerpsp_provider_updates (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  update_type text not null default 'general'
    check (update_type in ('general','product','coverage','pricing','compliance','integration','maintenance')),
  title text not null,
  body text not null,
  effective_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or effective_at is null or expires_at >= effective_at)
);

create index if not exists offerpsp_provider_updates_provider_idx
  on public.offerpsp_provider_updates(provider_id, status, created_at desc);

alter table public.offerpsp_provider_profile_details enable row level security;
alter table public.offerpsp_provider_updates enable row level security;
revoke all on table public.offerpsp_provider_profile_details from public, anon, authenticated;
revoke all on table public.offerpsp_provider_updates from public, anon, authenticated;

drop trigger if exists offerpsp_provider_profile_details_set_updated_at
  on public.offerpsp_provider_profile_details;
create trigger offerpsp_provider_profile_details_set_updated_at
before update on public.offerpsp_provider_profile_details
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_provider_updates_set_updated_at
  on public.offerpsp_provider_updates;
create trigger offerpsp_provider_updates_set_updated_at
before update on public.offerpsp_provider_updates
for each row execute function public.set_offerpsp_updated_at();

alter table private.offerpsp_provider_contacts
  add column if not exists provider_supplied_notes text,
  add column if not exists created_by_provider_user uuid references auth.users(id) on delete set null;

create or replace function public.can_access_offerpsp_provider_workspace(
  p_provider_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select private.is_offerpsp_provider_member(p_provider_id, p_roles);
$$;

revoke all on function public.can_access_offerpsp_provider_workspace(uuid,text[]) from public, anon;
grant execute on function public.can_access_offerpsp_provider_workspace(uuid,text[]) to authenticated;

create or replace function public.offerpsp_provider_source_path_access(
  p_object_name text,
  p_require_uploader boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider_id uuid;
  v_uploader_id uuid;
begin
  if split_part(p_object_name, '/', 1) <> 'providers' then return false; end if;
  begin
    v_provider_id := split_part(p_object_name, '/', 2)::uuid;
    v_uploader_id := split_part(p_object_name, '/', 3)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if p_require_uploader and v_uploader_id <> auth.uid() then return false; end if;
  return private.is_offerpsp_provider_member(
    v_provider_id,
    case when p_require_uploader then array['owner','admin','editor']::text[] else null end
  );
end;
$$;

revoke all on function public.offerpsp_provider_source_path_access(text,boolean) from public, anon;
grant execute on function public.offerpsp_provider_source_path_access(text,boolean) to authenticated;

drop policy if exists offerpsp_provider_read_private_sources on storage.objects;
create policy offerpsp_provider_read_private_sources
on storage.objects for select to authenticated
using (
  bucket_id = 'offerpsp-private-sources'
  and public.offerpsp_provider_source_path_access(name, false)
);

drop policy if exists offerpsp_provider_upload_private_sources on storage.objects;
create policy offerpsp_provider_upload_private_sources
on storage.objects for insert to authenticated
with check (
  bucket_id = 'offerpsp-private-sources'
  and public.offerpsp_provider_source_path_access(name, true)
);

drop policy if exists offerpsp_provider_delete_private_sources on storage.objects;
create policy offerpsp_provider_delete_private_sources
on storage.objects for delete to authenticated
using (
  bucket_id = 'offerpsp-private-sources'
  and public.offerpsp_provider_source_path_access(name, true)
);

create or replace function public.enqueue_offerpsp_provider_source(
  p_provider_id uuid,
  p_source_text text,
  p_source_kind text default 'text',
  p_source_reference text default null,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_job private.offerpsp_ingestion_jobs;
  v_provider private.offerpsp_providers;
  v_source_type text;
  v_reference text := nullif(trim(p_source_reference), '');
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  if p_source_kind not in ('text','file') then raise exception 'Unsupported provider source kind'; end if;
  if nullif(trim(p_source_text), '') is null then raise exception 'Offer source text is required'; end if;
  if length(p_source_text) > 1000000 then raise exception 'Offer source text exceeds 1 MB'; end if;
  if jsonb_typeof(coalesce(p_source_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Source metadata must be a JSON object';
  end if;
  select * into v_provider from private.offerpsp_providers where id = p_provider_id;
  if not found then raise exception 'PSP provider not found'; end if;

  v_source_type := case when p_source_kind = 'file' then 'admin_file' else 'admin_text' end;
  if p_source_kind = 'file' and (
    v_reference is null
    or v_reference not like 'storage://offerpsp-private-sources/providers/' || p_provider_id::text || '/' || auth.uid()::text || '/%'
  ) then
    raise exception 'Provider source file path is invalid';
  end if;

  select * into v_job
  from private.offerpsp_ingestion_jobs
  where provider_id = p_provider_id
    and source_type = v_source_type
    and source_hash = md5(p_source_text)
    and coalesce(source_reference, '') = coalesce(v_reference, '')
    and status not in ('failed','dismissed')
    and received_at >= now() - interval '10 minutes'
  order by received_at desc
  limit 1;
  if found then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'duplicate', true, 'batch_id', v_job.batch_id);
  end if;

  insert into private.offerpsp_ingestion_jobs(
    provider_id, provider_name, source_type, source_reference, source_text,
    source_metadata, received_by
  ) values (
    p_provider_id, v_provider.brand_name, v_source_type, v_reference, p_source_text,
    coalesce(p_source_metadata, '{}'::jsonb) || jsonb_build_object(
      'entrypoint', 'provider_portal',
      'submitted_by_provider', true,
      'publication_allowed', false
    ), auth.uid()
  ) returning * into v_job;

  insert into private.offerpsp_supply_activities(
    provider_id, actor_user_id, action_type, summary, after_state
  ) values (
    p_provider_id, auth.uid(), 'provider_source_queued',
    'PSP submitted a source for automated parsing and staff review',
    jsonb_build_object('job_id', v_job.id, 'source_type', v_source_type, 'source_reference', v_reference)
  );

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'duplicate', false, 'provider_id', p_provider_id);
end;
$$;

create or replace function public.save_offerpsp_provider_portal_profile(
  p_provider_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_providers;
  v_after private.offerpsp_providers;
  v_details public.offerpsp_provider_profile_details;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP manager access required';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'Profile payload must be an object'; end if;
  select * into v_before from private.offerpsp_providers where id = p_provider_id for update;
  if not found then raise exception 'PSP provider not found'; end if;
  if nullif(trim(p_payload ->> 'brand_name'), '') is null then raise exception 'PSP brand name is required'; end if;

  update private.offerpsp_providers
  set brand_name = trim(p_payload ->> 'brand_name'),
      legal_name = nullif(trim(p_payload ->> 'legal_name'), ''),
      website = nullif(trim(p_payload ->> 'website'), ''),
      updated_at = now()
  where id = p_provider_id returning * into v_after;

  insert into public.offerpsp_provider_profile_details(
    provider_id, company_description, headquarters_country, founded_year,
    operating_geos, supported_currencies, payment_methods, card_schemes,
    supported_verticals, prohibited_verticals, integrations, settlement_currencies,
    support_languages, licences, compliance_summary, onboarding_requirements,
    onboarding_sla, api_docs_url, public_summary, updated_by
  ) values (
    p_provider_id, nullif(trim(p_payload ->> 'company_description'), ''),
    nullif(upper(trim(p_payload ->> 'headquarters_country')), ''),
    private.offerpsp_jsonb_numeric(p_payload, 'founded_year')::integer,
    private.offerpsp_jsonb_text_array(p_payload -> 'operating_geos'),
    private.offerpsp_jsonb_text_array(p_payload -> 'supported_currencies'),
    private.offerpsp_jsonb_text_array(p_payload -> 'payment_methods'),
    private.offerpsp_jsonb_text_array(p_payload -> 'card_schemes'),
    private.offerpsp_jsonb_text_array(p_payload -> 'supported_verticals'),
    private.offerpsp_jsonb_text_array(p_payload -> 'prohibited_verticals'),
    private.offerpsp_jsonb_text_array(p_payload -> 'integrations'),
    private.offerpsp_jsonb_text_array(p_payload -> 'settlement_currencies'),
    private.offerpsp_jsonb_text_array(p_payload -> 'support_languages'),
    case when jsonb_typeof(p_payload -> 'licences') = 'array' then p_payload -> 'licences' else '[]'::jsonb end,
    nullif(trim(p_payload ->> 'compliance_summary'), ''),
    nullif(trim(p_payload ->> 'onboarding_requirements'), ''),
    nullif(trim(p_payload ->> 'onboarding_sla'), ''),
    nullif(trim(p_payload ->> 'api_docs_url'), ''),
    nullif(trim(p_payload ->> 'public_summary'), ''), auth.uid()
  )
  on conflict (provider_id) do update set
    company_description = excluded.company_description,
    headquarters_country = excluded.headquarters_country,
    founded_year = excluded.founded_year,
    operating_geos = excluded.operating_geos,
    supported_currencies = excluded.supported_currencies,
    payment_methods = excluded.payment_methods,
    card_schemes = excluded.card_schemes,
    supported_verticals = excluded.supported_verticals,
    prohibited_verticals = excluded.prohibited_verticals,
    integrations = excluded.integrations,
    settlement_currencies = excluded.settlement_currencies,
    support_languages = excluded.support_languages,
    licences = excluded.licences,
    compliance_summary = excluded.compliance_summary,
    onboarding_requirements = excluded.onboarding_requirements,
    onboarding_sla = excluded.onboarding_sla,
    api_docs_url = excluded.api_docs_url,
    public_summary = excluded.public_summary,
    updated_by = auth.uid(), updated_at = now()
  returning * into v_details;

  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, before_state, after_state)
  values (p_provider_id, auth.uid(), 'provider_profile_updated', 'PSP profile updated through provider portal', to_jsonb(v_before), to_jsonb(v_after) || jsonb_build_object('details', to_jsonb(v_details)));
  return jsonb_build_object('provider', to_jsonb(v_after), 'profile', to_jsonb(v_details));
end;
$$;

create or replace function public.save_offerpsp_provider_portal_contact(
  p_provider_id uuid,
  p_contact_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_contact private.offerpsp_provider_contacts;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then raise exception 'PSP manager access required'; end if;
  if nullif(trim(p_payload ->> 'full_name'), '') is null then raise exception 'Contact name is required'; end if;
  if nullif(trim(p_payload ->> 'telegram'), '') is null and nullif(trim(p_payload ->> 'email'), '') is null and nullif(trim(p_payload ->> 'phone'), '') is null then
    raise exception 'Contact channel is required';
  end if;
  if p_contact_id is null then
    insert into private.offerpsp_provider_contacts(
      provider_id, full_name, role_title, region, telegram, email, phone, timezone,
      preferred_channel, active, provider_supplied_notes, created_by_provider_user
    ) values (
      p_provider_id, trim(p_payload ->> 'full_name'), nullif(trim(p_payload ->> 'role_title'), ''),
      nullif(trim(p_payload ->> 'region'), ''), nullif(trim(p_payload ->> 'telegram'), ''),
      nullif(lower(trim(p_payload ->> 'email')), ''), nullif(trim(p_payload ->> 'phone'), ''),
      nullif(trim(p_payload ->> 'timezone'), ''), nullif(trim(p_payload ->> 'preferred_channel'), ''),
      coalesce((p_payload ->> 'active')::boolean, true), nullif(trim(p_payload ->> 'notes'), ''), auth.uid()
    ) returning * into v_contact;
  else
    update private.offerpsp_provider_contacts set
      full_name = trim(p_payload ->> 'full_name'), role_title = nullif(trim(p_payload ->> 'role_title'), ''),
      region = nullif(trim(p_payload ->> 'region'), ''), telegram = nullif(trim(p_payload ->> 'telegram'), ''),
      email = nullif(lower(trim(p_payload ->> 'email')), ''), phone = nullif(trim(p_payload ->> 'phone'), ''),
      timezone = nullif(trim(p_payload ->> 'timezone'), ''), preferred_channel = nullif(trim(p_payload ->> 'preferred_channel'), ''),
      active = coalesce((p_payload ->> 'active')::boolean, true), provider_supplied_notes = nullif(trim(p_payload ->> 'notes'), ''), updated_at = now()
    where id = p_contact_id and provider_id = p_provider_id returning * into v_contact;
    if not found then raise exception 'PSP contact not found'; end if;
  end if;
  return to_jsonb(v_contact) - 'notes';
end;
$$;

create or replace function public.save_offerpsp_provider_update(
  p_provider_id uuid,
  p_update_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_update public.offerpsp_provider_updates;
  v_type text := coalesce(nullif(lower(trim(p_payload ->> 'update_type')), ''), 'general');
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then raise exception 'PSP manager access required'; end if;
  if v_type not in ('general','product','coverage','pricing','compliance','integration','maintenance') then raise exception 'Unsupported update type'; end if;
  if nullif(trim(p_payload ->> 'title'), '') is null or nullif(trim(p_payload ->> 'body'), '') is null then raise exception 'Update title and body are required'; end if;
  if p_update_id is null then
    insert into public.offerpsp_provider_updates(provider_id, update_type, title, body, effective_at, expires_at, status, created_by, updated_by, submitted_at)
    values (p_provider_id, v_type, trim(p_payload ->> 'title'), trim(p_payload ->> 'body'), nullif(trim(p_payload ->> 'effective_at'), '')::timestamptz, nullif(trim(p_payload ->> 'expires_at'), '')::timestamptz, case when p_submit then 'submitted' else 'draft' end, auth.uid(), auth.uid(), case when p_submit then now() else null end)
    returning * into v_update;
  else
    update public.offerpsp_provider_updates set
      update_type = v_type, title = trim(p_payload ->> 'title'), body = trim(p_payload ->> 'body'),
      effective_at = nullif(trim(p_payload ->> 'effective_at'), '')::timestamptz,
      expires_at = nullif(trim(p_payload ->> 'expires_at'), '')::timestamptz,
      status = case when p_submit then 'submitted' else 'draft' end,
      submitted_at = case when p_submit then now() else null end, updated_by = auth.uid(), updated_at = now()
    where id = p_update_id and provider_id = p_provider_id and status in ('draft','rejected')
    returning * into v_update;
    if not found then raise exception 'Editable PSP update not found'; end if;
  end if;
  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, after_state)
  values (p_provider_id, auth.uid(), case when p_submit then 'provider_update_submitted' else 'provider_update_saved' end, case when p_submit then 'PSP submitted an update for OfferPSP review' else 'PSP saved an update draft' end, to_jsonb(v_update));
  return to_jsonb(v_update);
end;
$$;

create or replace function public.get_offerpsp_provider_portal_workspace(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.is_offerpsp_provider_member(p_provider_id) then raise exception 'PSP workspace access required'; end if;
  return jsonb_build_object(
    'provider', (select jsonb_build_object('id', p.id, 'internal_code', p.internal_code, 'brand_name', p.brand_name, 'legal_name', p.legal_name, 'website', p.website, 'relationship_status', p.relationship_status, 'last_verified_at', p.last_verified_at, 'created_at', p.created_at, 'updated_at', p.updated_at) from private.offerpsp_providers p where p.id = p_provider_id),
    'profile', coalesce((select to_jsonb(d) - 'updated_by' from public.offerpsp_provider_profile_details d where d.provider_id = p_provider_id), '{}'::jsonb),
    'membership', (select jsonb_build_object('id', m.id, 'role', m.role) from public.offerpsp_provider_memberships m where m.provider_id = p_provider_id and m.user_id = auth.uid() and m.active),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) - 'notes' order by c.active desc, c.updated_at desc) from private.offerpsp_provider_contacts c where c.provider_id = p_provider_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(to_jsonb(u) - 'review_note' order by u.created_at desc) from public.offerpsp_provider_updates u where u.provider_id = p_provider_id), '[]'::jsonb),
    'ingestion_jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'source_type', j.source_type, 'source_reference', j.source_reference, 'source_metadata', j.source_metadata, 'status', j.status, 'route_count', j.route_count, 'blocking_anomaly_count', j.blocking_anomaly_count, 'error_message', j.error_message, 'received_at', j.received_at, 'processed_at', j.processed_at) order by j.received_at desc) from (select * from private.offerpsp_ingestion_jobs where provider_id = p_provider_id order by received_at desc limit 50) j), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc) from public.offerpsp_provider_offer_drafts d where d.provider_id = p_provider_id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg((to_jsonb(r) - 'raw_block') || jsonb_build_object('batch_version', b.batch_version, 'batch_status', b.status, 'source_effective_date', b.source_effective_date, 'fees', coalesce((select jsonb_agg(to_jsonb(f) order by f.flow, f.created_at) from private.offerpsp_offer_fee_components f where f.route_id = r.id), '[]'::jsonb), 'limits', coalesce((select jsonb_agg(to_jsonb(l) order by l.flow, l.currency) from private.offerpsp_offer_limits l where l.route_id = r.id), '[]'::jsonb), 'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from private.offerpsp_settlement_terms s where s.route_id = r.id), '[]'::jsonb), 'is_stale', ((r.expires_at is not null and r.expires_at < current_date) or not exists (select 1 from private.offerpsp_providers vp where vp.id = r.provider_id and vp.last_verified_at is not null and vp.last_verified_at + make_interval(days => r.freshness_days) >= now()))) order by r.updated_at desc) from private.offerpsp_offer_routes r join private.offerpsp_rate_card_batches b on b.id = r.batch_id where r.provider_id = p_provider_id and r.status <> 'archived'), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.enqueue_offerpsp_provider_source(uuid,text,text,text,jsonb) from public, anon;
revoke all on function public.save_offerpsp_provider_portal_profile(uuid,jsonb) from public, anon;
revoke all on function public.save_offerpsp_provider_portal_contact(uuid,uuid,jsonb) from public, anon;
revoke all on function public.save_offerpsp_provider_update(uuid,uuid,jsonb,boolean) from public, anon;
revoke all on function public.get_offerpsp_provider_portal_workspace(uuid) from public, anon;
grant execute on function public.enqueue_offerpsp_provider_source(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.save_offerpsp_provider_portal_profile(uuid,jsonb) to authenticated;
grant execute on function public.save_offerpsp_provider_portal_contact(uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_offerpsp_provider_update(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.get_offerpsp_provider_portal_workspace(uuid) to authenticated;

comment on table public.offerpsp_provider_profile_details is 'Provider-maintained private catalogue profile; future public use requires a separate approved projection.';
comment on table public.offerpsp_provider_updates is 'Provider news and operational updates. Provider submission never makes an update public.';
comment on function public.enqueue_offerpsp_provider_source(uuid,text,text,text,jsonb) is 'Queues provider-owned text or extracted file content for parsing and staff review. Never publishes.';
