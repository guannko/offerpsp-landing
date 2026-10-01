-- Staff-only working documents. No client publication, signing or workflow dispatch.
create table private.offerpsp_work_documents (
  id uuid primary key,
  revision integer not null check (revision > 0),
  body jsonb not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offerpsp_work_documents_updated_idx on private.offerpsp_work_documents(updated_at desc, id);
create table private.offerpsp_work_document_history (
  document_id uuid not null references private.offerpsp_work_documents(id),
  revision integer not null,
  body jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (document_id, revision)
);
alter table private.offerpsp_work_documents enable row level security;
alter table private.offerpsp_work_document_history enable row level security;
revoke all on private.offerpsp_work_documents, private.offerpsp_work_document_history from public, anon, authenticated, service_role;

-- Invoker helper is private, has no side effects and is not exposed as an RPC.
create function private.validate_offerpsp_work_document(p_body jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare b jsonb; item jsonb; r jsonb; cell jsonb; k text; v jsonb; width integer;
begin
  if p_body is null or jsonb_typeof(p_body) <> 'object' then raise exception 'invalid document object' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_body)) <> 6
    or exists(select 1 from jsonb_object_keys(p_body) x where x not in ('schema_version','title','kind','links','source','blocks'))
    or p_body->'schema_version' is distinct from '1'::jsonb
    or jsonb_typeof(p_body->'title') is distinct from 'string' or length(btrim(p_body->>'title')) < 1 or length(p_body->>'title') > 200
    or coalesce(p_body->>'kind','') not in ('document','note','contract')
    or octet_length(p_body::text) > 1000000 then raise exception 'invalid document header or size' using errcode='22023'; end if;
  if jsonb_typeof(p_body->'links') is distinct from 'object' then raise exception 'invalid document links' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_body->'links')) <> 3 then raise exception 'invalid document links' using errcode='22023'; end if;
  for k,v in select * from jsonb_each(p_body->'links') loop
    if k not in ('lead_id','provider_id','direction_id') or (v <> 'null'::jsonb and
      (jsonb_typeof(v) <> 'string' or (k='direction_id' and (v#>>'{}') !~ '^[a-zA-Z0-9_-]{1,80}$')
        or (k<>'direction_id' and (v#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))) then
      raise exception 'invalid document link' using errcode='22023'; end if;
  end loop;
  v := p_body->'source';
  if v <> 'null'::jsonb then
    if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid source' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(v)) <> 3
      or exists(select 1 from jsonb_object_keys(v) x where x not in ('label','text','url'))
      or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) < 1 or length(v->>'label') > 200
      or jsonb_typeof(v->'text') is distinct from 'string' or length(v->>'text') > 200000
      or jsonb_typeof(v->'url') is distinct from 'string' or length(v->>'url') > 2000
      or (v->>'url' <> '' and v->>'url' !~* '^https?://[^[:space:]]+$') then raise exception 'invalid source fields' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(p_body->'blocks') is distinct from 'array' then raise exception 'invalid blocks' using errcode='22023'; end if;
  if jsonb_array_length(p_body->'blocks') > 100 then raise exception 'too many blocks' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_body->'blocks') x group by x->>'id' having count(*) > 1) then raise exception 'duplicate block ids' using errcode='22023'; end if;
  for b in select * from jsonb_array_elements(p_body->'blocks') loop
    if jsonb_typeof(b) is distinct from 'object' then raise exception 'invalid block object' using errcode='22023'; end if;
    if jsonb_typeof(b->'id') is distinct from 'string' or coalesce(b->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid block id' using errcode='22023'; end if;
    case b->>'type'
      when 'text', 'heading', 'callout' then
        if (select count(*) from jsonb_object_keys(b)) <> 3
          or exists(select 1 from jsonb_object_keys(b) x where x not in ('id','type','text'))
          or jsonb_typeof(b->'text') is distinct from 'string' or length(b->>'text') > 50000 then raise exception 'invalid text block' using errcode='22023'; end if;
      when 'list', 'checklist' then
        if (select count(*) from jsonb_object_keys(b)) <> 3
          or exists(select 1 from jsonb_object_keys(b) x where x not in ('id','type','items'))
          or jsonb_typeof(b->'items') is distinct from 'array' then raise exception 'invalid list block' using errcode='22023'; end if;
        if jsonb_array_length(b->'items') > 100 then raise exception 'too many list items' using errcode='22023'; end if;
        for item in select * from jsonb_array_elements(b->'items') loop
          if jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid list item' using errcode='22023'; end if;
          if (select count(*) from jsonb_object_keys(item)) <> 2
            or exists(select 1 from jsonb_object_keys(item) x where x not in ('text','checked'))
            or jsonb_typeof(item->'text') is distinct from 'string' or length(item->>'text') > 2000
            or jsonb_typeof(item->'checked') is distinct from 'boolean' then raise exception 'invalid list item fields' using errcode='22023'; end if;
        end loop;
      when 'table' then
        if (select count(*) from jsonb_object_keys(b)) <> 3
          or exists(select 1 from jsonb_object_keys(b) x where x not in ('id','type','rows'))
          or jsonb_typeof(b->'rows') is distinct from 'array' then raise exception 'invalid table block' using errcode='22023'; end if;
        if jsonb_array_length(b->'rows') not between 1 and 50 or jsonb_typeof(b->'rows'->0) is distinct from 'array' then raise exception 'invalid table dimensions' using errcode='22023'; end if;
        width := jsonb_array_length(b->'rows'->0);
        if width not between 1 and 8 then raise exception 'invalid table width' using errcode='22023'; end if;
        for r in select * from jsonb_array_elements(b->'rows') loop
          if jsonb_typeof(r) is distinct from 'array' then raise exception 'invalid table row' using errcode='22023'; end if;
          if jsonb_array_length(r) <> width then raise exception 'ragged table' using errcode='22023'; end if;
          for cell in select * from jsonb_array_elements(r) loop
            if jsonb_typeof(cell) is distinct from 'string' or length(cell#>>'{}') > 2000 then raise exception 'invalid table cell' using errcode='22023'; end if;
          end loop;
        end loop;
      when 'link' then
        if (select count(*) from jsonb_object_keys(b)) <> 4
          or exists(select 1 from jsonb_object_keys(b) x where x not in ('id','type','label','url'))
          or jsonb_typeof(b->'label') is distinct from 'string' or length(b->>'label') > 200
          or jsonb_typeof(b->'url') is distinct from 'string' or length(b->>'url') > 2000
          or b->>'url' !~* '^https?://[^[:space:]]+$' then raise exception 'invalid material link' using errcode='22023'; end if;
      else raise exception 'unsupported block type' using errcode='22023';
    end case;
  end loop;
end;
$$;
revoke all on function private.validate_offerpsp_work_document(jsonb) from public, anon, authenticated, service_role;

create function public.list_offerpsp_work_documents(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 then raise exception 'invalid offset' using errcode='22023'; end if;
  return jsonb_build_object('total',(select count(*) from private.offerpsp_work_documents),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision,'title',d.body->>'title',
      'kind',d.body->>'kind','links',d.body->'links','updated_at',d.updated_at) order by d.updated_at desc,d.id)
      from (select * from private.offerpsp_work_documents order by updated_at desc,id limit 50 offset p_offset) d),'[]'::jsonb));
end;
$$;
create function public.get_offerpsp_work_document(p_document_id uuid, p_revision integer default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d private.offerpsp_work_documents; h private.offerpsp_work_document_history; result jsonb;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  select * into d from private.offerpsp_work_documents where id=p_document_id;
  if not found then raise exception 'document not found' using errcode='P0002'; end if;
  if p_revision is null then
    result := jsonb_build_object('id',d.id,'revision',d.revision,'body',d.body,'updated_at',d.updated_at);
  else
    select * into h from private.offerpsp_work_document_history where document_id=p_document_id and revision=p_revision;
    if not found then raise exception 'version not found' using errcode='P0002'; end if;
    result := jsonb_build_object('id',d.id,'revision',h.revision,'body',h.body,'updated_at',h.created_at);
  end if;
  return result || jsonb_build_object('current_revision',d.revision,'history',coalesce((select jsonb_agg(to_jsonb(v) order by revision desc)
    from (select revision,created_at from private.offerpsp_work_document_history where document_id=p_document_id order by revision desc limit 100) v),'[]'::jsonb));
end;
$$;
create function public.save_offerpsp_work_document(p_document_id uuid, p_expected_revision integer, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d private.offerpsp_work_documents; prior_revision integer;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  if p_document_id is null or p_expected_revision is null or p_expected_revision < 0 then raise exception 'invalid document identity' using errcode='22023'; end if;
  perform private.validate_offerpsp_work_document(p_body);
  -- Serialize first creation too; hash collisions only cause harmless extra serialization.
  perform pg_advisory_xact_lock(716403119,hashtext(p_document_id::text));
  select * into d from private.offerpsp_work_documents where id=p_document_id for update;
  prior_revision := coalesce(d.revision,0);
  if prior_revision <> p_expected_revision then
    return jsonb_build_object('outcome','conflict','current_revision',prior_revision);
  end if;
  if d.id is not null and d.body->'source' <> 'null'::jsonb and d.body->'source' is distinct from p_body->'source' then
    raise exception 'source snapshot is immutable; create a new document copy' using errcode='22023';
  end if;
  if p_body->'links'->>'lead_id' is not null and not exists(select 1 from public.offerpsp_leads where lead_id=(p_body->'links'->>'lead_id')::uuid) then raise exception 'linked client not found' using errcode='22023'; end if;
  if p_body->'links'->>'provider_id' is not null and not exists(select 1 from private.offerpsp_providers where id=(p_body->'links'->>'provider_id')::uuid) then raise exception 'linked provider not found' using errcode='22023'; end if;
  if p_body->'links'->>'direction_id' is not null and not exists(select 1 from private.offerpsp_course_plan p, lateral jsonb_array_elements(p.plan->'directions') x where x->>'id'=p_body->'links'->>'direction_id') then raise exception 'linked direction not found; save course first' using errcode='22023'; end if;
  insert into private.offerpsp_work_documents(id,revision,body,created_by,updated_by)
    values(p_document_id,prior_revision+1,p_body,auth.uid(),auth.uid())
    on conflict(id) do update set revision=excluded.revision,body=excluded.body,updated_by=excluded.updated_by,updated_at=clock_timestamp()
    returning * into d;
  insert into private.offerpsp_work_document_history(document_id,revision,body,actor_user_id)
    values(d.id,d.revision,d.body,auth.uid());
  return jsonb_build_object('outcome','saved','id',d.id,'revision',d.revision,'body',d.body,'updated_at',d.updated_at);
end;
$$;
revoke all on function public.list_offerpsp_work_documents(integer), public.get_offerpsp_work_document(uuid,integer), public.save_offerpsp_work_document(uuid,integer,jsonb) from public, anon, service_role;
grant execute on function public.list_offerpsp_work_documents(integer), public.get_offerpsp_work_document(uuid,integer), public.save_offerpsp_work_document(uuid,integer,jsonb) to authenticated;
