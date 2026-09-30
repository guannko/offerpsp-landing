-- Reversible mail trash with a 15-day retention window. New inbound or
-- outbound activity restores a trashed thread automatically through the
-- status trigger, so a partner reply can never remain hidden in the trash.

alter table public.offerpsp_email_threads
  add column if not exists trashed_at timestamptz,
  add column if not exists trashed_from_status text;

alter table public.offerpsp_email_threads
  drop constraint if exists offerpsp_email_threads_status_check;
alter table public.offerpsp_email_threads
  add constraint offerpsp_email_threads_status_check
  check (status in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived', 'trashed'));

alter table public.offerpsp_email_threads
  drop constraint if exists offerpsp_email_threads_trashed_from_status_check;
alter table public.offerpsp_email_threads
  add constraint offerpsp_email_threads_trashed_from_status_check
  check (trashed_from_status is null or trashed_from_status in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived'));

create index if not exists offerpsp_email_threads_trash_retention_idx
  on public.offerpsp_email_threads (trashed_at, id)
  where status = 'trashed';

create or replace function private.offerpsp_email_thread_trash_fields()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  if new.status = 'trashed' and old.status is distinct from 'trashed' then
    new.trashed_at := now();
    new.trashed_from_status := old.status;
  elsif new.status <> 'trashed' and old.status = 'trashed' then
    new.trashed_at := null;
    new.trashed_from_status := null;
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_email_threads_manage_trash on public.offerpsp_email_threads;
create trigger offerpsp_email_threads_manage_trash
before update of status on public.offerpsp_email_threads
for each row execute function private.offerpsp_email_thread_trash_fields();

create or replace function public.set_offerpsp_email_thread_state(
  p_thread_id uuid,
  p_status text,
  p_mark_read boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_thread public.offerpsp_email_threads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived', 'trashed', 'restore') then
    raise exception 'Unsupported email thread status';
  end if;

  update public.offerpsp_email_threads
  set status = case
        when p_status = 'restore' then coalesce(trashed_from_status, 'open')
        else p_status
      end,
      unread_count = case when p_mark_read is true then 0 else unread_count end,
      updated_at = now()
  where id = p_thread_id
    and (p_status <> 'restore' or status = 'trashed')
  returning * into v_thread;

  if not found then raise exception 'Email thread not found or cannot be restored'; end if;

  if p_mark_read is true then
    update public.offerpsp_email_messages
    set is_read = true
    where thread_id = p_thread_id and direction = 'inbound';
  elsif p_mark_read is false then
    update public.offerpsp_email_messages
    set is_read = false
    where id = (
      select id
      from public.offerpsp_email_messages
      where thread_id = p_thread_id and direction = 'inbound'
      order by coalesce(received_at, created_at) desc, created_at desc
      limit 1
    );

    update public.offerpsp_email_threads
    set unread_count = (
          select count(*)::integer
          from public.offerpsp_email_messages
          where thread_id = p_thread_id
            and direction = 'inbound'
            and is_read is false
        ),
        updated_at = now()
    where id = p_thread_id
    returning * into v_thread;
  end if;

  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.set_offerpsp_email_thread_state(uuid, text, boolean)
  from public, anon;
grant execute on function public.set_offerpsp_email_thread_state(uuid, text, boolean)
  to authenticated;

create or replace function private.purge_offerpsp_email_trash()
returns integer
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from public.offerpsp_email_threads
  where status = 'trashed'
    and trashed_at <= now() - interval '15 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.purge_offerpsp_email_trash()
  from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'offerpsp-purge-email-trash'
  ) then
    perform cron.schedule(
      'offerpsp-purge-email-trash',
      '17 2 * * *',
      'select private.purge_offerpsp_email_trash();'
    );
  end if;
end $$;

create or replace function public.get_offerpsp_mail_center(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'threads', (select count(*) from public.offerpsp_email_threads where status not in ('archived', 'trashed')),
      'unread', (select coalesce(sum(unread_count), 0) from public.offerpsp_email_threads where status not in ('archived', 'trashed')),
      'awaiting_reply', (select count(*) from public.offerpsp_email_threads where status = 'awaiting_reply'),
      'follow_up', (select count(*) from public.offerpsp_email_threads where status = 'follow_up'),
      'overdue_follow_up', (select count(*) from public.offerpsp_email_threads where follow_up_at <= now() and status not in ('closed', 'archived', 'trashed')),
      'flagged', (select count(*) from public.offerpsp_email_threads where is_flagged and status not in ('closed', 'archived', 'trashed')),
      'trash', (select count(*) from public.offerpsp_email_threads where status = 'trashed'),
      'attachments_to_review', (
        select count(*)
        from public.offerpsp_email_attachments a
        join public.offerpsp_email_messages m on m.id = a.message_id
        join public.offerpsp_email_threads t on t.id = m.thread_id
        where a.document_type is null and t.status <> 'trashed'
      )
    ),
    'threads', coalesce((
      select jsonb_agg(to_jsonb(t) order by
        case t.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
        t.last_message_at desc)
      from (
        select id, subject, participant_email, counterparty_type, counterparty_id,
          lead_id, status, unread_count, assigned_to, last_message_at, tags,
          priority, is_flagged, follow_up_at, organizer_notes, ai_summary,
          ai_summary_generated_at, last_organized_at, trashed_at, trashed_from_status,
          metadata, created_at, updated_at
        from public.offerpsp_email_threads
        order by last_message_at desc
        limit greatest(1, least(coalesce(p_limit, 200), 500))
      ) t
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at asc)
      from (
        select id, thread_id, direction, sender_email, recipient_emails, cc_emails,
          subject, text_body, html_body, external_message_id, in_reply_to,
          message_references, provider, delivery_status, is_read, source_draft_id,
          sent_at, received_at, created_at
        from public.offerpsp_email_messages
        where thread_id in (
          select id from public.offerpsp_email_threads
          order by last_message_at desc
          limit greatest(1, least(coalesce(p_limit, 200), 500))
        )
        order by created_at asc
      ) m
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'message_id', a.message_id,
        'filename', a.filename,
        'content_type', a.content_type,
        'size_bytes', a.size_bytes,
        'storage_bucket', a.storage_bucket,
        'storage_path', a.storage_path,
        'extraction_method', a.extraction_method,
        'extraction_error', a.extraction_error,
        'has_extracted_text', nullif(trim(a.extracted_text), '') is not null,
        'provider_id', a.provider_id,
        'provider_name', p.brand_name,
        'document_type', a.document_type,
        'document_id', a.document_id,
        'target_entity_type', a.target_entity_type,
        'target_entity_id', a.target_entity_id,
        'target_entity_name', case
          when a.target_entity_type = 'provider' then target_provider.brand_name
          when a.target_entity_type = 'merchant' then coalesce(target_lead.company, target_lead.name, target_lead.work_email)
        end,
        'ingestion_job_id', a.ingestion_job_id,
        'status', a.status,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.offerpsp_email_attachments a
      left join private.offerpsp_providers p on p.id = a.provider_id
      left join private.offerpsp_providers target_provider
        on a.target_entity_type = 'provider' and target_provider.id = a.target_entity_id
      left join public.offerpsp_leads target_lead
        on a.target_entity_type = 'merchant' and target_lead.lead_id = a.target_entity_id
      where a.message_id in (
        select m.id from public.offerpsp_email_messages m
        join public.offerpsp_email_threads t on t.id = m.thread_id
        where t.status <> 'trashed'
        order by t.last_message_at desc
        limit greatest(1, least(coalesce(p_limit, 200), 500))
      )
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'template_code', template_code,
        'name', name,
        'category', category,
        'language', language,
        'subject_template', subject_template,
        'body_template', body_template
      ) order by sort_order, name)
      from public.offerpsp_email_templates
      where active
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_offerpsp_mail_center(integer)
  from public, anon, authenticated;
grant execute on function public.get_offerpsp_mail_center(integer)
  to authenticated;

comment on column public.offerpsp_email_threads.trashed_at is
  'Timestamp when a staff user moved the thread to trash; automatic purge starts after 15 days.';
comment on function private.purge_offerpsp_email_trash() is
  'Deletes email threads and their cascading database records after 15 full days in trash.';
