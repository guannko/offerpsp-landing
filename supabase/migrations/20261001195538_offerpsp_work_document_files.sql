-- Immutable staff originals. Upload reservation and completion are separate receipts.
create table private.offerpsp_work_document_files (
  id uuid primary key,
  document_id uuid not null references private.offerpsp_work_documents(id),
  attached_revision integer not null check(attached_revision > 0),
  filename text not null check(length(filename) between 1 and 200),
  format text not null check(format in ('docx','pdf')),
  size_bytes integer not null check(size_bytes between 1 and 15728640),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  object_path text not null unique,
  extracted_text text not null check(length(extracted_text) <= 200000),
  status text not null default 'pending' check(status in ('pending','ready')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(document_id,sha256)
);
create index offerpsp_work_files_document_idx on private.offerpsp_work_document_files(document_id,created_at,id);
alter table private.offerpsp_work_document_files enable row level security;
revoke all on private.offerpsp_work_document_files from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offerpsp-work-originals','offerpsp-work-originals',false,15728640,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

-- Required by Storage RLS, not exposed through PostgREST. No user-editable claims.
create function private.offerpsp_work_file_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_offerpsp_staff() and exists(
    select 1 from private.offerpsp_work_document_files f where f.object_path=p_path
      and f.status='pending' and f.created_by=auth.uid())
$$;
revoke all on function private.offerpsp_work_file_upload_allowed(text) from public,anon,authenticated,service_role;
grant execute on function private.offerpsp_work_file_upload_allowed(text) to authenticated;
create policy offerpsp_work_originals_staff_read on storage.objects
for select to authenticated using(bucket_id='offerpsp-work-originals' and auth.uid() is not null and public.is_offerpsp_staff());
create policy offerpsp_work_originals_staff_insert on storage.objects
for insert to authenticated with check(bucket_id='offerpsp-work-originals' and private.offerpsp_work_file_upload_allowed(name));
-- Deliberately no UPDATE or DELETE policy; upsert/replace is forbidden.

create function public.reserve_offerpsp_work_file(p_document_id uuid,p_expected_revision integer,p_file_id uuid,
  p_filename text,p_format text,p_size integer,p_sha256 text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision integer; f private.offerpsp_work_document_files%rowtype;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  if p_file_id is null or p_filename is null or length(btrim(p_filename)) not between 1 and 200
    or p_filename ~ '[[:cntrl:]]' or p_format is null or p_format not in ('pdf','docx')
    or lower(p_filename) not like '%.'||p_format or p_size is null or p_size not between 1 and 15728640
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_text is null or length(p_text)>200000 then
    raise exception 'invalid file metadata' using errcode='22023'; end if;
  select revision into v_revision from private.offerpsp_work_documents where id=p_document_id for update;
  if not found then raise exception 'save document before uploading' using errcode='22023'; end if;
  if v_revision is distinct from p_expected_revision then raise exception 'document revision conflict' using errcode='40001'; end if;
  select * into f from private.offerpsp_work_document_files where document_id=p_document_id and sha256=p_sha256;
  if found then
    if f.filename<>p_filename or f.format<>p_format or f.size_bytes<>p_size or f.extracted_text<>p_text then
      raise exception 'existing original metadata differs' using errcode='22023'; end if;
    if f.status='pending' and f.created_by<>auth.uid() then raise exception 'original upload pending with another staff user' using errcode='55000'; end if;
    return to_jsonb(f)-'extracted_text'-'created_by';
  end if;
  if (select count(*) from private.offerpsp_work_document_files where document_id=p_document_id)>=20 then
    raise exception 'maximum 20 originals per document' using errcode='22023'; end if;
  insert into private.offerpsp_work_document_files(id,document_id,attached_revision,filename,format,size_bytes,sha256,object_path,extracted_text,created_by)
  values(p_file_id,p_document_id,v_revision,p_filename,p_format,p_size,p_sha256,p_document_id::text||'/'||p_file_id::text||'.'||p_format,p_text,auth.uid()) returning * into f;
  return to_jsonb(f)-'extracted_text'-'created_by';
end;
$$;

create function public.complete_offerpsp_work_file(p_file_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.offerpsp_work_document_files%rowtype; v_metadata jsonb;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  select * into f from private.offerpsp_work_document_files where id=p_file_id for update;
  if not found then raise exception 'original not found' using errcode='22023'; end if;
  if f.status='ready' then return to_jsonb(f)-'extracted_text'-'created_by'; end if;
  if f.created_by<>auth.uid() then raise exception 'upload belongs to another staff user' using errcode='42501'; end if;
  select metadata into v_metadata from storage.objects where bucket_id='offerpsp-work-originals' and name=f.object_path;
  if not found or v_metadata->>'size' is distinct from f.size_bytes::text or v_metadata->>'mimetype' is distinct from
    (case when f.format='pdf' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end) then
    raise exception 'original upload not confirmed' using errcode='55000'; end if;
  update private.offerpsp_work_document_files set status='ready',completed_at=now() where id=f.id returning * into f;
  return to_jsonb(f)-'extracted_text'-'created_by';
end;
$$;

create function public.list_offerpsp_work_files(p_document_id uuid,p_revision integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  if not exists(select 1 from private.offerpsp_work_document_history where document_id=p_document_id and revision=p_revision) then
    raise exception 'document version not found' using errcode='22023'; end if;
  return jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f)-'extracted_text'-'created_by' order by f.created_at,f.id)
    from private.offerpsp_work_document_files f where f.document_id=p_document_id and f.attached_revision<=p_revision),'[]'::jsonb));
end;
$$;
create function public.get_offerpsp_work_file(p_file_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f private.offerpsp_work_document_files%rowtype;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then raise exception 'staff access required' using errcode='42501'; end if;
  select * into f from private.offerpsp_work_document_files where id=p_file_id and status='ready';
  if not found then raise exception 'original not ready or not found' using errcode='22023'; end if;
  return to_jsonb(f)-'created_by';
end;
$$;
revoke all on function public.reserve_offerpsp_work_file(uuid,integer,uuid,text,text,integer,text,text),
  public.complete_offerpsp_work_file(uuid),public.list_offerpsp_work_files(uuid,integer),public.get_offerpsp_work_file(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_offerpsp_work_file(uuid,integer,uuid,text,text,integer,text,text),
  public.complete_offerpsp_work_file(uuid),public.list_offerpsp_work_files(uuid,integer),public.get_offerpsp_work_file(uuid) to authenticated;
