-- Verified corporate relationships, exact duplicate candidates, and a read-only
-- merge impact preview. Physical record merging is intentionally not exposed:
-- every dependent table must first receive an explicit conflict policy.

create table private.offerpsp_entity_relationships (
  id uuid primary key default gen_random_uuid(),
  source_entity_type text not null check (source_entity_type in ('organization', 'provider')),
  source_entity_id uuid not null,
  target_entity_type text not null check (target_entity_type in ('organization', 'provider')),
  target_entity_id uuid not null,
  relationship_type text not null check (relationship_type in (
    'parent_of', 'trading_brand_of', 'same_group', 'operated_by', 'processing_partner'
  )),
  status text not null default 'proposed' check (status in ('proposed', 'verified', 'disputed', 'ended')),
  evidence_note text,
  evidence_url text,
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_entity_type <> target_entity_type or source_entity_id <> target_entity_id),
  check (status <> 'verified' or (
    verified_at is not null and evidence_note is not null and length(trim(evidence_note)) >= 10
  )),
  check (evidence_url is null or evidence_url ~* '^https?://'),
  check (status <> 'ended' or ended_at is not null)
);

create unique index offerpsp_entity_relationships_active_uidx
  on private.offerpsp_entity_relationships(
    source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type
  ) where ended_at is null;
create index offerpsp_entity_relationships_source_idx
  on private.offerpsp_entity_relationships(source_entity_type, source_entity_id, status, updated_at desc);
create index offerpsp_entity_relationships_target_idx
  on private.offerpsp_entity_relationships(target_entity_type, target_entity_id, status, updated_at desc);

alter table private.offerpsp_entity_relationships enable row level security;
revoke all on table private.offerpsp_entity_relationships from public, anon, authenticated;
grant all on table private.offerpsp_entity_relationships to service_role;

drop trigger if exists offerpsp_entity_relationships_set_updated_at
  on private.offerpsp_entity_relationships;
create trigger offerpsp_entity_relationships_set_updated_at
before update on private.offerpsp_entity_relationships
for each row execute function public.set_offerpsp_updated_at();

create or replace function private.offerpsp_entity_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_type
    when 'organization' then exists (
      select 1 from public.offerpsp_organizations where id = p_id
    )
    when 'provider' then exists (
      select 1 from private.offerpsp_providers where id = p_id
    )
    else false
  end
$$;

revoke all on function private.offerpsp_entity_exists(text,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_entity_exists(text,uuid) to service_role;

create or replace function private.validate_offerpsp_entity_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.offerpsp_entity_exists(new.source_entity_type, new.source_entity_id)
    or not private.offerpsp_entity_exists(new.target_entity_type, new.target_entity_id) then
    raise exception 'OfferPSP relationship entity not found';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_offerpsp_entity_relationship()
  from public, anon, authenticated;

drop trigger if exists offerpsp_entity_relationships_validate
  on private.offerpsp_entity_relationships;
create trigger offerpsp_entity_relationships_validate
before insert or update of source_entity_type, source_entity_id, target_entity_type, target_entity_id
on private.offerpsp_entity_relationships
for each row execute function private.validate_offerpsp_entity_relationship();

create or replace function private.offerpsp_entity_summary(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_type = 'organization' then
    select jsonb_build_object(
      'entity_type', 'organization', 'id', o.id, 'internal_code', o.internal_code,
      'name', o.name, 'legal_name', o.legal_name, 'website', o.website_url,
      'registration_number', o.registration_number, 'status', o.status
    ) into v_result
    from public.offerpsp_organizations o where o.id = p_id;
  elsif p_type = 'provider' then
    select jsonb_build_object(
      'entity_type', 'provider', 'id', p.id, 'internal_code', p.internal_code,
      'name', p.brand_name, 'legal_name', p.legal_name, 'website', p.website,
      'registration_number', null, 'status', p.relationship_status
    ) into v_result
    from private.offerpsp_providers p where p.id = p_id;
  end if;
  return v_result;
end;
$$;

revoke all on function private.offerpsp_entity_summary(text,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_entity_summary(text,uuid) to service_role;

create or replace function private.offerpsp_exact_duplicate_candidates(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_entity_type = 'organization' then
    with current_entity as (
      select o.*,
        private.offerpsp_normalize_company_name(o.name) as normalized_name,
        private.offerpsp_normalize_company_name(o.legal_name) as normalized_legal_name,
        private.offerpsp_normalize_domain(o.website_url) as normalized_domain
      from public.offerpsp_organizations o where o.id = p_entity_id
    ), candidates as (
      select o.id,
        array_remove(array[
          case when nullif(trim(c.registration_number), '') is not null
            and lower(trim(o.registration_number)) = lower(trim(c.registration_number)) then 'registration_number' end,
          case when c.normalized_domain is not null
            and private.offerpsp_normalize_domain(o.website_url) = c.normalized_domain then 'domain' end,
          case when c.normalized_legal_name is not null
            and private.offerpsp_normalize_company_name(o.legal_name) = c.normalized_legal_name then 'legal_name' end,
          case when c.normalized_name is not null
            and private.offerpsp_normalize_company_name(o.name) = c.normalized_name then 'name' end,
          case when exists (
            select 1 from private.offerpsp_entity_aliases own_alias
            join private.offerpsp_entity_aliases other_alias
              on other_alias.normalized_alias = own_alias.normalized_alias
            where own_alias.organization_id = p_entity_id
              and other_alias.organization_id = o.id
          ) then 'alias' end
        ], null) as signals
      from public.offerpsp_organizations o cross join current_entity c
      where o.id <> p_entity_id
    )
    select coalesce(jsonb_agg(
      private.offerpsp_entity_summary('organization', c.id)
        || jsonb_build_object(
          'signals', c.signals,
          'score', case
            when 'registration_number' = any(c.signals) then 100
            when 'domain' = any(c.signals) then 90
            when 'legal_name' = any(c.signals) then 80
            else 70 end
        ) order by case
          when 'registration_number' = any(c.signals) then 100
          when 'domain' = any(c.signals) then 90
          when 'legal_name' = any(c.signals) then 80
          else 70 end desc
    ), '[]'::jsonb) into v_result
    from candidates c where cardinality(c.signals) > 0;
  elsif p_entity_type = 'provider' then
    with current_entity as (
      select p.*,
        private.offerpsp_normalize_company_name(p.brand_name) as normalized_name,
        private.offerpsp_normalize_company_name(p.legal_name) as normalized_legal_name,
        private.offerpsp_normalize_domain(p.website) as normalized_domain
      from private.offerpsp_providers p where p.id = p_entity_id
    ), candidates as (
      select p.id,
        array_remove(array[
          case when c.normalized_domain is not null
            and private.offerpsp_normalize_domain(p.website) = c.normalized_domain then 'domain' end,
          case when c.normalized_legal_name is not null
            and private.offerpsp_normalize_company_name(p.legal_name) = c.normalized_legal_name then 'legal_name' end,
          case when c.normalized_name is not null
            and private.offerpsp_normalize_company_name(p.brand_name) = c.normalized_name then 'name' end,
          case when exists (
            select 1 from private.offerpsp_entity_aliases own_alias
            join private.offerpsp_entity_aliases other_alias
              on other_alias.normalized_alias = own_alias.normalized_alias
            where own_alias.provider_id = p_entity_id
              and other_alias.provider_id = p.id
          ) then 'alias' end
        ], null) as signals
      from private.offerpsp_providers p cross join current_entity c
      where p.id <> p_entity_id
    )
    select coalesce(jsonb_agg(
      private.offerpsp_entity_summary('provider', c.id)
        || jsonb_build_object(
          'signals', c.signals,
          'score', case
            when 'domain' = any(c.signals) then 90
            when 'legal_name' = any(c.signals) then 80
            else 70 end
        ) order by case
          when 'domain' = any(c.signals) then 90
          when 'legal_name' = any(c.signals) then 80
          else 70 end desc
    ), '[]'::jsonb) into v_result
    from candidates c where cardinality(c.signals) > 0;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function private.offerpsp_exact_duplicate_candidates(text,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_exact_duplicate_candidates(text,uuid) to service_role;

create or replace function public.get_offerpsp_entity_relationship_workspace(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('organization', 'provider') or p_entity_id is null
    or not private.offerpsp_entity_exists(p_entity_type, p_entity_id) then
    raise exception 'Valid OfferPSP relationship target is required';
  end if;

  return jsonb_build_object(
    'entity', private.offerpsp_entity_summary(p_entity_type, p_entity_id),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'relationship_type', case
          when r.target_entity_type = p_entity_type and r.target_entity_id = p_entity_id then
            case r.relationship_type
              when 'parent_of' then 'subsidiary_of'
              when 'trading_brand_of' then 'owns_brand'
              when 'operated_by' then 'operates'
              else r.relationship_type
            end
          else r.relationship_type
        end,
        'canonical_relationship_type', r.relationship_type,
        'status', r.status,
        'evidence_note', r.evidence_note,
        'evidence_url', r.evidence_url,
        'updated_at', r.updated_at,
        'other_entity', case
          when r.source_entity_type = p_entity_type and r.source_entity_id = p_entity_id
            then private.offerpsp_entity_summary(r.target_entity_type, r.target_entity_id)
          else private.offerpsp_entity_summary(r.source_entity_type, r.source_entity_id)
        end
      ) order by (r.status = 'verified') desc, r.updated_at desc)
      from private.offerpsp_entity_relationships r
      where r.ended_at is null and (
        (r.source_entity_type = p_entity_type and r.source_entity_id = p_entity_id)
        or (r.target_entity_type = p_entity_type and r.target_entity_id = p_entity_id)
      )
    ), '[]'::jsonb),
    'duplicate_candidates', private.offerpsp_exact_duplicate_candidates(p_entity_type, p_entity_id),
    'selectable_targets', (
      select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
      from (
        select private.offerpsp_entity_summary('organization', o.id) as item
        from public.offerpsp_organizations o
        where o.status <> 'archived'
          and not (p_entity_type = 'organization' and o.id = p_entity_id)
        union all
        select private.offerpsp_entity_summary('provider', p.id) as item
        from private.offerpsp_providers p
        where p.relationship_status <> 'archived'
          and not (p_entity_type = 'provider' and p.id = p_entity_id)
      ) targets
    )
  );
end;
$$;

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
  v_source_type text := p_source_entity_type;
  v_source_id uuid := p_source_entity_id;
  v_target_type text := p_target_entity_type;
  v_target_id uuid := p_target_entity_id;
  v_relation text := p_relationship_type;
  v_temp_type text;
  v_temp_id uuid;
  v_row private.offerpsp_entity_relationships;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if v_source_type not in ('organization', 'provider') or v_target_type not in ('organization', 'provider')
    or v_source_id is null or v_target_id is null then
    raise exception 'Valid OfferPSP relationship entities are required';
  end if;
  if p_status not in ('proposed', 'verified', 'disputed') then
    raise exception 'Unsupported active OfferPSP relationship status';
  end if;
  if p_status = 'verified' and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'Verified OfferPSP relationships require an evidence note';
  end if;

  if v_relation in ('subsidiary_of', 'owns_brand', 'operates') then
    v_temp_type := v_source_type; v_source_type := v_target_type; v_target_type := v_temp_type;
    v_temp_id := v_source_id; v_source_id := v_target_id; v_target_id := v_temp_id;
    v_relation := case v_relation
      when 'subsidiary_of' then 'parent_of'
      when 'owns_brand' then 'trading_brand_of'
      else 'operated_by'
    end;
  end if;
  if v_relation not in ('parent_of', 'trading_brand_of', 'same_group', 'operated_by', 'processing_partner') then
    raise exception 'Unsupported OfferPSP relationship type';
  end if;
  if v_relation in ('same_group', 'processing_partner')
    and (v_source_type || ':' || v_source_id::text) > (v_target_type || ':' || v_target_id::text) then
    v_temp_type := v_source_type; v_source_type := v_target_type; v_target_type := v_temp_type;
    v_temp_id := v_source_id; v_source_id := v_target_id; v_target_id := v_temp_id;
  end if;
  if v_source_type = v_target_type and v_source_id = v_target_id then
    raise exception 'An OfferPSP entity cannot be related to itself';
  end if;
  if not private.offerpsp_entity_exists(v_source_type, v_source_id)
    or not private.offerpsp_entity_exists(v_target_type, v_target_id) then
    raise exception 'OfferPSP relationship entity not found';
  end if;

  if v_relation = 'parent_of' and exists (
    with recursive descendants(entity_type, entity_id) as (
      select v_target_type, v_target_id
      union
      select r.target_entity_type, r.target_entity_id
      from private.offerpsp_entity_relationships r
      join descendants d on r.source_entity_type = d.entity_type and r.source_entity_id = d.entity_id
      where r.relationship_type = 'parent_of' and r.ended_at is null
    )
    select 1 from descendants where entity_type = v_source_type and entity_id = v_source_id
  ) then
    raise exception 'OfferPSP parent relationship would create a cycle';
  end if;

  insert into private.offerpsp_entity_relationships(
    source_entity_type, source_entity_id, target_entity_type, target_entity_id,
    relationship_type, status, evidence_note, evidence_url, created_by,
    verified_by, verified_at
  ) values (
    v_source_type, v_source_id, v_target_type, v_target_id,
    v_relation, p_status, nullif(trim(p_evidence_note), ''), nullif(trim(p_evidence_url), ''), auth.uid(),
    case when p_status = 'verified' then auth.uid() end,
    case when p_status = 'verified' then now() end
  )
  on conflict (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
    where ended_at is null
  do update set
    status = excluded.status,
    evidence_note = excluded.evidence_note,
    evidence_url = excluded.evidence_url,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at
  returning * into v_row;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    p_source_entity_type, p_source_entity_id::text, 'relationship_saved', auth.uid(), to_jsonb(v_row)
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.end_offerpsp_entity_relationship(
  p_relationship_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.offerpsp_entity_relationships;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'OfferPSP relationship end reason is required';
  end if;
  update private.offerpsp_entity_relationships set
    status = 'ended', ended_by = auth.uid(), ended_at = now(), end_reason = trim(p_reason)
  where id = p_relationship_id and ended_at is null
  returning * into v_row;
  if not found then raise exception 'Active OfferPSP relationship not found'; end if;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, reason, after_state
  ) values (
    v_row.source_entity_type, v_row.source_entity_id::text,
    'relationship_ended', auth.uid(), trim(p_reason), to_jsonb(v_row)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.preview_offerpsp_entity_merge(
  p_entity_type text,
  p_source_entity_id uuid,
  p_target_entity_id uuid
)
returns jsonb
language plpgsql
security definer
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
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('organization', 'provider') or p_source_entity_id is null
    or p_target_entity_id is null or p_source_entity_id = p_target_entity_id then
    raise exception 'Two different OfferPSP entities of the same type are required';
  end if;
  v_source := private.offerpsp_entity_summary(p_entity_type, p_source_entity_id);
  v_target := private.offerpsp_entity_summary(p_entity_type, p_target_entity_id);
  if v_source is null or v_target is null then raise exception 'OfferPSP merge entity not found'; end if;

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
    else 'private.offerpsp_providers'::regclass
  end;
  for v_item in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cls on cls.oid = con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = v_reference_table and cardinality(con.conkey) = 1
  loop
    execute format('select count(*) from %I.%I where %I = $1',
      v_item.schema_name, v_item.table_name, v_item.column_name)
      into v_count using p_source_entity_id;
    if v_count > 0 then
      v_references := v_references || jsonb_build_array(jsonb_build_object(
        'schema', v_item.schema_name, 'table', v_item.table_name,
        'column', v_item.column_name, 'source_rows', v_count
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'mode', 'preview_only',
    'source', v_source,
    'target', v_target,
    'field_conflicts', v_conflicts,
    'dependent_references', v_references,
    'source_alias_count', (
      select count(*) from private.offerpsp_entity_aliases a
      where (p_entity_type = 'organization' and a.organization_id = p_source_entity_id)
         or (p_entity_type = 'provider' and a.provider_id = p_source_entity_id)
    ),
    'source_relationship_count', (
      select count(*) from private.offerpsp_entity_relationships r
      where r.ended_at is null and (
        (r.source_entity_type = p_entity_type and r.source_entity_id = p_source_entity_id)
        or (r.target_entity_type = p_entity_type and r.target_entity_id = p_source_entity_id)
      )
    ),
    'merge_available', false,
    'blocking_reason', 'Physical merge requires an approved conflict policy for every dependent table'
  );
end;
$$;

revoke all on function public.get_offerpsp_entity_relationship_workspace(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_offerpsp_entity_relationship(text,uuid,text,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.end_offerpsp_entity_relationship(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.preview_offerpsp_entity_merge(text,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_offerpsp_entity_relationship_workspace(text,uuid) to authenticated;
grant execute on function public.save_offerpsp_entity_relationship(text,uuid,text,uuid,text,text,text,text) to authenticated;
grant execute on function public.end_offerpsp_entity_relationship(uuid,text) to authenticated;
grant execute on function public.preview_offerpsp_entity_merge(text,uuid,uuid) to authenticated;

comment on table private.offerpsp_entity_relationships is
  'Staff-managed, evidence-backed relationships between OfferPSP organizations and providers.';
comment on function public.preview_offerpsp_entity_merge(text,uuid,uuid) is
  'Read-only merge impact report. It never mutates, archives, or combines entity records.';
