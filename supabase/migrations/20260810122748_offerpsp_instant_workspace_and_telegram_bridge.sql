-- Instant merchant workspace: matching and a client-safe shortlist are created
-- immediately after a valid form submission. Lead intelligence remains a
-- background tool and blocks only an explicit hold/reject/spam decision.

update private.offerpsp_module_entitlements
set configuration = coalesce(configuration, '{}'::jsonb)
      || jsonb_build_object(
        'manual_clearance_required', false,
        'block_shortlist_until_clearance', false,
        'background_screening', true
      ),
    updated_at = now()
where workspace_key = 'offerpsp'
  and module_key = 'pre_compliance';

create or replace function private.offerpsp_compliance_ready(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select exists (
    select 1
    from public.offerpsp_leads lead
    where lead.lead_id = p_lead_id
      and lead.record_state = 'active'
      and lead.status <> 'spam'
  )
  and not exists (
    select 1
    from private.offerpsp_compliance_cases compliance_case
    where compliance_case.lead_id = p_lead_id
      and compliance_case.case_status in ('hold', 'rejected', 'spam')
  );
$$;

comment on function private.offerpsp_compliance_ready(uuid) is
  'Allows immediate matching for pending background screening; blocks only archived/spam leads and explicit hold, rejected or spam compliance decisions.';

create or replace function private.offerpsp_initialize_pre_compliance()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.offerpsp_module_enabled('pre_compliance') then
    return new;
  end if;

  update public.offerpsp_leads
  set target_geos = case
        when cardinality(target_geos) = 0 then private.offerpsp_extract_geo_codes(geos)
        else target_geos
      end,
      requested_methods = case
        when cardinality(requested_methods) = 0 then private.offerpsp_extract_methods(methods)
        else requested_methods
      end,
      updated_at = now()
  where lead_id = new.lead_id;

  insert into private.offerpsp_compliance_cases(
    lead_id, case_status, completeness_score, summary
  ) values (
    new.lead_id,
    case when new.status = 'spam' then 'spam' else 'pending' end,
    least(100, greatest(0,
      (case when nullif(trim(new.company_url), '') is not null then 20 else 0 end)
      + (case when nullif(trim(new.work_email), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.geos), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.methods), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.monthly_volume), '') is not null then 15 else 0 end)
      + (case when length(trim(coalesce(new.details, ''))) >= 40 then 20 else 0 end)
    )),
    'Background lead intelligence is available; the first shortlist is not delayed.'
  ) on conflict (lead_id) do nothing;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_type, activity_type, title, metadata
  ) values (
    new.lead_id,
    'system',
    'lead_intelligence_available',
    'Background lead intelligence available',
    jsonb_build_object('module', 'pre_compliance', 'blocks_initial_matching', false)
  );

  return new;
end;
$$;

create or replace function private.offerpsp_guard_shortlist_compliance()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.status in ('draft', 'shared')
     and not private.offerpsp_compliance_ready(new.lead_id) then
    raise exception 'Lead is blocked by an explicit compliance decision'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.rebuild_offerpsp_route_matches(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not private.offerpsp_compliance_ready(p_lead_id) then
    raise exception 'Lead is blocked by an explicit compliance decision'
      using errcode = 'P0001';
  end if;
  return private.rebuild_offerpsp_route_matches_internal(p_lead_id);
end;
$$;

create or replace function public.process_offerpsp_instant_intake(
  p_lead_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads%rowtype;
  v_existing uuid;
  v_shortlist_id uuid;
  v_version integer;
  v_item_count integer := 0;
  v_snapshot jsonb;
  v_match_result jsonb;
  candidate record;
begin
  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id
  for update;

  if not found then
    raise exception 'OfferPSP lead not found';
  end if;
  if not private.offerpsp_compliance_ready(p_lead_id) then
    raise exception 'Lead is blocked by an explicit compliance decision'
      using errcode = 'P0001';
  end if;

  select id into v_existing
  from public.offerpsp_shortlists
  where lead_id = p_lead_id and status = 'shared'
  order by version desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'lead_id', p_lead_id,
      'shortlist_id', v_existing,
      'status', 'shared',
      'idempotent', true,
      'email', v_lead.work_email,
      'company', v_lead.company
    );
  end if;

  v_match_result := private.rebuild_offerpsp_route_matches_internal(p_lead_id);

  select coalesce(max(version), 0) + 1 into v_version
  from public.offerpsp_shortlists
  where lead_id = p_lead_id;

  insert into public.offerpsp_shortlists(
    lead_id, version, title, introduction, status, created_by
  ) values (
    p_lead_id,
    v_version,
    'Recommended payment routes',
    'These published routes were selected from the parameters supplied in your request.',
    'draft',
    null
  ) returning id into v_shortlist_id;

  for candidate in
    with ranked as (
      select
        route_match.*,
        row_number() over (
          partition by route_match.provider_id
          order by route_match.score desc, route_match.generated_at desc
        ) as provider_rank
      from private.offerpsp_route_matches route_match
      join private.offerpsp_offer_routes route on route.id = route_match.route_id
      join private.offerpsp_providers provider on provider.id = route_match.provider_id
      where route_match.lead_id = p_lead_id
        and route_match.eligibility = 'eligible'
        and route.status = 'published'
        and provider.relationship_status = 'active'
        and provider.archived_at is null
        and private.offerpsp_compute_route_staleness(route_match.route_id) is null
    )
    select *
    from ranked
    order by provider_rank, score desc, generated_at desc
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
  loop
    begin
      v_snapshot := private.offerpsp_build_client_route_snapshot(
        candidate.route_id,
        p_lead_id
      );

      if nullif(trim(v_snapshot ->> 'title'), '') is null
         or jsonb_array_length(coalesce(v_snapshot -> 'methods', '[]'::jsonb)) = 0
         or jsonb_array_length(coalesce(v_snapshot -> 'currencies', '[]'::jsonb)) = 0
         or jsonb_array_length(coalesce(v_snapshot -> 'client_fees', '[]'::jsonb)) = 0
         or (
           v_snapshot ->> 'coverage_scope' = 'specific'
           and jsonb_array_length(coalesce(v_snapshot -> 'geos', '[]'::jsonb)) = 0
         ) then
        continue;
      end if;

      v_item_count := v_item_count + 1;
      insert into public.offerpsp_shortlist_items(
        shortlist_id,
        psp_id,
        rank,
        client_note,
        route_match_id,
        private_provider_id,
        offer_route_id,
        client_snapshot
      ) values (
        v_shortlist_id,
        null,
        v_item_count,
        'Selected automatically from published routes matching your submitted GEO and supplied parameters.',
        candidate.id,
        candidate.provider_id,
        candidate.route_id,
        v_snapshot
      );
    exception when raise_exception or check_violation then
      v_item_count := v_item_count;
    end;
  end loop;

  if v_item_count = 0 then
    delete from public.offerpsp_shortlists where id = v_shortlist_id;
    update public.offerpsp_leads
    set status = 'qualifying',
        quality_reasons = jsonb_build_array(
          'No client-ready published route matched the submitted request yet'
        )
    where lead_id = p_lead_id;
  else
    update public.offerpsp_shortlists
    set status = 'archived', updated_at = now()
    where lead_id = p_lead_id
      and id <> v_shortlist_id
      and status = 'shared';

    update public.offerpsp_shortlists
    set status = 'shared', shared_at = now(), updated_at = now()
    where id = v_shortlist_id;

    update public.offerpsp_leads
    set status = 'shared'
    where lead_id = p_lead_id;

    insert into public.offerpsp_lead_activities(
      lead_id, actor_type, activity_type, title, body, client_visible, metadata
    ) values (
      p_lead_id,
      'system',
      'instant_shortlist_shared',
      'Payment options prepared automatically',
      format('%s matching route(s) are ready in the client workspace.', v_item_count),
      true,
      jsonb_build_object('item_count', v_item_count, 'automatic', true)
    );
  end if;

  insert into public.offerpsp_conversations(
    lead_id, channel, subject, client_visible
  )
  select p_lead_id, 'portal', 'OfferPSP support', true
  where not exists (
    select 1 from public.offerpsp_conversations
    where lead_id = p_lead_id and channel = 'portal'
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'shortlist_id', case when v_item_count > 0 then v_shortlist_id else null end,
    'status', case when v_item_count > 0 then 'shared' else 'no_match' end,
    'item_count', v_item_count,
    'match_count', coalesce((v_match_result ->> 'match_count')::integer, 0),
    'email', v_lead.work_email,
    'company', v_lead.company,
    'idempotent', false
  );
end;
$$;

revoke all on function public.process_offerpsp_instant_intake(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.process_offerpsp_instant_intake(uuid, integer)
  to service_role;

comment on function public.process_offerpsp_instant_intake(uuid, integer) is
  'Service-only idempotent intake: match a valid lead, build a confidential client-safe shortlist, share it and open the portal conversation without waiting for background screening.';

create table if not exists private.offerpsp_telegram_portal_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.offerpsp_conversations(id) on delete cascade,
  portal_message_id uuid not null unique references public.offerpsp_messages(id) on delete cascade,
  telegram_chat_id text not null,
  telegram_message_id text not null,
  created_at timestamptz not null default now(),
  unique (telegram_chat_id, telegram_message_id)
);

alter table private.offerpsp_telegram_portal_links enable row level security;
revoke all on private.offerpsp_telegram_portal_links from public, anon, authenticated;

create or replace function public.get_offerpsp_portal_message_notification(
  p_message_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'portal_message_id', message.id,
    'conversation_id', conversation.id,
    'lead_id', lead.lead_id,
    'company', lead.company,
    'sender_email', lead.work_email,
    'sender_telegram', lead.telegram,
    'message', message.body,
    'sent_at', message.sent_at
  )
  from public.offerpsp_messages message
  join public.offerpsp_conversations conversation
    on conversation.id = message.conversation_id
   and conversation.channel = 'portal'
  join public.offerpsp_leads lead on lead.lead_id = conversation.lead_id
  where message.id = p_message_id
    and message.sender_type = 'client'
    and message.direction = 'inbound';
$$;

create or replace function public.record_offerpsp_portal_telegram_link(
  p_portal_message_id uuid,
  p_telegram_chat_id text,
  p_telegram_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_conversation_id uuid;
begin
  if nullif(trim(p_telegram_chat_id), '') is null
     or nullif(trim(p_telegram_message_id), '') is null then
    raise exception 'Telegram delivery identifiers are required';
  end if;

  select message.conversation_id into v_conversation_id
  from public.offerpsp_messages message
  join public.offerpsp_conversations conversation
    on conversation.id = message.conversation_id
   and conversation.channel = 'portal'
  where message.id = p_portal_message_id
    and message.sender_type = 'client'
    and message.direction = 'inbound';

  if v_conversation_id is null then
    raise exception 'Verified client portal message not found';
  end if;

  insert into private.offerpsp_telegram_portal_links(
    conversation_id, portal_message_id, telegram_chat_id, telegram_message_id
  ) values (
    v_conversation_id,
    p_portal_message_id,
    trim(p_telegram_chat_id),
    trim(p_telegram_message_id)
  )
  on conflict (portal_message_id) do update set
    telegram_chat_id = excluded.telegram_chat_id,
    telegram_message_id = excluded.telegram_message_id;

  return jsonb_build_object('recorded', true, 'portal_message_id', p_portal_message_id);
end;
$$;

create or replace function public.try_reply_offerpsp_portal_from_telegram(
  p_chat_id text,
  p_reply_to_message_id text,
  p_body text,
  p_external_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_link private.offerpsp_telegram_portal_links%rowtype;
  v_message_id uuid;
  v_lead_id uuid;
begin
  if nullif(trim(coalesce(p_chat_id, '')), '') is null
     or nullif(trim(coalesce(p_reply_to_message_id, '')), '') is null
     or nullif(trim(coalesce(p_body, '')), '') is null then
    return jsonb_build_object('handled', false);
  end if;

  select * into v_link
  from private.offerpsp_telegram_portal_links
  where telegram_chat_id = trim(p_chat_id)
    and telegram_message_id = trim(p_reply_to_message_id);

  if not found then
    return jsonb_build_object('handled', false);
  end if;

  select message.id into v_message_id
  from public.offerpsp_messages message
  where message.conversation_id = v_link.conversation_id
    and message.sender_type = 'staff'
    and message.direction = 'outbound'
    and message.external_message_id = nullif(trim(p_external_message_id), '')
  order by message.created_at desc
  limit 1;

  if v_message_id is null then
    insert into public.offerpsp_messages(
      conversation_id,
      sender_type,
      sender_user_id,
      direction,
      body,
      external_message_id,
      metadata
    ) values (
      v_link.conversation_id,
      'staff',
      null,
      'outbound',
      left(trim(p_body), 4000),
      nullif(trim(p_external_message_id), ''),
      jsonb_build_object('source', 'telegram_reply')
    ) returning id into v_message_id;
  end if;

  update public.offerpsp_conversations
  set updated_at = now()
  where id = v_link.conversation_id
  returning lead_id into v_lead_id;

  return jsonb_build_object(
    'handled', true,
    'message_id', v_message_id,
    'conversation_id', v_link.conversation_id,
    'lead_id', v_lead_id,
    'chat_id', trim(p_chat_id)
  );
end;
$$;

revoke all on function public.get_offerpsp_portal_message_notification(uuid)
  from public, anon, authenticated;
revoke all on function public.record_offerpsp_portal_telegram_link(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.try_reply_offerpsp_portal_from_telegram(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.get_offerpsp_portal_message_notification(uuid)
  to service_role;
grant execute on function public.record_offerpsp_portal_telegram_link(uuid, text, text)
  to service_role;
grant execute on function public.try_reply_offerpsp_portal_from_telegram(text, text, text, text)
  to service_role;

comment on table private.offerpsp_telegram_portal_links is
  'Private mapping between a verified client portal message and the Telegram notification delivered to the OfferPSP owner.';
