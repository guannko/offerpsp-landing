create or replace function public.save_offerpsp_managed_merchant(
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_leads;
  v_after public.offerpsp_leads;
  v_status text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Merchant payload must be an object'; end if;
  select * into v_before from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'OfferPSP merchant not found'; end if;

  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), v_before.status);
  if v_status not in (
    'new', 'qualifying', 'needs_clarification', 'matching', 'matched',
    'shortlist_ready', 'shared', 'option_selected', 'dossier_ready',
    'provider_reviewing', 'provider_needs_info', 'provider_accepted',
    'provider_declined', 'telegram_created', 'zoom_scheduled',
    'negotiating', 'won', 'lost', 'closed', 'spam'
  ) then raise exception 'Unsupported merchant status'; end if;

  update public.offerpsp_leads
  set company = coalesce(nullif(trim(p_payload ->> 'company'), ''), company),
      name = coalesce(nullif(trim(p_payload ->> 'name'), ''), name),
      work_email = coalesce(nullif(lower(trim(p_payload ->> 'work_email')), ''), work_email),
      telegram = case when p_payload ? 'telegram' then nullif(trim(p_payload ->> 'telegram'), '') else telegram end,
      company_url = case when p_payload ? 'company_url' then nullif(trim(p_payload ->> 'company_url'), '') else company_url end,
      vertical = coalesce(nullif(trim(p_payload ->> 'vertical'), ''), vertical),
      monthly_volume = case when p_payload ? 'monthly_volume' then nullif(trim(p_payload ->> 'monthly_volume'), '') else monthly_volume end,
      geos = coalesce(nullif(trim(p_payload ->> 'geos'), ''), geos),
      methods = case when p_payload ? 'methods' then nullif(trim(p_payload ->> 'methods'), '') else methods end,
      details = case when p_payload ? 'details' then nullif(trim(p_payload ->> 'details'), '') else details end,
      status = v_status,
      utm_source = case when p_payload ? 'utm_source' then nullif(trim(p_payload ->> 'utm_source'), '') else utm_source end,
      utm_campaign = case when p_payload ? 'utm_campaign' then nullif(trim(p_payload ->> 'utm_campaign'), '') else utm_campaign end,
      assigned_to = case when p_payload ? 'assigned_to' then nullif(trim(p_payload ->> 'assigned_to'), '')::uuid else assigned_to end,
      quality_score = case when p_payload ? 'quality_score' then private.offerpsp_jsonb_numeric(p_payload, 'quality_score')::smallint else quality_score end,
      quality_grade = case when p_payload ? 'quality_grade' then nullif(trim(p_payload ->> 'quality_grade'), '') else quality_grade end,
      registration_geo = case when p_payload ? 'registration_geo' then nullif(trim(p_payload ->> 'registration_geo'), '') else registration_geo end,
      target_geos = case when p_payload ? 'target_geos' then private.offerpsp_jsonb_text_array(p_payload -> 'target_geos') else target_geos end,
      requested_currencies = case when p_payload ? 'requested_currencies' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_currencies') else requested_currencies end,
      requested_flows = case when p_payload ? 'requested_flows' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_flows') else requested_flows end,
      requested_methods = case when p_payload ? 'requested_methods' then private.offerpsp_jsonb_text_array(p_payload -> 'requested_methods') else requested_methods end,
      traffic_types = case when p_payload ? 'traffic_types' then private.offerpsp_jsonb_text_array(p_payload -> 'traffic_types') else traffic_types end,
      expected_monthly_volume = case when p_payload ? 'expected_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'expected_monthly_volume') else expected_monthly_volume end,
      volume_currency = case when p_payload ? 'volume_currency' then nullif(upper(trim(p_payload ->> 'volume_currency')), '') else volume_currency end,
      min_transaction_amount = case when p_payload ? 'min_transaction_amount' then private.offerpsp_jsonb_numeric(p_payload, 'min_transaction_amount') else min_transaction_amount end,
      max_transaction_amount = case when p_payload ? 'max_transaction_amount' then private.offerpsp_jsonb_numeric(p_payload, 'max_transaction_amount') else max_transaction_amount end,
      transaction_currency = case when p_payload ? 'transaction_currency' then nullif(upper(trim(p_payload ->> 'transaction_currency')), '') else transaction_currency end,
      business_model = case when p_payload ? 'business_model' then nullif(trim(p_payload ->> 'business_model'), '') else business_model end,
      license_status = case when p_payload ? 'license_status' then nullif(trim(p_payload ->> 'license_status'), '') else license_status end,
      license_jurisdiction = case when p_payload ? 'license_jurisdiction' then nullif(trim(p_payload ->> 'license_jurisdiction'), '') else license_jurisdiction end,
      license_number = case when p_payload ? 'license_number' then nullif(trim(p_payload ->> 'license_number'), '') else license_number end,
      license_evidence_url = case when p_payload ? 'license_evidence_url' then nullif(trim(p_payload ->> 'license_evidence_url'), '') else license_evidence_url end,
      launch_timeline = case when p_payload ? 'launch_timeline' then nullif(trim(p_payload ->> 'launch_timeline'), '') else launch_timeline end,
      current_processing_setup = case when p_payload ? 'current_processing_setup' then nullif(trim(p_payload ->> 'current_processing_setup'), '') else current_processing_setup end,
      qualification_notes = case when p_payload ? 'qualification_notes' then nullif(trim(p_payload ->> 'qualification_notes'), '') else qualification_notes end,
      merchant_organization_id = case when p_payload ? 'merchant_organization_id' then nullif(trim(p_payload ->> 'merchant_organization_id'), '')::uuid else merchant_organization_id end,
      agent_organization_id = case when p_payload ? 'agent_organization_id' then nullif(trim(p_payload ->> 'agent_organization_id'), '')::uuid else agent_organization_id end,
      updated_at = now()
  where lead_id = p_lead_id returning * into v_after;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('merchant', p_lead_id::text, 'updated', auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  insert into public.offerpsp_lead_activities(lead_id, actor_user_id, actor_type, activity_type, title, metadata)
  values (p_lead_id, auth.uid(), 'staff', 'merchant_record_updated', 'Merchant record updated',
    jsonb_build_object('changed_fields', coalesce((select jsonb_agg(key) from jsonb_each(p_payload)), '[]'::jsonb)));
  return to_jsonb(v_after);
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
      select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc nulls last)
      from (
        select id, internal_id, name, website, geo, license, sphere, email,
          contact_name, contact_title, telegram, phone, linkedin, contact_status,
          score, source, city, emails_sent, last_contacted_at, last_reply_at,
          reply_status, next_follow_up, notes, tags, created_at, updated_at
        from public.casino_leads
        order by updated_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'email_drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, chat_id, lead_internal_id, to_email, subject, body, status, created_at
        from public.email_drafts
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'telegram_log', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, chat_id, role, message, created_at
        from public.chat_logs
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'bot_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, task_type, payload, priority, scheduled_for, status, result,
          error, created_by, created_at, started_at, completed_at, ref_type, ref_id
        from public.bot_tasks
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'offerpsp_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, lead_id, assigned_to, source, title, details, status, priority,
          due_at, completed_at, automation_ref, metadata, created_at, updated_at
        from public.offerpsp_tasks
        order by created_at desc nulls last
        limit 100
      ) row_data
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_offerpsp_email_draft(
  p_lead_id uuid,
  p_to_email text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.email_drafts;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if nullif(lower(trim(p_to_email)), '') is null then raise exception 'Recipient email is required'; end if;
  if nullif(trim(p_subject), '') is null then raise exception 'Email subject is required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Email body is required'; end if;
  if p_lead_id is not null and not exists (select 1 from public.offerpsp_leads where lead_id = p_lead_id) then
    raise exception 'OfferPSP merchant not found';
  end if;
  insert into public.email_drafts(chat_id, lead_internal_id, to_email, subject, body, status)
  values ('control-bridge:' || auth.uid()::text, p_lead_id::text, lower(trim(p_to_email)), trim(p_subject), p_body, 'draft')
  returning * into v_draft;
  if p_lead_id is not null then
    insert into public.offerpsp_lead_activities(lead_id, actor_user_id, actor_type, activity_type, title, metadata)
    values (p_lead_id, auth.uid(), 'staff', 'email_draft_created', 'Email draft created',
      jsonb_build_object('draft_id', v_draft.id, 'to_email', v_draft.to_email, 'subject', v_draft.subject));
  end if;
  return to_jsonb(v_draft);
end;
$$;

create or replace function public.set_offerpsp_email_draft_status(
  p_draft_id bigint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.email_drafts;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('draft', 'sending', 'sent', 'failed', 'cancelled') then raise exception 'Unsupported email status'; end if;
  update public.email_drafts set status = p_status where id = p_draft_id returning * into v_draft;
  if not found then raise exception 'Email draft not found'; end if;
  return to_jsonb(v_draft);
end;
$$;

revoke all on function public.save_offerpsp_managed_merchant(uuid, jsonb) from public, anon;
revoke all on function public.get_offerpsp_captains_bridge() from public, anon;
revoke all on function public.create_offerpsp_email_draft(uuid, text, text, text) from public, anon;
revoke all on function public.set_offerpsp_email_draft_status(bigint, text) from public, anon;
grant execute on function public.save_offerpsp_managed_merchant(uuid, jsonb) to authenticated;
grant execute on function public.get_offerpsp_captains_bridge() to authenticated;
grant execute on function public.create_offerpsp_email_draft(uuid, text, text, text) to authenticated;
grant execute on function public.set_offerpsp_email_draft_status(bigint, text) to authenticated;

comment on function public.get_offerpsp_captains_bridge() is
  'Staff-only unified read model for OfferPSP, the Telegram AIBot, research leads, email drafts and task queues.';
