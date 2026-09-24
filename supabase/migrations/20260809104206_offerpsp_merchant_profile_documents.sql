-- Persistent merchant identity and document vault.
-- Payment requirements remain request-scoped in offerpsp_leads.

alter table public.offerpsp_organizations
  add column if not exists registration_number text,
  add column if not exists registration_jurisdiction text,
  add column if not exists registered_address text,
  add column if not exists operating_address text,
  add column if not exists website_url text,
  add column if not exists description text,
  add column if not exists license_status text not null default 'unknown',
  add column if not exists license_jurisdiction text,
  add column if not exists license_number text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.offerpsp_organizations'::regclass
      and conname = 'offerpsp_organizations_license_status_check'
  ) then
    alter table public.offerpsp_organizations
      add constraint offerpsp_organizations_license_status_check
      check (license_status in ('unknown', 'licensed', 'unlicensed', 'pending', 'not_required'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.offerpsp_organizations'::regclass
      and conname = 'offerpsp_organizations_verification_status_check'
  ) then
    alter table public.offerpsp_organizations
      add constraint offerpsp_organizations_verification_status_check
      check (verification_status in ('unverified', 'in_review', 'verified', 'needs_information', 'rejected'));
  end if;
end;
$$;

create table if not exists private.offerpsp_organization_documents (
  id uuid primary key,
  organization_id uuid not null references public.offerpsp_organizations(id) on delete cascade,
  document_type text not null default 'other'
    check (document_type in ('license', 'corporate', 'ownership', 'kyb', 'compliance', 'financial', 'processing_statement', 'contract', 'other')),
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 10485760),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'verified', 'rejected', 'expired', 'archived')),
  issued_at date,
  expires_at date,
  client_note text,
  review_note text,
  uploaded_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);

create index if not exists offerpsp_organization_documents_org_idx
  on private.offerpsp_organization_documents(organization_id, status, updated_at desc);

drop trigger if exists offerpsp_organization_documents_set_updated_at
  on private.offerpsp_organization_documents;
create trigger offerpsp_organization_documents_set_updated_at
before update on private.offerpsp_organization_documents
for each row execute function public.set_offerpsp_updated_at();

alter table private.offerpsp_organization_documents enable row level security;
revoke all on private.offerpsp_organization_documents from public, anon, authenticated;
grant all on private.offerpsp_organization_documents to service_role;

-- Storage is optional in isolated PGlite tests, but present in Supabase production.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values (
      'offerpsp-merchant-documents',
      'offerpsp-merchant-documents',
      false,
      10485760,
      array[
        'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  execute 'drop policy if exists offerpsp_merchant_documents_read on storage.objects';
  execute $policy$
    create policy offerpsp_merchant_documents_read
    on storage.objects for select to authenticated
    using (
      bucket_id = 'offerpsp-merchant-documents'
      and case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.is_offerpsp_staff()
            or public.is_offerpsp_organization_member(split_part(name, '/', 1)::uuid)
        else false
      end
    )
  $policy$;

  execute 'drop policy if exists offerpsp_merchant_documents_upload on storage.objects';
  execute $policy$
    create policy offerpsp_merchant_documents_upload
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'offerpsp-merchant-documents'
      and case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.is_offerpsp_staff()
            or public.is_offerpsp_organization_member(
              split_part(name, '/', 1)::uuid,
              array['owner', 'admin', 'manager']
            )
        else false
      end
    )
  $policy$;
end;
$$;

create or replace function private.offerpsp_profile_completion(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  with profile as (
    select array[
      nullif(trim(name), ''),
      nullif(trim(legal_name), ''),
      nullif(trim(registration_number), ''),
      nullif(trim(registration_jurisdiction), ''),
      nullif(trim(website_url), ''),
      nullif(trim(registered_address), '')
    ] fields
    from public.offerpsp_organizations
    where id = p_organization_id and organization_type = 'merchant'
  )
  select coalesce(round(
    100.0 * (select count(*) from unnest(fields) value where value is not null)
    / nullif(cardinality(fields), 0)
  )::integer, 0)
  from profile;
$$;

create or replace function private.ensure_offerpsp_merchant_organization(
  p_user_id uuid,
  p_email text,
  p_company text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_organization_id uuid;
  v_lead public.offerpsp_leads;
begin
  if nullif(lower(trim(p_email)), '') is null or nullif(trim(p_company), '') is null then
    return null;
  end if;

  select l.merchant_organization_id into v_organization_id
  from public.offerpsp_leads l
  where lower(l.work_email) = lower(trim(p_email))
    and lower(trim(l.company)) = lower(trim(p_company))
    and l.merchant_organization_id is not null
  order by l.updated_at desc
  limit 1;

  if v_organization_id is null and p_user_id is not null then
  select o.id into v_organization_id
  from public.offerpsp_organizations o
  join public.offerpsp_organization_members om on om.organization_id = o.id
  where om.user_id = p_user_id and om.active
    and o.organization_type = 'merchant'
    and lower(trim(o.name)) = lower(trim(p_company))
  order by o.created_at
  limit 1;
  end if;

  select * into v_lead
  from public.offerpsp_leads
  where lower(work_email) = lower(trim(p_email))
    and lower(trim(company)) = lower(trim(p_company))
    and (p_user_id is null or client_user_id is null or client_user_id = p_user_id)
  order by updated_at desc
  limit 1;

  if v_organization_id is null then
    insert into public.offerpsp_organizations(
      organization_type, name, legal_name, status, created_by,
      registration_jurisdiction, website_url, description,
      license_status, license_jurisdiction, license_number
    ) values (
      'merchant', trim(p_company), trim(p_company), 'active', coalesce(p_user_id, auth.uid()),
      nullif(trim(v_lead.registration_geo), ''),
      nullif(trim(v_lead.company_url), ''),
      nullif(trim(v_lead.business_model), ''),
      coalesce(nullif(trim(v_lead.license_status), ''), 'unknown'),
      nullif(trim(v_lead.license_jurisdiction), ''),
      nullif(trim(v_lead.license_number), '')
    ) returning id into v_organization_id;

  end if;

  if p_user_id is not null then
    insert into public.offerpsp_organization_members(
      organization_id, user_id, role, active, created_by
    ) values (v_organization_id, p_user_id, 'owner', true, coalesce(auth.uid(), p_user_id))
    on conflict (organization_id, user_id) do update set active = true;
  end if;

  update public.offerpsp_leads
  set merchant_organization_id = v_organization_id
  where lower(work_email) = lower(trim(p_email))
    and lower(trim(company)) = lower(trim(p_company))
    and (p_user_id is null or client_user_id is null or client_user_id = p_user_id)
    and merchant_organization_id is null;

  return v_organization_id;
end;
$$;

create or replace function public.ensure_offerpsp_company_workspace(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads;
  v_organization_id uuid;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'Merchant request not found'; end if;
  if v_lead.merchant_organization_id is not null then return v_lead.merchant_organization_id; end if;
  v_organization_id := private.ensure_offerpsp_merchant_organization(
    v_lead.client_user_id, v_lead.work_email, v_lead.company
  );
  if v_organization_id is null then raise exception 'Company and work email are required'; end if;
  return v_organization_id;
end;
$$;

create or replace function public.claim_offerpsp_leads()
returns table (lead_id uuid, company text, claimed boolean)
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $$
declare
  v_email text;
  v_company text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then raise exception 'Authenticated email is unavailable'; end if;

  update public.offerpsp_leads l
  set client_user_id = auth.uid(), last_activity_at = now()
  where lower(l.work_email) = v_email
    and l.status not in ('closed', 'spam')
    and (l.client_user_id is null or l.client_user_id = auth.uid());

  for v_company in
    select distinct l.company
    from public.offerpsp_leads l
    where l.client_user_id = auth.uid()
      and lower(l.work_email) = v_email
      and l.status not in ('closed', 'spam')
      and nullif(trim(l.company), '') is not null
  loop
    perform private.ensure_offerpsp_merchant_organization(auth.uid(), v_email, v_company);
  end loop;

  return query
  select l.lead_id, l.company::text, true
  from public.offerpsp_leads l
  where l.client_user_id = auth.uid()
    and lower(l.work_email) = v_email
    and l.status not in ('closed', 'spam');
end;
$$;

create or replace function public.get_offerpsp_company_workspace(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_organization_id uuid;
  v_profile jsonb;
begin
  if not (public.is_offerpsp_staff() or public.can_access_offerpsp_client_lead(p_lead_id)) then
    raise exception 'Access denied';
  end if;
  select merchant_organization_id into v_organization_id
  from public.offerpsp_leads where lead_id = p_lead_id;
  if v_organization_id is null then
    return jsonb_build_object('organization', null, 'documents', '[]'::jsonb, 'profile_completion', 0);
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id, 'internal_code', o.internal_code, 'name', o.name,
    'legal_name', o.legal_name, 'registration_number', o.registration_number,
    'registration_jurisdiction', o.registration_jurisdiction,
    'registered_address', o.registered_address, 'operating_address', o.operating_address,
    'website_url', o.website_url, 'description', o.description,
    'license_status', o.license_status, 'license_jurisdiction', o.license_jurisdiction,
    'license_number', o.license_number, 'verification_status', o.verification_status,
    'verified_at', o.verified_at, 'updated_at', o.updated_at
  )) into v_profile
  from public.offerpsp_organizations o where o.id = v_organization_id;

  return jsonb_build_object(
    'organization', v_profile,
    'profile_completion', private.offerpsp_profile_completion(v_organization_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', d.id, 'document_type', d.document_type, 'title', d.title,
        'file_name', d.file_name, 'storage_path', d.storage_path,
        'mime_type', d.mime_type, 'size_bytes', d.size_bytes, 'status', d.status,
        'issued_at', d.issued_at, 'expires_at', d.expires_at,
        'client_note', d.client_note,
        'review_note', case when d.status = 'rejected' then d.review_note else null end,
        'created_at', d.created_at, 'updated_at', d.updated_at
      )) order by (d.status <> 'archived') desc, d.updated_at desc)
      from private.offerpsp_organization_documents d
      where d.organization_id = v_organization_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_offerpsp_company_profile(
  p_organization_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_organization public.offerpsp_organizations;
  v_is_staff boolean := public.is_offerpsp_staff();
  v_verification text;
begin
  if not (
    v_is_staff or public.is_offerpsp_organization_member(
      p_organization_id, array['owner', 'admin', 'manager']
    )
  ) then raise exception 'Access denied'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Company profile payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all(array[
      'name', 'legal_name', 'registration_number', 'registration_jurisdiction',
      'registered_address', 'operating_address', 'website_url', 'description',
      'license_status', 'license_jurisdiction', 'license_number', 'verification_status'
    ])
  ) then raise exception 'Company profile payload contains unsupported fields'; end if;

  select * into v_organization from public.offerpsp_organizations
  where id = p_organization_id and organization_type = 'merchant' for update;
  if not found then raise exception 'Merchant organization not found'; end if;

  v_verification := case when v_is_staff and p_payload ? 'verification_status'
    then nullif(trim(p_payload ->> 'verification_status'), '')
    else v_organization.verification_status end;
  if v_verification not in ('unverified', 'in_review', 'verified', 'needs_information', 'rejected') then
    raise exception 'Unsupported verification status';
  end if;

  update public.offerpsp_organizations set
    name = case when p_payload ? 'name' then coalesce(nullif(trim(p_payload ->> 'name'), ''), name) else name end,
    legal_name = case when p_payload ? 'legal_name' then nullif(trim(p_payload ->> 'legal_name'), '') else legal_name end,
    registration_number = case when p_payload ? 'registration_number' then nullif(trim(p_payload ->> 'registration_number'), '') else registration_number end,
    registration_jurisdiction = case when p_payload ? 'registration_jurisdiction' then nullif(trim(p_payload ->> 'registration_jurisdiction'), '') else registration_jurisdiction end,
    registered_address = case when p_payload ? 'registered_address' then nullif(trim(p_payload ->> 'registered_address'), '') else registered_address end,
    operating_address = case when p_payload ? 'operating_address' then nullif(trim(p_payload ->> 'operating_address'), '') else operating_address end,
    website_url = case when p_payload ? 'website_url' then nullif(trim(p_payload ->> 'website_url'), '') else website_url end,
    description = case when p_payload ? 'description' then nullif(trim(p_payload ->> 'description'), '') else description end,
    license_status = case when p_payload ? 'license_status' then coalesce(nullif(trim(p_payload ->> 'license_status'), ''), 'unknown') else license_status end,
    license_jurisdiction = case when p_payload ? 'license_jurisdiction' then nullif(trim(p_payload ->> 'license_jurisdiction'), '') else license_jurisdiction end,
    license_number = case when p_payload ? 'license_number' then nullif(trim(p_payload ->> 'license_number'), '') else license_number end,
    verification_status = v_verification,
    verified_at = case when v_verification = 'verified' then coalesce(verified_at, now()) else null end,
    verified_by = case when v_verification = 'verified' then coalesce(verified_by, auth.uid()) else null end
  where id = p_organization_id
  returning * into v_organization;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    'organization', p_organization_id::text, 'company_profile_updated', auth.uid(),
    jsonb_build_object('verification_status', v_organization.verification_status)
  );
  return jsonb_build_object(
    'organization', to_jsonb(v_organization) - 'created_by' - 'verified_by',
    'profile_completion', private.offerpsp_profile_completion(p_organization_id)
  );
end;
$$;

create or replace function public.register_offerpsp_company_document(
  p_organization_id uuid,
  p_document_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_document private.offerpsp_organization_documents;
  v_storage_path text;
  v_type text;
begin
  if not (
    public.is_offerpsp_staff() or public.is_offerpsp_organization_member(
      p_organization_id, array['owner', 'admin', 'manager']
    )
  ) then raise exception 'Access denied'; end if;
  if p_document_id is null then raise exception 'Document id is required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Document payload must be an object'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all(array[
      'document_type', 'title', 'file_name', 'storage_path', 'mime_type',
      'size_bytes', 'issued_at', 'expires_at', 'client_note'
    ])
  ) then raise exception 'Document payload contains unsupported fields'; end if;

  v_storage_path := nullif(trim(p_payload ->> 'storage_path'), '');
  v_type := coalesce(nullif(trim(p_payload ->> 'document_type'), ''), 'other');
  if nullif(trim(p_payload ->> 'title'), '') is null or nullif(trim(p_payload ->> 'file_name'), '') is null then
    raise exception 'Document title and file name are required';
  end if;
  if v_storage_path is null or v_storage_path not like p_organization_id::text || '/' || p_document_id::text || '/%' then
    raise exception 'Document storage path does not match organization and document';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'offerpsp-merchant-documents' and name = v_storage_path
  ) then
    raise exception 'Uploaded company document file not found';
  end if;
  if v_type not in ('license', 'corporate', 'ownership', 'kyb', 'compliance', 'financial', 'processing_statement', 'contract', 'other') then
    raise exception 'Unsupported document type';
  end if;

  insert into private.offerpsp_organization_documents(
    id, organization_id, document_type, title, file_name, storage_path,
    mime_type, size_bytes, issued_at, expires_at, client_note, uploaded_by
  ) values (
    p_document_id, p_organization_id, v_type, trim(p_payload ->> 'title'),
    trim(p_payload ->> 'file_name'), v_storage_path,
    nullif(trim(p_payload ->> 'mime_type'), ''),
    nullif(trim(p_payload ->> 'size_bytes'), '')::bigint,
    nullif(trim(p_payload ->> 'issued_at'), '')::date,
    nullif(trim(p_payload ->> 'expires_at'), '')::date,
    nullif(trim(p_payload ->> 'client_note'), ''), auth.uid()
  ) on conflict (id) do update set
    document_type = excluded.document_type,
    title = excluded.title,
    issued_at = excluded.issued_at,
    expires_at = excluded.expires_at,
    client_note = excluded.client_note,
    status = case when private.offerpsp_organization_documents.status in ('verified', 'rejected', 'expired')
      then 'pending' else private.offerpsp_organization_documents.status end,
    reviewed_by = null, reviewed_at = null, review_note = null
  where private.offerpsp_organization_documents.organization_id = p_organization_id
    and private.offerpsp_organization_documents.storage_path = excluded.storage_path
  returning * into v_document;
  if not found then raise exception 'Company document conflict'; end if;
  return to_jsonb(v_document) - 'reviewed_by' - 'uploaded_by';
end;
$$;

create or replace function public.review_offerpsp_company_document(
  p_document_id uuid,
  p_status text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_document private.offerpsp_organization_documents;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('pending', 'reviewing', 'verified', 'rejected', 'expired') then
    raise exception 'Unsupported document review status';
  end if;
  update private.offerpsp_organization_documents set
    status = p_status, review_note = nullif(trim(p_review_note), ''),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_document_id and status <> 'archived'
  returning * into v_document;
  if not found then raise exception 'Company document not found'; end if;
  return to_jsonb(v_document) - 'reviewed_by' - 'uploaded_by';
end;
$$;

create or replace function public.archive_offerpsp_company_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_document private.offerpsp_organization_documents;
begin
  select * into v_document from private.offerpsp_organization_documents where id = p_document_id;
  if not found then raise exception 'Company document not found'; end if;
  if not (
    public.is_offerpsp_staff() or public.is_offerpsp_organization_member(
      v_document.organization_id, array['owner', 'admin', 'manager']
    )
  ) then raise exception 'Access denied'; end if;
  update private.offerpsp_organization_documents set status = 'archived'
  where id = p_document_id returning * into v_document;
  return to_jsonb(v_document) - 'reviewed_by' - 'uploaded_by';
end;
$$;

-- Populate persistent merchant profiles for already claimed workspaces.
do $$
declare v_item record;
begin
  for v_item in
    select distinct client_user_id, lower(work_email) email, company
    from public.offerpsp_leads
    where client_user_id is not null and nullif(trim(company), '') is not null
  loop
    perform private.ensure_offerpsp_merchant_organization(v_item.client_user_id, v_item.email, v_item.company);
  end loop;
end;
$$;

revoke all on function private.offerpsp_profile_completion(uuid) from public;
revoke all on function private.ensure_offerpsp_merchant_organization(uuid,text,text) from public;
revoke all on function public.ensure_offerpsp_company_workspace(uuid) from public, anon;
revoke all on function public.claim_offerpsp_leads() from public, anon;
revoke all on function public.get_offerpsp_company_workspace(uuid) from public, anon;
revoke all on function public.save_offerpsp_company_profile(uuid,jsonb) from public, anon;
revoke all on function public.register_offerpsp_company_document(uuid,uuid,jsonb) from public, anon;
revoke all on function public.review_offerpsp_company_document(uuid,text,text) from public, anon;
revoke all on function public.archive_offerpsp_company_document(uuid) from public, anon;

grant execute on function public.claim_offerpsp_leads() to authenticated;
grant execute on function public.ensure_offerpsp_company_workspace(uuid) to authenticated;
grant execute on function public.get_offerpsp_company_workspace(uuid) to authenticated;
grant execute on function public.save_offerpsp_company_profile(uuid,jsonb) to authenticated;
grant execute on function public.register_offerpsp_company_document(uuid,uuid,jsonb) to authenticated;
grant execute on function public.review_offerpsp_company_document(uuid,text,text) to authenticated;
grant execute on function public.archive_offerpsp_company_document(uuid) to authenticated;

comment on table private.offerpsp_organization_documents is
  'Reusable private merchant document vault. Files remain in a private Storage bucket and are not duplicated per payment request.';
comment on function public.get_offerpsp_company_workspace(uuid) is
  'Client-safe persistent merchant profile and document metadata for one accessible request organization.';
