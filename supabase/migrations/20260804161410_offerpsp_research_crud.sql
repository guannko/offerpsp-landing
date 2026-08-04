alter table public.casino_leads
  add column if not exists record_state text not null default 'active'
    check (record_state in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.psp_providers
  add column if not exists record_state text not null default 'active'
    check (record_state in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists casino_leads_record_state_idx
  on public.casino_leads (record_state, updated_at desc);
create index if not exists psp_providers_record_state_idx
  on public.psp_providers (record_state, updated_at desc);

alter table private.offerpsp_entity_audit
  drop constraint if exists offerpsp_entity_audit_entity_type_check;
alter table private.offerpsp_entity_audit
  add constraint offerpsp_entity_audit_entity_type_check
  check (entity_type in (
    'merchant', 'provider', 'offer', 'organization', 'agent_assignment',
    'margin_policy', 'research_casino', 'research_psp'
  ));

create or replace function public.save_offerpsp_research_entity(
  p_entity_type text,
  p_record_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_casino_before public.casino_leads;
  v_casino_after public.casino_leads;
  v_psp_before public.psp_providers;
  v_psp_after public.psp_providers;
  v_name text;
  v_score integer;
  v_min_volume numeric;
  v_max_volume numeric;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('casino', 'psp') then
    raise exception 'Unsupported research entity type';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Research payload must be an object';
  end if;

  if p_entity_type = 'casino' then
    if p_record_id is null then
      v_name := nullif(trim(p_payload ->> 'name'), '');
      if v_name is null then raise exception 'Casino name is required'; end if;
      v_score := coalesce(private.offerpsp_jsonb_numeric(p_payload, 'score')::integer, 0);
      if v_score not between 0 and 100 then raise exception 'Score must be between 0 and 100'; end if;
      insert into public.casino_leads (
        name, website, description, geo, license, software, affiliate_program,
        sphere, email, contact_name, contact_title, telegram, phone, linkedin,
        contact_status, score, source, city, reply_status, next_follow_up, notes,
        tags, record_state, updated_at
      ) values (
        v_name, nullif(trim(p_payload ->> 'website'), ''), nullif(trim(p_payload ->> 'description'), ''),
        nullif(trim(p_payload ->> 'geo'), ''), nullif(trim(p_payload ->> 'license'), ''),
        nullif(trim(p_payload ->> 'software'), ''), nullif(trim(p_payload ->> 'affiliate_program'), ''),
        nullif(trim(p_payload ->> 'sphere'), ''), nullif(lower(trim(p_payload ->> 'email')), ''),
        nullif(trim(p_payload ->> 'contact_name'), ''), nullif(trim(p_payload ->> 'contact_title'), ''),
        nullif(trim(p_payload ->> 'telegram'), ''), nullif(trim(p_payload ->> 'phone'), ''),
        nullif(trim(p_payload ->> 'linkedin'), ''), coalesce(nullif(trim(p_payload ->> 'contact_status'), ''), 'not_contacted'),
        v_score, nullif(trim(p_payload ->> 'source'), ''), nullif(trim(p_payload ->> 'city'), ''),
        nullif(trim(p_payload ->> 'reply_status'), ''), nullif(trim(p_payload ->> 'next_follow_up'), '')::date,
        nullif(trim(p_payload ->> 'notes'), ''), private.offerpsp_jsonb_text_array(p_payload -> 'tags'),
        'active', now()
      ) returning * into v_casino_after;
    else
      select * into v_casino_before from public.casino_leads where id = p_record_id::integer for update;
      if not found then raise exception 'Casino record not found'; end if;
      v_name := case when p_payload ? 'name' then nullif(trim(p_payload ->> 'name'), '') else v_casino_before.name end;
      if v_name is null then raise exception 'Casino name is required'; end if;
      v_score := case when p_payload ? 'score' then private.offerpsp_jsonb_numeric(p_payload, 'score')::integer else v_casino_before.score end;
      if v_score is not null and v_score not between 0 and 100 then raise exception 'Score must be between 0 and 100'; end if;
      update public.casino_leads set
        name = v_name,
        website = case when p_payload ? 'website' then nullif(trim(p_payload ->> 'website'), '') else website end,
        description = case when p_payload ? 'description' then nullif(trim(p_payload ->> 'description'), '') else description end,
        geo = case when p_payload ? 'geo' then nullif(trim(p_payload ->> 'geo'), '') else geo end,
        license = case when p_payload ? 'license' then nullif(trim(p_payload ->> 'license'), '') else license end,
        software = case when p_payload ? 'software' then nullif(trim(p_payload ->> 'software'), '') else software end,
        affiliate_program = case when p_payload ? 'affiliate_program' then nullif(trim(p_payload ->> 'affiliate_program'), '') else affiliate_program end,
        sphere = case when p_payload ? 'sphere' then nullif(trim(p_payload ->> 'sphere'), '') else sphere end,
        email = case when p_payload ? 'email' then nullif(lower(trim(p_payload ->> 'email')), '') else email end,
        contact_name = case when p_payload ? 'contact_name' then nullif(trim(p_payload ->> 'contact_name'), '') else contact_name end,
        contact_title = case when p_payload ? 'contact_title' then nullif(trim(p_payload ->> 'contact_title'), '') else contact_title end,
        telegram = case when p_payload ? 'telegram' then nullif(trim(p_payload ->> 'telegram'), '') else telegram end,
        phone = case when p_payload ? 'phone' then nullif(trim(p_payload ->> 'phone'), '') else phone end,
        linkedin = case when p_payload ? 'linkedin' then nullif(trim(p_payload ->> 'linkedin'), '') else linkedin end,
        contact_status = case when p_payload ? 'contact_status' then coalesce(nullif(trim(p_payload ->> 'contact_status'), ''), 'not_contacted') else contact_status end,
        score = v_score,
        source = case when p_payload ? 'source' then nullif(trim(p_payload ->> 'source'), '') else source end,
        city = case when p_payload ? 'city' then nullif(trim(p_payload ->> 'city'), '') else city end,
        reply_status = case when p_payload ? 'reply_status' then nullif(trim(p_payload ->> 'reply_status'), '') else reply_status end,
        next_follow_up = case when p_payload ? 'next_follow_up' then nullif(trim(p_payload ->> 'next_follow_up'), '')::date else next_follow_up end,
        notes = case when p_payload ? 'notes' then nullif(trim(p_payload ->> 'notes'), '') else notes end,
        tags = case when p_payload ? 'tags' then private.offerpsp_jsonb_text_array(p_payload -> 'tags') else tags end,
        updated_at = now()
      where id = p_record_id::integer returning * into v_casino_after;
    end if;
    insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
    values ('research_casino', v_casino_after.id::text, case when p_record_id is null then 'created' else 'updated' end,
      auth.uid(), case when p_record_id is null then null else to_jsonb(v_casino_before) end, to_jsonb(v_casino_after));
    return to_jsonb(v_casino_after) - 'archived_by';
  end if;

  if p_record_id is null then
    v_name := nullif(trim(p_payload ->> 'name'), '');
    if v_name is null then raise exception 'PSP name is required'; end if;
    v_min_volume := private.offerpsp_jsonb_numeric(p_payload, 'min_monthly_volume');
    v_max_volume := private.offerpsp_jsonb_numeric(p_payload, 'max_monthly_volume');
    insert into public.psp_providers (
      name, website, geo, cluster, specialization, methods, contact_status,
      commission_terms, notes, email, contact_name, phone, telegram, linkedin,
      other_contacts, supported_countries, supported_currencies, payment_methods,
      supported_verticals, restricted_countries, integration_types,
      min_monthly_volume, max_monthly_volume, risk_appetite, provider_status,
      capabilities_source, capabilities_verified_at, record_state, updated_at
    ) values (
      v_name, nullif(trim(p_payload ->> 'website'), ''), nullif(trim(p_payload ->> 'geo'), ''),
      nullif(trim(p_payload ->> 'cluster'), ''), nullif(trim(p_payload ->> 'specialization'), ''),
      nullif(trim(p_payload ->> 'methods'), ''), coalesce(nullif(trim(p_payload ->> 'contact_status'), ''), 'not_contacted'),
      nullif(trim(p_payload ->> 'commission_terms'), ''), nullif(trim(p_payload ->> 'notes'), ''),
      nullif(lower(trim(p_payload ->> 'email')), ''), nullif(trim(p_payload ->> 'contact_name'), ''),
      nullif(trim(p_payload ->> 'phone'), ''), nullif(trim(p_payload ->> 'telegram'), ''),
      nullif(trim(p_payload ->> 'linkedin'), ''), nullif(trim(p_payload ->> 'other_contacts'), ''),
      private.offerpsp_jsonb_text_array(p_payload -> 'supported_countries'),
      private.offerpsp_jsonb_text_array(p_payload -> 'supported_currencies'),
      private.offerpsp_jsonb_text_array(p_payload -> 'payment_methods'),
      private.offerpsp_jsonb_text_array(p_payload -> 'supported_verticals'),
      private.offerpsp_jsonb_text_array(p_payload -> 'restricted_countries'),
      private.offerpsp_jsonb_text_array(p_payload -> 'integration_types'),
      v_min_volume, v_max_volume, nullif(trim(p_payload ->> 'risk_appetite'), ''),
      coalesce(nullif(trim(p_payload ->> 'provider_status'), ''), 'research'),
      nullif(trim(p_payload ->> 'capabilities_source'), ''),
      case when coalesce((p_payload ->> 'capabilities_verified')::boolean, false) then now() else null end,
      'active', now()
    ) returning * into v_psp_after;
  else
    select * into v_psp_before from public.psp_providers where id = p_record_id::integer for update;
    if not found then raise exception 'PSP research record not found'; end if;
    v_name := case when p_payload ? 'name' then nullif(trim(p_payload ->> 'name'), '') else v_psp_before.name end;
    if v_name is null then raise exception 'PSP name is required'; end if;
    v_min_volume := case when p_payload ? 'min_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'min_monthly_volume') else v_psp_before.min_monthly_volume end;
    v_max_volume := case when p_payload ? 'max_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'max_monthly_volume') else v_psp_before.max_monthly_volume end;
    update public.psp_providers set
      name = v_name,
      website = case when p_payload ? 'website' then nullif(trim(p_payload ->> 'website'), '') else website end,
      geo = case when p_payload ? 'geo' then nullif(trim(p_payload ->> 'geo'), '') else geo end,
      cluster = case when p_payload ? 'cluster' then nullif(trim(p_payload ->> 'cluster'), '') else cluster end,
      specialization = case when p_payload ? 'specialization' then nullif(trim(p_payload ->> 'specialization'), '') else specialization end,
      methods = case when p_payload ? 'methods' then nullif(trim(p_payload ->> 'methods'), '') else methods end,
      contact_status = case when p_payload ? 'contact_status' then coalesce(nullif(trim(p_payload ->> 'contact_status'), ''), 'not_contacted') else contact_status end,
      commission_terms = case when p_payload ? 'commission_terms' then nullif(trim(p_payload ->> 'commission_terms'), '') else commission_terms end,
      notes = case when p_payload ? 'notes' then nullif(trim(p_payload ->> 'notes'), '') else notes end,
      email = case when p_payload ? 'email' then nullif(lower(trim(p_payload ->> 'email')), '') else email end,
      contact_name = case when p_payload ? 'contact_name' then nullif(trim(p_payload ->> 'contact_name'), '') else contact_name end,
      phone = case when p_payload ? 'phone' then nullif(trim(p_payload ->> 'phone'), '') else phone end,
      telegram = case when p_payload ? 'telegram' then nullif(trim(p_payload ->> 'telegram'), '') else telegram end,
      linkedin = case when p_payload ? 'linkedin' then nullif(trim(p_payload ->> 'linkedin'), '') else linkedin end,
      other_contacts = case when p_payload ? 'other_contacts' then nullif(trim(p_payload ->> 'other_contacts'), '') else other_contacts end,
      supported_countries = case when p_payload ? 'supported_countries' then private.offerpsp_jsonb_text_array(p_payload -> 'supported_countries') else supported_countries end,
      supported_currencies = case when p_payload ? 'supported_currencies' then private.offerpsp_jsonb_text_array(p_payload -> 'supported_currencies') else supported_currencies end,
      payment_methods = case when p_payload ? 'payment_methods' then private.offerpsp_jsonb_text_array(p_payload -> 'payment_methods') else payment_methods end,
      supported_verticals = case when p_payload ? 'supported_verticals' then private.offerpsp_jsonb_text_array(p_payload -> 'supported_verticals') else supported_verticals end,
      restricted_countries = case when p_payload ? 'restricted_countries' then private.offerpsp_jsonb_text_array(p_payload -> 'restricted_countries') else restricted_countries end,
      integration_types = case when p_payload ? 'integration_types' then private.offerpsp_jsonb_text_array(p_payload -> 'integration_types') else integration_types end,
      min_monthly_volume = v_min_volume,
      max_monthly_volume = v_max_volume,
      risk_appetite = case when p_payload ? 'risk_appetite' then nullif(trim(p_payload ->> 'risk_appetite'), '') else risk_appetite end,
      provider_status = case when p_payload ? 'provider_status' then coalesce(nullif(trim(p_payload ->> 'provider_status'), ''), 'research') else provider_status end,
      capabilities_source = case when p_payload ? 'capabilities_source' then nullif(trim(p_payload ->> 'capabilities_source'), '') else capabilities_source end,
      capabilities_verified_at = case when p_payload ? 'capabilities_verified' then case when coalesce((p_payload ->> 'capabilities_verified')::boolean, false) then now() else null end else capabilities_verified_at end,
      updated_at = now()
    where id = p_record_id::integer returning * into v_psp_after;
  end if;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('research_psp', v_psp_after.id::text, case when p_record_id is null then 'created' else 'updated' end,
    auth.uid(), case when p_record_id is null then null else to_jsonb(v_psp_before) end, to_jsonb(v_psp_after));
  return to_jsonb(v_psp_after) - 'archived_by';
end;
$$;

create or replace function public.set_offerpsp_research_entity_state(
  p_entity_type text,
  p_record_id bigint,
  p_record_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_entity_type not in ('casino', 'psp') then raise exception 'Unsupported research entity type'; end if;
  if p_record_state not in ('active', 'archived') then raise exception 'Unsupported record state'; end if;
  if p_entity_type = 'casino' then
    select to_jsonb(c) into v_before from public.casino_leads c where c.id = p_record_id::integer for update;
    if v_before is null then raise exception 'Casino record not found'; end if;
    update public.casino_leads set record_state = p_record_state,
      archived_at = case when p_record_state = 'archived' then now() else null end,
      archived_by = case when p_record_state = 'archived' then auth.uid() else null end,
      updated_at = now()
    where id = p_record_id::integer returning to_jsonb(casino_leads) into v_after;
  else
    select to_jsonb(p) into v_before from public.psp_providers p where p.id = p_record_id::integer for update;
    if v_before is null then raise exception 'PSP research record not found'; end if;
    update public.psp_providers set record_state = p_record_state,
      archived_at = case when p_record_state = 'archived' then now() else null end,
      archived_by = case when p_record_state = 'archived' then auth.uid() else null end,
      updated_at = now()
    where id = p_record_id::integer returning to_jsonb(psp_providers) into v_after;
  end if;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values (case when p_entity_type = 'casino' then 'research_casino' else 'research_psp' end,
    p_record_id::text, case when p_record_state = 'archived' then 'archived' else 'restored' end,
    auth.uid(), v_before, v_after);
  return v_after - 'archived_by';
end;
$$;

create or replace function public.get_offerpsp_captains_bridge()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return jsonb_build_object(
    'casino_leads', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by (row_data.record_state = 'active') desc, row_data.updated_at desc nulls last)
      from (
        select id, internal_id, name, website, description, geo, license, software,
          affiliate_program, sphere, email, contact_name, contact_title, telegram,
          phone, linkedin, contact_status, score, source, city, emails_sent,
          last_contacted_at, last_reply_at, reply_status, next_follow_up, notes,
          tags, record_state, archived_at, created_at, updated_at
        from public.casino_leads
        order by (record_state = 'active') desc, updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'psp_providers', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by (row_data.record_state = 'active') desc, row_data.updated_at desc nulls last)
      from (
        select id, name, website, geo, cluster, specialization, methods,
          commission_terms, email, contact_name, phone, telegram, linkedin,
          other_contacts, contact_status, provider_status, risk_appetite,
          supported_countries, supported_currencies, payment_methods,
          supported_verticals, restricted_countries, integration_types,
          min_monthly_volume, max_monthly_volume, capabilities_verified_at,
          capabilities_source, notes, record_state, archived_at, created_at, updated_at
        from public.psp_providers
        order by (record_state = 'active') desc, updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'email_drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, chat_id, lead_internal_id, to_email, subject, body, status, created_at
        from public.email_drafts order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'telegram_log', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, chat_id, role, message, created_at
        from public.chat_logs order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'bot_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, task_type, payload, priority, scheduled_for, status, result,
        error, created_by, created_at, started_at, completed_at, ref_type, ref_id
        from public.bot_tasks order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'offerpsp_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, lead_id, assigned_to, source, title, details, status, priority,
        due_at, completed_at, automation_ref, metadata, created_at, updated_at
        from public.offerpsp_tasks order by created_at desc nulls last limit 100) row_data
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_offerpsp_research_entity(text, bigint, jsonb) from public, anon;
revoke all on function public.set_offerpsp_research_entity_state(text, bigint, text) from public, anon;
revoke all on function public.get_offerpsp_captains_bridge() from public, anon;
grant execute on function public.save_offerpsp_research_entity(text, bigint, jsonb) to authenticated;
grant execute on function public.set_offerpsp_research_entity_state(text, bigint, text) to authenticated;
grant execute on function public.get_offerpsp_captains_bridge() to authenticated;

comment on function public.save_offerpsp_research_entity(text, bigint, jsonb) is
  'Staff-only create/update editor for AIBot casino and PSP research records.';
comment on function public.set_offerpsp_research_entity_state(text, bigint, text) is
  'Staff-only archive/restore lifecycle for AIBot casino and PSP research records.';
