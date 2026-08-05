create or replace function public.aibot_n8n_get_chat_history(
  p_chat_id text,
  p_limit integer default 30
)
returns table(role text, message text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select history.role, history.message, history.created_at
  from (
    select logs.role, logs.message, logs.created_at
    from public.chat_logs logs
    where logs.chat_id = p_chat_id
    order by logs.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) history
  order by history.created_at;
$$;

create or replace function public.aibot_n8n_save_chat_history(
  p_chat_id text,
  p_user_message text default null,
  p_assistant_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if nullif(trim(p_chat_id), '') is null then
    return jsonb_build_object('status', 'skipped', 'count', 0);
  end if;

  if nullif(trim(p_user_message), '') is not null then
    insert into public.chat_logs(chat_id, role, message)
    values (p_chat_id, 'user', left(p_user_message, 2000));
    v_count := v_count + 1;
  end if;

  if nullif(trim(p_assistant_message), '') is not null then
    insert into public.chat_logs(chat_id, role, message)
    values (p_chat_id, 'assistant', left(p_assistant_message, 2000));
    v_count := v_count + 1;
  end if;

  return jsonb_build_object(
    'status', case when v_count > 0 then 'saved' else 'skipped' end,
    'count', v_count,
    'chat_id', p_chat_id
  );
end;
$$;

create or replace function public.aibot_n8n_mark_email_sent(
  p_draft_id bigint,
  p_chat_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_draft public.email_drafts;
begin
  update public.email_drafts
  set status = 'sent'
  where id = p_draft_id
    and (p_chat_id is null or chat_id = p_chat_id)
  returning * into v_draft;

  if not found then
    raise exception 'Email draft not found';
  end if;

  if nullif(trim(v_draft.lead_internal_id), '') is not null then
    update public.casino_leads
    set contact_status = 'in_progress',
        emails_sent = coalesce(emails_sent, 0) + 1,
        last_contacted_at = now(),
        updated_at = now()
    where internal_id = v_draft.lead_internal_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'draftId', v_draft.id,
    'chatId', v_draft.chat_id,
    'toEmail', v_draft.to_email,
    'subject', v_draft.subject,
    'leadInternalId', v_draft.lead_internal_id
  );
end;
$$;

create or replace function public.aibot_n8n_ingest_casino_batch(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_website text;
  v_domain text;
  v_internal_id text;
  v_next_number integer;
  v_score integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Casino batch must be a JSON array';
  end if;

  perform pg_advisory_xact_lock(hashtext('aibot_casino_internal_id'));
  select coalesce(max(nullif(regexp_replace(internal_id, '\\D', '', 'g'), '')::integer), 0) + 1
  into v_next_number
  from public.casino_leads;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_website := nullif(trim(v_item ->> 'website'), '');
    v_domain := lower(regexp_replace(coalesce(v_website, ''), '^https?://(www\\.)?', '', 'i'));
    v_domain := split_part(split_part(v_domain, '/', 1), '?', 1);

    if v_domain = '' then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'skipped', 'reason', 'no_website', 'name', v_item ->> 'name'
      ));
      continue;
    end if;

    if exists (
      select 1
      from public.casino_leads leads
      where lower(regexp_replace(coalesce(leads.website, ''), '^https?://(www\\.)?', '', 'i'))
        like v_domain || '%'
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'duplicate', 'website', v_website, 'name', v_item ->> 'name'
      ));
      continue;
    end if;

    v_internal_id := 'CAS-' || lpad(v_next_number::text, 4, '0');
    v_next_number := v_next_number + 1;
    v_score := greatest(0, least(coalesce(nullif(v_item ->> 'score', '')::integer, 0), 10));

    insert into public.casino_leads(
      internal_id, name, website, email, telegram, phone, license, score,
      source, sphere, contact_status, notes, updated_at
    ) values (
      v_internal_id,
      coalesce(nullif(trim(v_item ->> 'name'), ''), 'Unknown'),
      v_website,
      nullif(lower(trim(v_item ->> 'email')), ''),
      nullif(trim(v_item ->> 'telegram'), ''),
      nullif(trim(v_item ->> 'phone'), ''),
      nullif(trim(v_item ->> 'license'), ''),
      v_score,
      coalesce(nullif(trim(v_item ->> 'source'), ''), 'n8n-hunter'),
      'iGaming',
      'not_contacted',
      nullif(trim(v_item ->> 'notes'), ''),
      now()
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', 'inserted', 'website', v_website, 'name', v_item ->> 'name',
      'internal_id', v_internal_id
    ));
  end loop;

  return v_results;
end;
$$;

create or replace function public.aibot_n8n_update_casino_enrichment(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_internal_id text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Casino enrichment batch must be a JSON array';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_internal_id := nullif(trim(v_item ->> 'internal_id'), '');
    if v_internal_id is null then
      v_results := v_results || jsonb_build_array(v_item || jsonb_build_object('enriched', false));
      continue;
    end if;

    update public.casino_leads
    set enriched_emails = coalesce(v_item -> 'enriched_emails', '[]'::jsonb),
        updated_at = now()
    where internal_id = v_internal_id;

    v_results := v_results || jsonb_build_array(
      (v_item - 'enriched_emails') || jsonb_build_object('enriched', found)
    );
  end loop;

  return v_results;
end;
$$;

create or replace function public.aibot_n8n_update_casino_research(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_internal_id text;
  v_notes text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Casino research batch must be a JSON array';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_internal_id := nullif(trim(v_item ->> 'internal_id'), '');
    v_notes := nullif(trim(v_item ->> 'notes'), '');
    if v_internal_id is null or v_notes is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status', 'no_data', 'internal_id', v_internal_id
      ));
      continue;
    end if;

    update public.casino_leads
    set notes = left(v_notes, 500), updated_at = now()
    where internal_id = v_internal_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', case when found then 'researched' else 'not_found' end,
      'internal_id', v_internal_id,
      'notes', left(v_notes, 500)
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.aibot_n8n_get_chat_history(text, integer) from public, anon, authenticated;
revoke all on function public.aibot_n8n_save_chat_history(text, text, text) from public, anon, authenticated;
revoke all on function public.aibot_n8n_mark_email_sent(bigint, text) from public, anon, authenticated;
revoke all on function public.aibot_n8n_ingest_casino_batch(jsonb) from public, anon, authenticated;
revoke all on function public.aibot_n8n_update_casino_enrichment(jsonb) from public, anon, authenticated;
revoke all on function public.aibot_n8n_update_casino_research(jsonb) from public, anon, authenticated;

grant execute on function public.aibot_n8n_get_chat_history(text, integer) to service_role;
grant execute on function public.aibot_n8n_save_chat_history(text, text, text) to service_role;
grant execute on function public.aibot_n8n_mark_email_sent(bigint, text) to service_role;
grant execute on function public.aibot_n8n_ingest_casino_batch(jsonb) to service_role;
grant execute on function public.aibot_n8n_update_casino_enrichment(jsonb) to service_role;
grant execute on function public.aibot_n8n_update_casino_research(jsonb) to service_role;
