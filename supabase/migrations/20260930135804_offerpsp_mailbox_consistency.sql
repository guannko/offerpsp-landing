-- Import Spark/IMAP Sent evidence without creating a second sending path.
-- No historical messages or business records are rewritten by this migration.

create or replace function public.aibot_n8n_ingest_email(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_sender text := private.offerpsp_mail_extract_email(coalesce(p_payload->>'from_email',p_payload->>'from'));
  v_direction text := coalesce(nullif(p_payload->>'direction',''),'inbound');
  v_subject text := coalesce(nullif(trim(p_payload->>'subject'),''),'(no subject)');
  v_external text := nullif(trim(p_payload->>'message_id'),'');
  v_reply text := nullif(trim(p_payload->>'in_reply_to'),'');
  v_references text[] := private.offerpsp_jsonb_text_array(p_payload->'references');
  v_to text[] := private.offerpsp_jsonb_text_array(p_payload->'to');
  v_cc text[] := private.offerpsp_jsonb_text_array(p_payload->'cc');
  v_own text;
  v_participant text;
  v_counterparty jsonb;
  v_thread_id uuid;
  v_thread_key text;
  v_message_id uuid;
  v_at timestamptz;
  v_read boolean;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Email payload must be an object'; end if;
  if coalesce(v_sender,'') = '' or position('@' in v_sender)=0 then raise exception 'Sender email is required'; end if;
  if v_direction not in ('inbound','outbound') then raise exception 'Unsupported mail direction'; end if;
  if v_direction='outbound' then
    select lower(configuration->>'from_email') into v_own
    from private.offerpsp_integration_settings where integration_key='email';
    v_own := coalesce(nullif(v_own,''),'bizdev@offerpsp.com');
    if v_sender<>v_own or lower(coalesce(p_payload->>'mailbox_account',''))<>v_own then
      raise exception 'Sent evidence must belong to the configured OfferPSP account';
    end if;
    select private.offerpsp_mail_extract_email(address) into v_participant
    from unnest(v_to) address where lower(address)<>v_own limit 1;
    if v_participant is null then raise exception 'Sent evidence requires an external recipient'; end if;
  else v_participant := v_sender;
  end if;
  v_counterparty := private.offerpsp_mail_resolve_counterparty(v_participant);
  if v_counterparty->>'type'='general' then
    -- Reuse an already-recorded exact-address association, never a domain guess.
    select jsonb_build_object('type',min(counterparty_type),'id',min(counterparty_id),
      'lead_id',min(lead_id::text)) into v_counterparty
    from public.offerpsp_email_threads
    where lower(participant_email)=v_participant and counterparty_id is not null
      and counterparty_type<>'general'
    having count(distinct (counterparty_type,counterparty_id))=1;
    v_counterparty := coalesce(v_counterparty,jsonb_build_object('type','general','id',null));
  end if;

  if v_external is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_external,0));
    select id,thread_id into v_message_id,v_thread_id
    from public.offerpsp_email_messages where external_message_id=v_external limit 1;
    if v_message_id is not null then
      return jsonb_build_object('success',true,'duplicate',true,'thread_id',v_thread_id,'message_id',v_message_id);
    end if;
  end if;
  begin v_at := nullif(p_payload->>'received_at','')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then v_at := null; end;
  v_at := coalesce(v_at,now());
  v_read := v_direction='outbound' or coalesce((p_payload->>'is_read')::boolean,false);

  -- References win over subject heuristics, but only within the same contact/company.
  select t.id,t.thread_key into v_thread_id,v_thread_key
  from public.offerpsp_email_messages m join public.offerpsp_email_threads t on t.id=m.thread_id
  where (m.external_message_id=v_reply or m.external_message_id=any(v_references)
    or (v_direction='outbound' and v_external is not null
      and (m.in_reply_to=v_external or v_external=any(m.message_references))))
    and (lower(t.participant_email)=v_participant
      or (t.counterparty_type=v_counterparty->>'type' and t.counterparty_id=v_counterparty->>'id'))
  order by (m.external_message_id=v_reply) desc nulls last,m.created_at desc limit 1;
  v_thread_key := coalesce(v_thread_key,md5(v_participant||'|'||private.offerpsp_mail_normalize_subject(v_subject)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('thread:'||v_thread_key,0));
  insert into public.offerpsp_email_threads(
    thread_key,subject,participant_email,counterparty_type,counterparty_id,lead_id,
    status,unread_count,last_message_at,metadata
  ) values (
    v_thread_key,v_subject,v_participant,v_counterparty->>'type',v_counterparty->>'id',
    nullif(v_counterparty->>'lead_id','')::uuid,'open',case when v_read then 0 else 1 end,v_at,
    jsonb_build_object('last_ingest_provider','imap_poller','last_ingest_direction',v_direction)
  ) on conflict(thread_key) do update set
    subject=case when excluded.last_message_at>=offerpsp_email_threads.last_message_at then excluded.subject else offerpsp_email_threads.subject end,
    counterparty_type=case when offerpsp_email_threads.counterparty_type='general' then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id=coalesce(offerpsp_email_threads.counterparty_id,excluded.counterparty_id),
    lead_id=coalesce(offerpsp_email_threads.lead_id,excluded.lead_id),
    -- Backfill cannot reopen a terminal thread or rewind a newer operator decision.
    status=case when offerpsp_email_threads.status in ('closed','archived','trashed') then offerpsp_email_threads.status
      when v_direction='inbound' and v_at>=offerpsp_email_threads.last_message_at then 'open'
      else offerpsp_email_threads.status end,
    follow_up_at=case when v_direction='inbound' and v_at>=offerpsp_email_threads.last_message_at
      and offerpsp_email_threads.status not in ('closed','archived','trashed') then null else offerpsp_email_threads.follow_up_at end,
    unread_count=offerpsp_email_threads.unread_count+case when v_read then 0 else 1 end,
    last_message_at=greatest(offerpsp_email_threads.last_message_at,excluded.last_message_at),
    metadata=coalesce(offerpsp_email_threads.metadata,'{}')||jsonb_build_object('last_ingest_provider','imap_poller'),
    updated_at=now()
  returning id into v_thread_id;

  insert into public.offerpsp_email_messages(
    thread_id,direction,sender_email,recipient_emails,cc_emails,subject,text_body,html_body,
    external_message_id,in_reply_to,message_references,provider,delivery_status,is_read,
    sent_at,received_at,raw_headers,metadata,created_at
  ) values (
    v_thread_id,v_direction,v_sender,v_to,v_cc,v_subject,nullif(p_payload->>'text',''),nullif(p_payload->>'html',''),
    v_external,v_reply,v_references,'imap',case when v_direction='outbound' then 'sent' else 'received' end,v_read,
    case when v_direction='outbound' then v_at end,case when v_direction='inbound' then v_at end,
    coalesce(p_payload->'headers','{}'),
    (p_payload-array['text','html','headers','attachments'])||jsonb_build_object('ingest_source','vercel_imap_poller','response_expectation','not_inferred'),v_at
  ) returning id into v_message_id;
  return jsonb_build_object('success',true,'duplicate',false,'thread_id',v_thread_id,'message_id',v_message_id,
    'counterparty_type',v_counterparty->>'type','counterparty_id',v_counterparty->>'id');
end;
$$;
revoke all on function public.aibot_n8n_ingest_email(jsonb) from public,anon,authenticated;
grant execute on function public.aibot_n8n_ingest_email(jsonb) to service_role;
comment on function public.aibot_n8n_ingest_email(jsonb) is
  'Service-only idempotent INBOX/Sent evidence import; does not send mail or infer a reply expectation.';

-- A staff-confirmed thread link must also link its existing mail evidence to
-- the contact timeline. Append canonical events; never rewrite original mail.
create or replace function private.offerpsp_contact_history_from_thread_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_identity jsonb;
  v_message public.offerpsp_email_messages;
begin
  if new.counterparty_type='general' or new.counterparty_id is null then return new; end if;
  v_identity := private.offerpsp_contact_identity(new.counterparty_type,new.counterparty_id,new.participant_email);
  if v_identity is null then return new; end if;
  for v_message in select * from public.offerpsp_email_messages where thread_id=new.id
    and (direction='inbound' or delivery_status in ('sent','delivered','failed'))
  loop
    perform private.offerpsp_record_contact_event(
      v_identity->>'entity_type',v_identity->>'entity_id',
      case when v_message.direction='inbound' then 'email_received'
        when v_message.delivery_status='failed' then 'email_failed' else 'email_sent' end,
      'email',v_message.direction,coalesce(v_message.received_at,v_message.sent_at,v_message.created_at),
      'system',v_message.subject,
      case when v_message.direction='outbound' then 'Получатель: '||array_to_string(v_message.recipient_emails,', ')
        else 'Отправитель: '||v_message.sender_email end,
      'email_message',v_message.id::text,v_message.delivery_status,
      jsonb_build_object('thread_id',new.id,'provider',v_message.provider,'association_reconciled',true)
    );
  end loop;
  return new;
end;
$$;
revoke all on function private.offerpsp_contact_history_from_thread_link() from public,anon,authenticated,service_role;
create trigger offerpsp_contact_history_from_thread_link
after update of counterparty_type,counterparty_id on public.offerpsp_email_threads
for each row when (old.counterparty_type is distinct from new.counterparty_type
  or old.counterparty_id is distinct from new.counterparty_id)
execute function private.offerpsp_contact_history_from_thread_link();
