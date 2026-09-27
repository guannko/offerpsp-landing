-- Reversible logical entity merge and Radio Room relationship context.
-- A merge never deletes or rewrites commercial history. The duplicate card is
-- retained as an alias of the canonical card and can be restored for 72 hours.

alter table public.offerpsp_organizations
  add column if not exists merged_into_id uuid references public.offerpsp_organizations(id) on delete restrict,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

alter table private.offerpsp_providers
  add column if not exists merged_into_id uuid references private.offerpsp_providers(id) on delete restrict,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

create index if not exists offerpsp_organizations_merged_into_idx
  on public.offerpsp_organizations(merged_into_id) where merged_into_id is not null;
create index if not exists offerpsp_providers_merged_into_idx
  on private.offerpsp_providers(merged_into_id) where merged_into_id is not null;

create or replace function private.validate_offerpsp_merged_into()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target_merged_into uuid;
  v_target_exists boolean;
  v_has_children boolean;
begin
  if new.merged_into_id is null then return new; end if;
  if new.merged_into_id = new.id then
    raise exception 'OfferPSP entity cannot be merged into itself';
  end if;
  execute format(
    'select exists(select 1 from %I.%I where id = $1), '
      || '(select merged_into_id from %I.%I where id = $1)',
    tg_table_schema, tg_table_name, tg_table_schema, tg_table_name
  ) into v_target_exists, v_target_merged_into using new.merged_into_id;
  if not v_target_exists then raise exception 'OfferPSP merge target not found'; end if;
  if v_target_merged_into is not null then
    raise exception 'OfferPSP merge target must be canonical';
  end if;
  execute format('select exists(select 1 from %I.%I where merged_into_id = $1)', tg_table_schema, tg_table_name)
    into v_has_children using new.id;
  if v_has_children then
    raise exception 'Canonical OfferPSP entity with merged aliases cannot be merged';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_offerpsp_merged_into() from public, anon, authenticated;

drop trigger if exists offerpsp_organizations_validate_merged_into on public.offerpsp_organizations;
create trigger offerpsp_organizations_validate_merged_into
before insert or update of merged_into_id on public.offerpsp_organizations
for each row execute function private.validate_offerpsp_merged_into();

drop trigger if exists offerpsp_providers_validate_merged_into on private.offerpsp_providers;
create trigger offerpsp_providers_validate_merged_into
before insert or update of merged_into_id on private.offerpsp_providers
for each row execute function private.validate_offerpsp_merged_into();

create table private.offerpsp_entity_merges (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('organization', 'provider')),
  source_entity_id uuid not null,
  target_entity_id uuid not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'executed', 'rolled_back', 'cancelled')),
  reason text not null check (length(trim(reason)) >= 10),
  preview jsonb not null,
  preview_hash text not null,
  confirmation_token uuid not null default gen_random_uuid(),
  token_expires_at timestamptz not null default (now() + interval '15 minutes'),
  source_before jsonb not null,
  target_before jsonb not null,
  prepared_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  executed_by uuid references auth.users(id) on delete set null,
  executed_at timestamptz,
  observation_until timestamptz,
  rolled_back_by uuid references auth.users(id) on delete set null,
  rolled_back_at timestamptz,
  rollback_reason text,
  check (source_entity_id <> target_entity_id),
  check (status <> 'executed' or (executed_at is not null and observation_until is not null)),
  check (status <> 'rolled_back' or rolled_back_at is not null)
);

create unique index offerpsp_entity_merges_active_source_uidx
  on private.offerpsp_entity_merges(entity_type, source_entity_id)
  where status in ('prepared', 'executed');
create index offerpsp_entity_merges_target_idx
  on private.offerpsp_entity_merges(entity_type, target_entity_id, status, executed_at desc);
create index offerpsp_entity_merges_prepared_by_idx
  on private.offerpsp_entity_merges(prepared_by) where prepared_by is not null;
create index offerpsp_entity_merges_executed_by_idx
  on private.offerpsp_entity_merges(executed_by) where executed_by is not null;
create index offerpsp_entity_merges_rolled_back_by_idx
  on private.offerpsp_entity_merges(rolled_back_by) where rolled_back_by is not null;

alter table private.offerpsp_entity_merges enable row level security;
revoke all on table private.offerpsp_entity_merges from public, anon, authenticated;
grant all on table private.offerpsp_entity_merges to service_role;

create or replace function private.offerpsp_canonical_entity_id(p_type text, p_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_target uuid;
begin
  if p_type = 'organization' then
    select merged_into_id into v_target from public.offerpsp_organizations where id = p_id;
  elsif p_type = 'provider' then
    select merged_into_id into v_target from private.offerpsp_providers where id = p_id;
  else
    return null;
  end if;
  return coalesce(v_target, p_id);
end;
$$;

revoke all on function private.offerpsp_canonical_entity_id(text,uuid) from public, anon, authenticated;
grant execute on function private.offerpsp_canonical_entity_id(text,uuid) to service_role;

create or replace function private.offerpsp_entity_summary(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_type = 'organization' then
    select jsonb_build_object(
      'entity_type', 'organization', 'id', o.id, 'internal_code', o.internal_code,
      'organization_type', o.organization_type,
      'name', o.name, 'legal_name', o.legal_name, 'website', o.website_url,
      'registration_number', o.registration_number, 'status', o.status,
      'merged_into_id', o.merged_into_id, 'merged_at', o.merged_at
    ) into v_result from public.offerpsp_organizations o where o.id = p_id;
  elsif p_type = 'provider' then
    select jsonb_build_object(
      'entity_type', 'provider', 'id', p.id, 'internal_code', p.internal_code,
      'name', p.brand_name, 'legal_name', p.legal_name, 'website', p.website,
      'registration_number', null, 'status', p.relationship_status,
      'merged_into_id', p.merged_into_id, 'merged_at', p.merged_at
    ) into v_result from private.offerpsp_providers p where p.id = p_id;
  end if;
  return v_result;
end;
$$;

revoke all on function private.offerpsp_entity_summary(text,uuid) from public, anon, authenticated;
grant execute on function private.offerpsp_entity_summary(text,uuid) to service_role;

create or replace function private.offerpsp_entity_state(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_type = 'organization' then
    select jsonb_build_object('status', status, 'archived_at', archived_at, 'archived_by', archived_by,
      'merged_into_id', merged_into_id, 'merged_at', merged_at, 'merged_by', merged_by)
    into v_result from public.offerpsp_organizations where id = p_id;
  elsif p_type = 'provider' then
    select jsonb_build_object('status', relationship_status, 'archived_at', archived_at, 'archived_by', archived_by,
      'merged_into_id', merged_into_id, 'merged_at', merged_at, 'merged_by', merged_by)
    into v_result from private.offerpsp_providers where id = p_id;
  end if;
  return v_result;
end;
$$;

revoke all on function private.offerpsp_entity_state(text,uuid) from public, anon, authenticated;
grant execute on function private.offerpsp_entity_state(text,uuid) to service_role;

create or replace function private.offerpsp_build_entity_merge_preview(
  p_entity_type text,
  p_source_entity_id uuid,
  p_target_entity_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_source jsonb;
  v_target jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_references jsonb := '[]'::jsonb;
  v_item record;
  v_count bigint;
  v_reference_table regclass;
  v_exact_duplicate boolean := false;
  v_source_has_children boolean := false;
  v_same_organization_type boolean := true;
  v_has_active_portal_access boolean := false;
  v_available boolean := false;
  v_blocking_reason text;
begin
  if p_entity_type not in ('organization', 'provider') or p_source_entity_id is null
    or p_target_entity_id is null or p_source_entity_id = p_target_entity_id then
    raise exception 'Two different OfferPSP entities of the same type are required';
  end if;
  v_source := private.offerpsp_entity_summary(p_entity_type, p_source_entity_id);
  v_target := private.offerpsp_entity_summary(p_entity_type, p_target_entity_id);
  if v_source is null or v_target is null then raise exception 'OfferPSP merge entity not found'; end if;
  if p_entity_type = 'organization' then
    v_same_organization_type := v_source ->> 'organization_type' = v_target ->> 'organization_type';
  end if;

  select exists (
    select 1 from jsonb_array_elements(private.offerpsp_exact_duplicate_candidates(
      p_entity_type, p_target_entity_id
    )) item where item ->> 'id' = p_source_entity_id::text
  ) into v_exact_duplicate;

  if p_entity_type = 'organization' then
    select exists(select 1 from public.offerpsp_organizations where merged_into_id = p_source_entity_id)
      into v_source_has_children;
    select exists(
      select 1 from public.offerpsp_organization_members
      where organization_id in (p_source_entity_id, p_target_entity_id) and active
    ) into v_has_active_portal_access;
  else
    select exists(select 1 from private.offerpsp_providers where merged_into_id = p_source_entity_id)
      into v_source_has_children;
    select exists(
      select 1 from public.offerpsp_provider_memberships
      where provider_id in (p_source_entity_id, p_target_entity_id) and active
    ) into v_has_active_portal_access;
  end if;

  for v_item in
    select key, value as source_value, v_target -> key as target_value
    from jsonb_each(v_source)
    where key in ('name', 'legal_name', 'website', 'registration_number', 'status')
      and value <> 'null'::jsonb and v_target -> key <> 'null'::jsonb
      and value is distinct from v_target -> key
  loop
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'field', v_item.key, 'source_value', v_item.source_value, 'target_value', v_item.target_value
    ));
  end loop;

  v_reference_table := case p_entity_type
    when 'organization' then 'public.offerpsp_organizations'::regclass
    else 'private.offerpsp_providers'::regclass end;
  for v_item in
    select ns.nspname schema_name, cls.relname table_name, att.attname column_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cls on cls.oid = con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = v_reference_table and cardinality(con.conkey) = 1
      and not (ns.nspname = case when p_entity_type = 'organization' then 'public' else 'private' end
        and cls.relname = case when p_entity_type = 'organization' then 'offerpsp_organizations' else 'offerpsp_providers' end
        and att.attname = 'merged_into_id')
  loop
    execute format('select count(*) from %I.%I where %I = $1',
      v_item.schema_name, v_item.table_name, v_item.column_name)
      into v_count using p_source_entity_id;
    if v_count > 0 then
      v_references := v_references || jsonb_build_array(jsonb_build_object(
        'schema', v_item.schema_name, 'table', v_item.table_name,
        'column', v_item.column_name, 'source_rows', v_count, 'policy', 'retain_via_alias'
      ));
    end if;
  end loop;

  if p_entity_type = 'provider' then
    select count(*) into v_count from public.offerpsp_email_threads
    where counterparty_type = 'provider' and counterparty_id = p_source_entity_id::text;
  else
    select count(*) into v_count from public.offerpsp_email_threads t
    where (t.counterparty_type = 'merchant' and t.counterparty_id in (
      select lead_id::text from public.offerpsp_leads where merchant_organization_id = p_source_entity_id
    )) or t.lead_id in (
      select lead_id from public.offerpsp_leads where merchant_organization_id = p_source_entity_id
    );
  end if;
  if v_count > 0 then
    v_references := v_references || jsonb_build_array(jsonb_build_object(
      'schema', 'public', 'table', 'offerpsp_email_threads', 'column', 'counterparty',
      'source_rows', v_count, 'policy', 'retain_via_alias'
    ));
  end if;

  select count(*) into v_count from public.offerpsp_tasks
  where entity_type = p_entity_type and entity_id = p_source_entity_id::text;
  if v_count > 0 then
    v_references := v_references || jsonb_build_array(jsonb_build_object(
      'schema', 'public', 'table', 'offerpsp_tasks', 'column', 'entity_id',
      'source_rows', v_count, 'policy', 'retain_via_alias'
    ));
  end if;

  select count(*) into v_count from private.offerpsp_entity_audit
  where entity_type = p_entity_type and entity_id = p_source_entity_id::text;
  if v_count > 0 then
    v_references := v_references || jsonb_build_array(jsonb_build_object(
      'schema', 'private', 'table', 'offerpsp_entity_audit', 'column', 'entity_id',
      'source_rows', v_count, 'policy', 'immutable_history'
    ));
  end if;

  v_available := v_exact_duplicate
    and v_same_organization_type
    and v_source ->> 'merged_into_id' is null
    and v_target ->> 'merged_into_id' is null
    and not v_source_has_children
    and not v_has_active_portal_access;
  v_blocking_reason := case
    when not v_exact_duplicate then 'Exact duplicate evidence is required'
    when not v_same_organization_type then 'Merchant and agent organizations cannot be merged'
    when v_source ->> 'merged_into_id' is not null then 'Source entity is already merged'
    when v_target ->> 'merged_into_id' is not null then 'Target entity is not canonical'
    when v_source_has_children then 'Source is canonical for other merged aliases'
    when v_has_active_portal_access then 'Move or revoke active portal memberships before merging'
    else null end;

  return jsonb_build_object(
    'mode', 'reversible_logical_merge', 'source', v_source, 'target', v_target,
    'field_conflicts', v_conflicts, 'dependent_references', v_references,
    'source_alias_count', (select count(*) from private.offerpsp_entity_aliases a
      where (p_entity_type = 'organization' and a.organization_id = p_source_entity_id)
         or (p_entity_type = 'provider' and a.provider_id = p_source_entity_id)),
    'source_relationship_count', (select count(*) from private.offerpsp_entity_relationships r
      where r.ended_at is null and ((r.source_entity_type = p_entity_type and r.source_entity_id = p_source_entity_id)
        or (r.target_entity_type = p_entity_type and r.target_entity_id = p_source_entity_id))),
    'exact_duplicate', v_exact_duplicate, 'merge_available', v_available,
    'blocking_reason', v_blocking_reason, 'observation_hours', 72,
    'data_policy', 'Source state and history stay in place and are resolved through the canonical card'
  );
end;
$$;

revoke all on function private.offerpsp_build_entity_merge_preview(text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_build_entity_merge_preview(text,uuid,uuid) to service_role;

create or replace function public.preview_offerpsp_entity_merge(
  p_entity_type text, p_source_entity_id uuid, p_target_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return private.offerpsp_build_entity_merge_preview(p_entity_type, p_source_entity_id, p_target_entity_id);
end;
$$;

create or replace function public.prepare_offerpsp_entity_merge(
  p_entity_type text, p_source_entity_id uuid, p_target_entity_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview jsonb;
  v_row private.offerpsp_entity_merges;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'OfferPSP merge reason must contain at least 10 characters';
  end if;

  if p_entity_type = 'organization' then
    perform 1 from public.offerpsp_organizations where id in (p_source_entity_id, p_target_entity_id)
      order by id for update;
  elsif p_entity_type = 'provider' then
    perform 1 from private.offerpsp_providers where id in (p_source_entity_id, p_target_entity_id)
      order by id for update;
  else
    raise exception 'Unsupported OfferPSP entity type';
  end if;

  -- A fresh preview supersedes an older unexecuted preview for the same source.
  -- This keeps retries idempotent and invalidates the older one-time token.
  update private.offerpsp_entity_merges set status = 'cancelled'
  where entity_type = p_entity_type and source_entity_id = p_source_entity_id
    and status = 'prepared';

  v_preview := private.offerpsp_build_entity_merge_preview(
    p_entity_type, p_source_entity_id, p_target_entity_id
  );
  if not coalesce((v_preview ->> 'merge_available')::boolean, false) then
    raise exception 'OfferPSP merge is blocked: %', coalesce(v_preview ->> 'blocking_reason', 'unknown reason');
  end if;

  insert into private.offerpsp_entity_merges(
    entity_type, source_entity_id, target_entity_id, reason, preview, preview_hash,
    source_before, target_before, prepared_by
  ) values (
    p_entity_type, p_source_entity_id, p_target_entity_id, trim(p_reason), v_preview,
    md5(v_preview::text), private.offerpsp_entity_state(p_entity_type, p_source_entity_id),
    private.offerpsp_entity_state(p_entity_type, p_target_entity_id), auth.uid()
  ) returning * into v_row;

  return jsonb_build_object(
    'merge_id', v_row.id, 'confirmation_token', v_row.confirmation_token,
    'token_expires_at', v_row.token_expires_at, 'preview', v_row.preview,
    'instruction', 'Confirm this immutable preview before the token expires'
  );
end;
$$;

create or replace function public.execute_offerpsp_entity_merge(
  p_merge_id uuid, p_confirmation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merge private.offerpsp_entity_merges;
  v_current_preview jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_merge from private.offerpsp_entity_merges where id = p_merge_id for update;
  if not found or v_merge.status <> 'prepared' then raise exception 'Prepared OfferPSP merge not found'; end if;
  if v_merge.confirmation_token <> p_confirmation_token then raise exception 'OfferPSP merge confirmation token is invalid'; end if;
  if v_merge.token_expires_at <= now() then
    update private.offerpsp_entity_merges set status = 'cancelled' where id = v_merge.id;
    raise exception 'OfferPSP merge confirmation token expired';
  end if;

  if v_merge.entity_type = 'organization' then
    perform 1 from public.offerpsp_organizations where id in (v_merge.source_entity_id, v_merge.target_entity_id)
      order by id for update;
  else
    perform 1 from private.offerpsp_providers where id in (v_merge.source_entity_id, v_merge.target_entity_id)
      order by id for update;
  end if;

  v_current_preview := private.offerpsp_build_entity_merge_preview(
    v_merge.entity_type, v_merge.source_entity_id, v_merge.target_entity_id
  );
  if md5(v_current_preview::text) <> v_merge.preview_hash then
    raise exception 'OfferPSP merge preview changed; prepare a new merge';
  end if;
  if not coalesce((v_current_preview ->> 'merge_available')::boolean, false) then
    raise exception 'OfferPSP merge is no longer available';
  end if;

  if v_merge.entity_type = 'organization' then
    update public.offerpsp_organizations set
      merged_into_id = v_merge.target_entity_id, merged_at = now(), merged_by = auth.uid()
    where id = v_merge.source_entity_id;
  else
    update private.offerpsp_providers set
      merged_into_id = v_merge.target_entity_id, merged_at = now(), merged_by = auth.uid()
    where id = v_merge.source_entity_id;
  end if;

  update private.offerpsp_entity_merges set
    status = 'executed', executed_by = auth.uid(), executed_at = now(),
    observation_until = now() + interval '72 hours', confirmation_token = gen_random_uuid()
  where id = v_merge.id returning * into v_merge;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, reason, before_state, after_state
  ) values
    (v_merge.entity_type, v_merge.source_entity_id::text, 'entity_merged', auth.uid(), v_merge.reason,
      v_merge.source_before, private.offerpsp_entity_state(v_merge.entity_type, v_merge.source_entity_id)),
    (v_merge.entity_type, v_merge.target_entity_id::text, 'merged_alias_added', auth.uid(), v_merge.reason,
      v_merge.target_before, private.offerpsp_entity_state(v_merge.entity_type, v_merge.target_entity_id));

  return jsonb_build_object(
    'merge_id', v_merge.id, 'status', v_merge.status,
    'source', private.offerpsp_entity_summary(v_merge.entity_type, v_merge.source_entity_id),
    'target', private.offerpsp_entity_summary(v_merge.entity_type, v_merge.target_entity_id),
    'observation_until', v_merge.observation_until, 'rollback_available', true
  );
end;
$$;

create or replace function public.rollback_offerpsp_entity_merge(
  p_merge_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_merge private.offerpsp_entity_merges;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'OfferPSP rollback reason must contain at least 10 characters';
  end if;
  select * into v_merge from private.offerpsp_entity_merges where id = p_merge_id for update;
  if not found or v_merge.status <> 'executed' then raise exception 'Executed OfferPSP merge not found'; end if;
  if v_merge.observation_until < now() then raise exception 'OfferPSP merge observation window has ended'; end if;
  if v_merge.entity_type = 'organization' and exists (
    select 1 from private.offerpsp_entity_audit a
    where a.entity_type = 'organization'
      and a.entity_id = v_merge.source_entity_id::text
      and a.action_type = 'alias_intake_resolved'
      and a.created_at >= v_merge.executed_at
  ) then
    raise exception 'OfferPSP merge has intervening alias intake; manual reconciliation is required';
  end if;

  if v_merge.entity_type = 'organization' then
    update public.offerpsp_organizations set
      merged_into_id = null, merged_at = null, merged_by = null
    where id = v_merge.source_entity_id and merged_into_id = v_merge.target_entity_id;
  else
    update private.offerpsp_providers set
      merged_into_id = null, merged_at = null, merged_by = null
    where id = v_merge.source_entity_id and merged_into_id = v_merge.target_entity_id;
  end if;
  if not found then raise exception 'OfferPSP merged source state changed; rollback stopped'; end if;

  update private.offerpsp_entity_merges set
    status = 'rolled_back', rolled_back_by = auth.uid(), rolled_back_at = now(),
    rollback_reason = trim(p_reason)
  where id = v_merge.id returning * into v_merge;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, reason, before_state, after_state
  ) values (
    v_merge.entity_type, v_merge.source_entity_id::text, 'entity_merge_rolled_back', auth.uid(),
    trim(p_reason), jsonb_build_object('merged_into_id', v_merge.target_entity_id),
    private.offerpsp_entity_state(v_merge.entity_type, v_merge.source_entity_id)
  );
  return jsonb_build_object('merge_id', v_merge.id, 'status', v_merge.status,
    'source', private.offerpsp_entity_summary(v_merge.entity_type, v_merge.source_entity_id));
end;
$$;

-- Keep the original relationship reader as a private base and expose a wrapper
-- that resolves merged aliases to the canonical card.
alter function public.get_offerpsp_entity_relationship_workspace(text,uuid)
  rename to offerpsp_entity_relationship_workspace_base;
alter function public.offerpsp_entity_relationship_workspace_base(text,uuid)
  set schema private;
revoke all on function private.offerpsp_entity_relationship_workspace_base(text,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_entity_relationship_workspace_base(text,uuid) to service_role;

create or replace function public.get_offerpsp_entity_relationship_workspace(
  p_entity_type text, p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical_id uuid;
  v_workspace jsonb;
  v_relationships jsonb;
  v_merged_sources jsonb;
  v_active_merges jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not private.offerpsp_entity_exists(p_entity_type, p_entity_id) then
    raise exception 'Valid OfferPSP relationship target is required';
  end if;
  v_canonical_id := private.offerpsp_canonical_entity_id(p_entity_type, p_entity_id);
  v_workspace := private.offerpsp_entity_relationship_workspace_base(p_entity_type, v_canonical_id);

  -- Merged aliases are not valid future merge or relationship targets.
  v_workspace := jsonb_set(v_workspace, '{duplicate_candidates}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_workspace -> 'duplicate_candidates', '[]'::jsonb)) item
    where private.offerpsp_canonical_entity_id(item ->> 'entity_type', (item ->> 'id')::uuid)
      = (item ->> 'id')::uuid
  ), '[]'::jsonb), true);
  v_workspace := jsonb_set(v_workspace, '{selectable_targets}', coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(coalesce(v_workspace -> 'selectable_targets', '[]'::jsonb)) item
    where private.offerpsp_canonical_entity_id(item ->> 'entity_type', (item ->> 'id')::uuid)
      = (item ->> 'id')::uuid
  ), '[]'::jsonb), true);

  with family as (
    select v_canonical_id id
    union all
    select id from public.offerpsp_organizations
      where p_entity_type = 'organization' and merged_into_id = v_canonical_id
    union all
    select id from private.offerpsp_providers
      where p_entity_type = 'provider' and merged_into_id = v_canonical_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'relationship_type', case
      when r.target_entity_type = p_entity_type and r.target_entity_id in (select id from family) then
        case r.relationship_type when 'parent_of' then 'subsidiary_of'
          when 'trading_brand_of' then 'owns_brand' when 'operated_by' then 'operates'
          else r.relationship_type end
      else r.relationship_type end,
    'canonical_relationship_type', r.relationship_type, 'status', r.status,
    'evidence_note', r.evidence_note, 'evidence_url', r.evidence_url, 'updated_at', r.updated_at,
    'other_entity', case
      when r.source_entity_type = p_entity_type and r.source_entity_id in (select id from family)
        then private.offerpsp_entity_summary(r.target_entity_type,
          private.offerpsp_canonical_entity_id(r.target_entity_type, r.target_entity_id))
      else private.offerpsp_entity_summary(r.source_entity_type,
        private.offerpsp_canonical_entity_id(r.source_entity_type, r.source_entity_id)) end
  ) order by (r.status = 'verified') desc, r.updated_at desc), '[]'::jsonb)
  into v_relationships
  from private.offerpsp_entity_relationships r
  where r.ended_at is null and (
    (r.source_entity_type = p_entity_type and r.source_entity_id in (select id from family))
    or (r.target_entity_type = p_entity_type and r.target_entity_id in (select id from family))
  ) and not (
    private.offerpsp_canonical_entity_id(r.source_entity_type, r.source_entity_id) =
      private.offerpsp_canonical_entity_id(r.target_entity_type, r.target_entity_id)
    and r.source_entity_type = r.target_entity_type
  );

  if p_entity_type = 'organization' then
    select coalesce(jsonb_agg(private.offerpsp_entity_summary('organization', id) order by merged_at desc), '[]'::jsonb)
      into v_merged_sources from public.offerpsp_organizations where merged_into_id = v_canonical_id;
  else
    select coalesce(jsonb_agg(private.offerpsp_entity_summary('provider', id) order by merged_at desc), '[]'::jsonb)
      into v_merged_sources from private.offerpsp_providers where merged_into_id = v_canonical_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'source_entity_id', m.source_entity_id, 'target_entity_id', m.target_entity_id,
    'reason', m.reason, 'status', m.status, 'executed_at', m.executed_at,
    'observation_until', m.observation_until,
    'rollback_available', m.status = 'executed' and m.observation_until >= now()
  ) order by m.executed_at desc), '[]'::jsonb)
  into v_active_merges from private.offerpsp_entity_merges m
  where m.entity_type = p_entity_type and m.target_entity_id = v_canonical_id and m.status = 'executed';

  return v_workspace || jsonb_build_object(
    'requested_entity', private.offerpsp_entity_summary(p_entity_type, p_entity_id),
    'entity', private.offerpsp_entity_summary(p_entity_type, v_canonical_id),
    'canonical_entity', private.offerpsp_entity_summary(p_entity_type, v_canonical_id),
    'relationships', v_relationships, 'merged_sources', v_merged_sources,
    'active_merges', v_active_merges
  );
end;
$$;

-- Relationships always attach to canonical entities. This prevents a stale
-- alias URL or API client from recreating a second graph behind a merged card.
alter function public.save_offerpsp_entity_relationship(text,uuid,text,uuid,text,text,text,text)
  rename to save_offerpsp_entity_relationship_base;
alter function public.save_offerpsp_entity_relationship_base(text,uuid,text,uuid,text,text,text,text)
  set schema private;
revoke all on function private.save_offerpsp_entity_relationship_base(text,uuid,text,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function private.save_offerpsp_entity_relationship_base(text,uuid,text,uuid,text,text,text,text)
  to service_role;

create or replace function public.save_offerpsp_entity_relationship(
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_target_entity_type text,
  p_target_entity_id uuid,
  p_relationship_type text,
  p_status text default 'verified',
  p_evidence_note text default null,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_target_id uuid;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  v_source_id := private.offerpsp_canonical_entity_id(p_source_entity_type, p_source_entity_id);
  v_target_id := private.offerpsp_canonical_entity_id(p_target_entity_type, p_target_entity_id);
  return private.save_offerpsp_entity_relationship_base(
    p_source_entity_type, v_source_id, p_target_entity_type, v_target_id,
    p_relationship_type, p_status, p_evidence_note, p_evidence_url
  );
end;
$$;

-- Resolve a merged PSP through one staff workspace while preserving every
-- underlying contact, offer, margin and audit record on its original provider.
alter function public.get_offerpsp_supply_workspace(uuid)
  rename to offerpsp_supply_workspace_base;
alter function public.offerpsp_supply_workspace_base(uuid)
  set schema private;
revoke all on function private.offerpsp_supply_workspace_base(uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_supply_workspace_base(uuid) to service_role;

create or replace function public.get_offerpsp_supply_workspace(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_canonical_id uuid;
  v_workspace jsonb;
  v_source_workspace jsonb;
  v_source record;
  v_merged_sources jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists(select 1 from private.offerpsp_providers where id = p_provider_id) then
    raise exception 'PSP provider not found';
  end if;

  v_canonical_id := private.offerpsp_canonical_entity_id('provider', p_provider_id);
  v_workspace := private.offerpsp_supply_workspace_base(v_canonical_id);

  for v_source in
    select id from private.offerpsp_providers
    where merged_into_id = v_canonical_id order by merged_at, id
  loop
    v_source_workspace := private.offerpsp_supply_workspace_base(v_source.id);
    v_workspace := jsonb_set(v_workspace, '{contacts}',
      coalesce(v_workspace -> 'contacts', '[]'::jsonb)
        || coalesce(v_source_workspace -> 'contacts', '[]'::jsonb), true);
    v_workspace := jsonb_set(v_workspace, '{margin_policies}',
      coalesce(v_workspace -> 'margin_policies', '[]'::jsonb)
        || coalesce(v_source_workspace -> 'margin_policies', '[]'::jsonb), true);
    v_workspace := jsonb_set(v_workspace, '{batches}',
      coalesce(v_workspace -> 'batches', '[]'::jsonb)
        || coalesce(v_source_workspace -> 'batches', '[]'::jsonb), true);
    v_workspace := jsonb_set(v_workspace, '{routes}',
      coalesce(v_workspace -> 'routes', '[]'::jsonb)
        || coalesce(v_source_workspace -> 'routes', '[]'::jsonb), true);
    v_workspace := jsonb_set(v_workspace, '{activity}',
      coalesce(v_workspace -> 'activity', '[]'::jsonb)
        || coalesce(v_source_workspace -> 'activity', '[]'::jsonb), true);
  end loop;

  select coalesce(jsonb_agg(private.offerpsp_entity_summary('provider', p.id)
    order by p.merged_at desc), '[]'::jsonb)
  into v_merged_sources
  from private.offerpsp_providers p where p.merged_into_id = v_canonical_id;

  return v_workspace || jsonb_build_object(
    'requested_provider_id', p_provider_id,
    'canonical_provider_id', v_canonical_id,
    'merged_sources', v_merged_sources
  );
end;
$$;

-- The registry contains one canonical PSP card. Batches and route counts from
-- retained aliases are projected onto that card, so matching data stays live.
create or replace function public.list_offerpsp_supply()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'legacy_psp_id', p.legacy_psp_id, 'internal_code', p.internal_code,
        'brand_name', p.brand_name, 'legal_name', p.legal_name, 'website', p.website,
        'relationship_status', p.relationship_status, 'strategic_priority', p.strategic_priority,
        'margin_included_default', p.margin_included_default, 'last_verified_at', p.last_verified_at,
        'merged_source_count', (select count(*) from private.offerpsp_providers s where s.merged_into_id = p.id),
        'batch_count', (select count(*) from private.offerpsp_rate_card_batches b
          join private.offerpsp_providers source on source.id = b.provider_id
          where coalesce(source.merged_into_id, source.id) = p.id),
        'published_route_count', (select count(*) from private.offerpsp_offer_routes r
          join private.offerpsp_providers source on source.id = r.provider_id
          where coalesce(source.merged_into_id, source.id) = p.id and r.status = 'published')
      ) order by p.strategic_priority desc, p.brand_name)
      from private.offerpsp_providers p
      where p.merged_into_id is null and p.relationship_status <> 'archived'
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'provider_id', canonical.id, 'source_provider_id', source.id,
        'provider_code', canonical.internal_code, 'provider_name', canonical.brand_name,
        'batch_version', b.batch_version, 'source_type', b.source_type,
        'source_reference', b.source_reference, 'source_effective_date', b.source_effective_date,
        'received_at', b.received_at, 'status', b.status, 'parser_version', b.parser_version,
        'route_count', (select count(*) from private.offerpsp_offer_routes r where r.batch_id = b.id),
        'open_anomaly_count', (select count(*) from private.offerpsp_route_anomalies a
          where a.batch_id = b.id and a.status = 'open')
      ) order by b.received_at desc)
      from private.offerpsp_rate_card_batches b
      join private.offerpsp_providers source on source.id = b.provider_id
      join private.offerpsp_providers canonical on canonical.id = coalesce(source.merged_into_id, source.id)
      where canonical.relationship_status <> 'archived'
    ), '[]'::jsonb)
  );
end;
$$;

-- Canonicalize provider labels in the coverage matrix without rewriting the
-- original route owner. Route actions still use the immutable route id.
alter function public.get_offerpsp_supply_coverage()
  rename to offerpsp_supply_coverage_base;
alter function public.offerpsp_supply_coverage_base()
  set schema private;
revoke all on function private.offerpsp_supply_coverage_base()
  from public, anon, authenticated;
grant execute on function private.offerpsp_supply_coverage_base() to service_role;

create or replace function public.get_offerpsp_supply_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_base jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  v_base := private.offerpsp_supply_coverage_base();
  return jsonb_build_object(
    'routes', coalesce((
      select jsonb_agg(item || jsonb_build_object(
        'source_provider_id', source.id,
        'provider_id', canonical.id,
        'provider_name', canonical.brand_name,
        'provider_code', canonical.internal_code
      ))
      from jsonb_array_elements(coalesce(v_base -> 'routes', '[]'::jsonb)) item
      join private.offerpsp_providers source on source.id = (item ->> 'provider_id')::uuid
      join private.offerpsp_providers canonical on canonical.id = coalesce(source.merged_into_id, source.id)
    ), '[]'::jsonb),
    'generated_at', v_base -> 'generated_at'
  );
end;
$$;

-- Staff opening a lead that belongs to a retained organization alias sees the
-- canonical company and the complete family document set. Client workspaces
-- remain unchanged; active portal memberships block a merge in the preview.
alter function public.get_offerpsp_company_workspace(uuid)
  rename to offerpsp_company_workspace_base;
alter function public.offerpsp_company_workspace_base(uuid)
  set schema private;
revoke all on function private.offerpsp_company_workspace_base(uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_company_workspace_base(uuid) to service_role;

create or replace function public.get_offerpsp_company_workspace(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace jsonb;
  v_requested_id uuid;
  v_canonical_id uuid;
  v_profile jsonb;
  v_documents jsonb;
  v_merged_sources jsonb;
begin
  v_workspace := private.offerpsp_company_workspace_base(p_lead_id);
  if not public.is_offerpsp_staff() or v_workspace -> 'organization' = 'null'::jsonb then
    return v_workspace;
  end if;
  v_requested_id := (v_workspace -> 'organization' ->> 'id')::uuid;
  v_canonical_id := private.offerpsp_canonical_entity_id('organization', v_requested_id);

  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id, 'internal_code', o.internal_code, 'name', o.name,
    'legal_name', o.legal_name, 'registration_number', o.registration_number,
    'registration_jurisdiction', o.registration_jurisdiction,
    'registered_address', o.registered_address, 'operating_address', o.operating_address,
    'website_url', o.website_url, 'description', o.description,
    'license_status', o.license_status, 'license_jurisdiction', o.license_jurisdiction,
    'license_number', o.license_number, 'verification_status', o.verification_status,
    'verified_at', o.verified_at, 'updated_at', o.updated_at
  )) into v_profile from public.offerpsp_organizations o where o.id = v_canonical_id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', d.id, 'organization_id', d.organization_id, 'document_type', d.document_type,
    'title', d.title, 'file_name', d.file_name, 'storage_path', d.storage_path,
    'mime_type', d.mime_type, 'size_bytes', d.size_bytes, 'status', d.status,
    'issued_at', d.issued_at, 'expires_at', d.expires_at, 'client_note', d.client_note,
    'review_note', case when d.status = 'rejected' then d.review_note else null end,
    'created_at', d.created_at, 'updated_at', d.updated_at
  )) order by (d.status <> 'archived') desc, d.updated_at desc), '[]'::jsonb)
  into v_documents
  from private.offerpsp_organization_documents d
  where d.organization_id = v_canonical_id or d.organization_id in (
    select id from public.offerpsp_organizations where merged_into_id = v_canonical_id
  );

  select coalesce(jsonb_agg(private.offerpsp_entity_summary('organization', o.id)
    order by o.merged_at desc), '[]'::jsonb)
  into v_merged_sources from public.offerpsp_organizations o where o.merged_into_id = v_canonical_id;

  return jsonb_build_object(
    'organization', v_profile,
    'profile_completion', private.offerpsp_profile_completion(v_canonical_id),
    'documents', v_documents,
    'requested_organization_id', v_requested_id,
    'canonical_organization_id', v_canonical_id,
    'merged_sources', v_merged_sources
  );
end;
$$;

create or replace function private.reject_offerpsp_merged_portal_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.active then return new; end if;
  if tg_table_name = 'offerpsp_organization_members' and exists(
    select 1 from public.offerpsp_organizations
    where id = (to_jsonb(new) ->> 'organization_id')::uuid and merged_into_id is not null
  ) then raise exception 'Active portal access cannot be assigned to a merged organization alias'; end if;
  if tg_table_name = 'offerpsp_provider_memberships' and exists(
    select 1 from private.offerpsp_providers
    where id = (to_jsonb(new) ->> 'provider_id')::uuid and merged_into_id is not null
  ) then raise exception 'Active portal access cannot be assigned to a merged provider alias'; end if;
  return new;
end;
$$;

revoke all on function private.reject_offerpsp_merged_portal_membership()
  from public, anon, authenticated;
drop trigger if exists offerpsp_organization_members_reject_merged_alias
  on public.offerpsp_organization_members;
create trigger offerpsp_organization_members_reject_merged_alias
before insert or update of organization_id, active on public.offerpsp_organization_members
for each row execute function private.reject_offerpsp_merged_portal_membership();
drop trigger if exists offerpsp_provider_memberships_reject_merged_alias
  on public.offerpsp_provider_memberships;
create trigger offerpsp_provider_memberships_reject_merged_alias
before insert or update of provider_id, active on public.offerpsp_provider_memberships
for each row execute function private.reject_offerpsp_merged_portal_membership();

create or replace function public.get_offerpsp_email_thread_entity_context(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.offerpsp_email_threads;
  v_entity_type text;
  v_entity_id uuid;
  v_lead_id uuid;
  v_canonical_id uuid;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_thread from public.offerpsp_email_threads where id = p_thread_id;
  if not found then raise exception 'OfferPSP email thread not found'; end if;

  if v_thread.counterparty_type = 'provider'
    and coalesce(v_thread.counterparty_id, '') ~* '^[0-9a-f-]{36}$' then
    v_entity_type := 'provider'; v_entity_id := v_thread.counterparty_id::uuid;
  elsif v_thread.counterparty_type = 'merchant' or v_thread.lead_id is not null then
    v_lead_id := coalesce(v_thread.lead_id,
      case when coalesce(v_thread.counterparty_id, '') ~* '^[0-9a-f-]{36}$'
        then v_thread.counterparty_id::uuid end);
    select merchant_organization_id into v_entity_id
    from public.offerpsp_leads where lead_id = v_lead_id;
    v_entity_type := 'organization';
  else
    return jsonb_build_object('status', 'unsupported', 'counterparty_type', v_thread.counterparty_type,
      'reason', 'This email thread is not linked to an OfferPSP merchant organization or provider');
  end if;

  if v_entity_id is null or not private.offerpsp_entity_exists(v_entity_type, v_entity_id) then
    return jsonb_build_object('status', 'unlinked', 'counterparty_type', v_thread.counterparty_type,
      'reason', 'The email thread has no resolvable OfferPSP entity card');
  end if;
  v_canonical_id := private.offerpsp_canonical_entity_id(v_entity_type, v_entity_id);
  return jsonb_build_object(
    'status', 'linked', 'entity_type', v_entity_type, 'requested_entity_id', v_entity_id,
    'canonical_entity_id', v_canonical_id,
    'card_path', case when v_entity_type = 'provider' then '/psps/' || v_canonical_id::text
      when v_lead_id is not null then '/merchants/' || v_lead_id::text
      else null end,
    'workspace', public.get_offerpsp_entity_relationship_workspace(v_entity_type, v_canonical_id)
  );
end;
$$;

-- Future merchant intakes that use a historical alias must resolve through a
-- merged organization to the canonical card.
create or replace function public.upsert_offerpsp_lead_intake(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_original_company text := nullif(trim(p_payload ->> 'company'), '');
  v_original_norm text;
  v_canonical_company text;
  v_canonical_norm text;
  v_effective_payload jsonb := p_payload;
  v_result jsonb;
  v_submission_id uuid;
  v_alias_organization_id uuid;
begin
  if v_role <> 'service_role' then raise exception 'OfferPSP service access required'; end if;
  v_original_norm := private.offerpsp_normalize_company_name(v_original_company);
  if v_original_norm is not null then
    select o.id, coalesce((select l.company from public.offerpsp_leads l
      where l.merchant_organization_id = coalesce(o.merged_into_id, o.id) and l.status <> 'spam'
      order by l.submitted_at, l.lead_id limit 1), canonical.name, o.name)
    into v_alias_organization_id, v_canonical_company
    from private.offerpsp_entity_aliases a
    join public.offerpsp_organizations o on o.id = a.organization_id
    left join public.offerpsp_organizations canonical on canonical.id = o.merged_into_id
    where a.normalized_alias = v_original_norm limit 1;
  end if;
  v_canonical_norm := private.offerpsp_normalize_company_name(v_canonical_company);
  if v_canonical_norm is not null and v_canonical_norm is distinct from v_original_norm then
    v_effective_payload := jsonb_set(p_payload, '{company}', to_jsonb(v_canonical_company), true);
  end if;
  v_result := private.offerpsp_upsert_lead_intake_without_aliases(v_effective_payload);
  v_submission_id := nullif(v_result ->> 'submission_id', '')::uuid;
  if v_submission_id is not null and v_canonical_norm is not null
    and v_canonical_norm is distinct from v_original_norm then
    update private.offerpsp_intake_submissions set submitted_company = v_original_company,
      payload = jsonb_set(payload, '{company}', to_jsonb(v_original_company), true)
    where id = v_submission_id;
    update public.offerpsp_lead_activities set
      metadata = jsonb_set(metadata, '{submitted_company}', to_jsonb(v_original_company), true)
    where metadata ->> 'submission_id' = v_submission_id::text;
    if exists (
      select 1 from public.offerpsp_organizations
      where id = v_alias_organization_id and merged_into_id is not null
    ) then
      insert into private.offerpsp_entity_audit(
        entity_type, entity_id, action_type, actor_user_id, reason, after_state
      ) values (
        'organization', v_alias_organization_id::text, 'alias_intake_resolved', auth.uid(),
        'Historical organization alias resolved to its canonical card',
        jsonb_build_object(
          'submission_id', v_submission_id,
          'submitted_company', v_original_company,
          'canonical_company', v_canonical_company
        )
      );
    end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.preview_offerpsp_entity_merge(text,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_offerpsp_entity_merge(text,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.execute_offerpsp_entity_merge(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rollback_offerpsp_entity_merge(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_offerpsp_entity_relationship_workspace(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_offerpsp_entity_relationship(text,uuid,text,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_offerpsp_email_thread_entity_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_offerpsp_supply_workspace(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_offerpsp_supply()
  from public, anon, authenticated, service_role;
revoke all on function public.get_offerpsp_supply_coverage()
  from public, anon, authenticated, service_role;
revoke all on function public.get_offerpsp_company_workspace(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.upsert_offerpsp_lead_intake(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.preview_offerpsp_entity_merge(text,uuid,uuid) to authenticated;
grant execute on function public.prepare_offerpsp_entity_merge(text,uuid,uuid,text) to authenticated;
grant execute on function public.execute_offerpsp_entity_merge(uuid,uuid) to authenticated;
grant execute on function public.rollback_offerpsp_entity_merge(uuid,text) to authenticated;
grant execute on function public.get_offerpsp_entity_relationship_workspace(text,uuid) to authenticated;
grant execute on function public.save_offerpsp_entity_relationship(text,uuid,text,uuid,text,text,text,text)
  to authenticated;
grant execute on function public.get_offerpsp_email_thread_entity_context(uuid) to authenticated;
grant execute on function public.get_offerpsp_supply_workspace(uuid) to authenticated;
grant execute on function public.list_offerpsp_supply() to authenticated;
grant execute on function public.get_offerpsp_supply_coverage() to authenticated;
grant execute on function public.get_offerpsp_company_workspace(uuid) to authenticated;
grant execute on function public.upsert_offerpsp_lead_intake(jsonb) to service_role;

comment on table private.offerpsp_entity_merges is
  'Immutable-preview, reversible logical merges. Source records and their history are retained.';
comment on function public.execute_offerpsp_entity_merge(uuid,uuid) is
  'Executes a staff-confirmed logical merge without deleting or rewriting commercial history.';
comment on function public.get_offerpsp_email_thread_entity_context(uuid) is
  'Staff-only relationship and merge context for a Radio Room thread.';
