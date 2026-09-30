-- Keep the legacy full-snapshot RPC unchanged for existing consumers.
-- The UI loads text/search evidence first; full HTML is fetched for one thread.
CREATE OR REPLACE FUNCTION public.get_offerpsp_mail_index(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          subject, text_body, null::text as html_body, false as body_loaded, external_message_id, in_reply_to,
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
        where m.thread_id in (
          select t.id from public.offerpsp_email_threads t
          where t.status <> 'trashed'
          order by t.last_message_at desc
          limit greatest(1, least(coalesce(p_limit, 200), 500))
        )
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
$function$
;
create or replace function public.get_offerpsp_mail_thread(p_thread_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists(select 1 from public.offerpsp_email_threads where id=p_thread_id) then
    raise exception 'Email thread not found';
  end if;
  return jsonb_build_object('thread_id',p_thread_id,'messages',coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at,m.id)
    from (
      select id,thread_id,direction,sender_email,recipient_emails,cc_emails,subject,
        text_body,html_body,true as body_loaded,external_message_id,in_reply_to,
        message_references,provider,delivery_status,is_read,source_draft_id,
        sent_at,received_at,created_at
      from public.offerpsp_email_messages where thread_id=p_thread_id
    ) m
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.get_offerpsp_mail_index(integer) from public,anon,authenticated,service_role;
revoke all on function public.get_offerpsp_mail_thread(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_offerpsp_mail_index(integer) to authenticated;
grant execute on function public.get_offerpsp_mail_thread(uuid) to authenticated;
