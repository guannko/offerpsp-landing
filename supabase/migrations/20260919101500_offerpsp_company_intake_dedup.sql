-- One company has one operational merchant card. Every public submission is
-- retained, while strong identity matches add a contact to the canonical card.
-- Conflicting domains are held for staff review without granting portal access.

create table if not exists private.offerpsp_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  contact_id uuid references private.offerpsp_merchant_contacts(id) on delete set null,
  request_hash text not null,
  disposition text not null check(disposition in ('created','merged','review_required')),
  match_strategy text not null,
  submitted_name text not null,
  submitted_email text not null,
  submitted_company text not null,
  submitted_domain text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_intake_submissions_lead_idx
  on private.offerpsp_intake_submissions(lead_id,created_at desc);
create index if not exists offerpsp_intake_submissions_replay_idx
  on private.offerpsp_intake_submissions(request_hash,created_at desc);
create unique index if not exists offerpsp_merchant_contacts_active_email_idx
  on private.offerpsp_merchant_contacts(lead_id,lower(email))
  where active and email is not null;

alter table private.offerpsp_intake_submissions enable row level security;
revoke all on table private.offerpsp_intake_submissions
  from public,anon,authenticated,service_role;

create or replace function private.offerpsp_normalize_company_name(p_value text)
returns text language sql immutable strict set search_path=pg_catalog
as $$
  select nullif(lower(regexp_replace(trim(p_value),'[^[:alnum:]]+','','g')),'')
$$;

create or replace function private.offerpsp_normalize_domain(p_value text)
returns text language plpgsql immutable strict set search_path=pg_catalog
as $$
declare v text:=lower(trim(p_value));
begin
  if v='' then return null; end if;
  if position('@' in v)>0 and position('://' in v)=0 then
    v:=split_part(v,'@',2);
  else
    v:=regexp_replace(v,'^[a-z][a-z0-9+.-]*://','');
    if position('@' in v)>0 then v:=split_part(v,'@',2); end if;
    v:=split_part(v,'/',1);
    v:=split_part(v,'?',1);
    v:=split_part(v,'#',1);
    v:=split_part(v,':',1);
  end if;
  v:=regexp_replace(v,'^www\.','');
  v:=rtrim(v,'.');
  if v !~ '^[a-z0-9]([a-z0-9-]{0,62}\.)+[a-z0-9][a-z0-9-]{0,62}$' then return null; end if;
  return v;
end $$;

create or replace function private.offerpsp_is_public_mail_domain(p_domain text)
returns boolean language sql immutable set search_path=pg_catalog
as $$
  select coalesce(p_domain,'')=any(array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','outlook.com','hotmail.com',
    'live.com','icloud.com','me.com','proton.me','protonmail.com','gmx.com','mail.com',
    'aol.com','yandex.com','yandex.ru','mail.ru','ukr.net'
  ])
$$;

revoke all on function private.offerpsp_normalize_company_name(text)
  from public,anon,authenticated,service_role;
revoke all on function private.offerpsp_normalize_domain(text)
  from public,anon,authenticated,service_role;
revoke all on function private.offerpsp_is_public_mail_domain(text)
  from public,anon,authenticated,service_role;

create or replace function public.upsert_offerpsp_lead_intake(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  v_name text:=nullif(trim(p_payload->>'name'),'');
  v_email text:=lower(nullif(trim(p_payload->>'work_email'),''));
  v_company text:=nullif(trim(p_payload->>'company'),'');
  v_company_norm text;
  v_url text:=nullif(trim(p_payload->>'company_url'),'');
  v_url_domain text;
  v_email_domain text;
  v_identity_domain text;
  v_request_hash text;
  v_lead_id uuid;
  v_contact_id uuid;
  v_submission_id uuid;
  v_organization_id uuid;
  v_strategy text;
  v_disposition text;
  v_score integer;
  v_existing public.offerpsp_leads;
  v_replay private.offerpsp_intake_submissions;
  v_is_primary boolean;
begin
  if v_role<>'service_role' then raise exception 'OfferPSP service access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Intake payload must be an object'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) supplied(key) where supplied.key<>all(array[
    'is_spam','name','work_email','telegram','company','company_url','vertical','monthly_volume',
    'geos','methods','details','source','source_category','source_platform','source_referrer',
    'landing_path','utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid',
    'gbraid','wbraid','dclid','msclkid','fbclid','li_fat_id','ttclid','affiliate_id',
    'affiliate_click_id','first_touch_at','last_touch_at','attribution','status','consent'
  ])) then raise exception 'Intake payload contains unsupported fields'; end if;
  if v_name is null or length(v_name)>120 or v_company is null or length(v_company)>160 then
    raise exception 'Valid contact and company names are required';
  end if;
  if v_email is null or length(v_email)>254 or v_email!~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid work email is required';
  end if;
  if coalesce((p_payload->>'consent')::boolean,false) is not true then raise exception 'Consent is required'; end if;
  if coalesce(p_payload->>'source','')<>'offerpsp.com' then raise exception 'Unsupported intake source'; end if;

  v_company_norm:=private.offerpsp_normalize_company_name(v_company);
  v_url_domain:=private.offerpsp_normalize_domain(v_url);
  v_email_domain:=private.offerpsp_normalize_domain(v_email);
  v_identity_domain:=coalesce(v_url_domain,
    case when not private.offerpsp_is_public_mail_domain(v_email_domain) then v_email_domain end);
  v_request_hash:=md5(p_payload::text);
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_identity_domain,v_company_norm,v_email),0));

  select * into v_replay from private.offerpsp_intake_submissions
  where request_hash=v_request_hash and created_at>now()-interval '10 minutes'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('lead_id',v_replay.lead_id,'submission_id',v_replay.id,
      'contact_id',v_replay.contact_id,'created',v_replay.disposition='created',
      'merged',v_replay.disposition='merged','review_required',v_replay.disposition='review_required',
      'match_strategy',v_replay.match_strategy,'replayed',true);
  end if;

  with ranked as (
    select l.lead_id,l.submitted_at,
      case
        when v_url_domain is not null and private.offerpsp_normalize_domain(l.company_url)=v_url_domain
          then 'website_domain'
        when v_company_norm is not null and length(v_company_norm)>=6
          and v_company_norm not in ('company','merchant','casino','unknown','testcompany')
          and private.offerpsp_normalize_company_name(l.company)=v_company_norm
          and (v_url_domain is null or private.offerpsp_normalize_domain(l.company_url) is null
            or private.offerpsp_normalize_domain(l.company_url)=v_url_domain)
          then 'company_exact'
        when v_company_norm is not null and length(v_company_norm)>=6
          and v_company_norm not in ('company','merchant','casino','unknown','testcompany')
          and private.offerpsp_normalize_company_name(l.company)=v_company_norm
          then 'company_domain_conflict'
        else null end strategy,
      case
        when v_url_domain is not null and private.offerpsp_normalize_domain(l.company_url)=v_url_domain then 100
        when v_company_norm is not null and length(v_company_norm)>=6
          and v_company_norm not in ('company','merchant','casino','unknown','testcompany')
          and private.offerpsp_normalize_company_name(l.company)=v_company_norm
          and (v_url_domain is null or private.offerpsp_normalize_domain(l.company_url) is null
            or private.offerpsp_normalize_domain(l.company_url)=v_url_domain) then 90
        when v_company_norm is not null and length(v_company_norm)>=6
          and v_company_norm not in ('company','merchant','casino','unknown','testcompany')
          and private.offerpsp_normalize_company_name(l.company)=v_company_norm then 50
        else 0 end score
    from public.offerpsp_leads l where l.status<>'spam'
  )
  select lead_id,strategy,score into v_lead_id,v_strategy,v_score from ranked
  where score>0 order by score desc,submitted_at asc,lead_id limit 1;

  if v_lead_id is null then
    insert into public.offerpsp_leads(
      name,work_email,telegram,company,company_url,vertical,monthly_volume,geos,methods,details,
      source,source_category,source_platform,source_referrer,landing_path,utm_source,utm_medium,
      utm_campaign,utm_term,utm_content,gclid,gbraid,wbraid,dclid,msclkid,fbclid,li_fat_id,
      ttclid,affiliate_id,affiliate_click_id,first_touch_at,last_touch_at,attribution,status,consent
    ) values (
      v_name,v_email,nullif(trim(p_payload->>'telegram'),''),v_company,v_url,
      nullif(trim(p_payload->>'vertical'),''),nullif(trim(p_payload->>'monthly_volume'),''),
      nullif(trim(p_payload->>'geos'),''),nullif(trim(p_payload->>'methods'),''),
      nullif(trim(p_payload->>'details'),''),'offerpsp.com',nullif(trim(p_payload->>'source_category'),''),
      nullif(trim(p_payload->>'source_platform'),''),nullif(trim(p_payload->>'source_referrer'),''),
      nullif(trim(p_payload->>'landing_path'),''),nullif(trim(p_payload->>'utm_source'),''),
      nullif(trim(p_payload->>'utm_medium'),''),nullif(trim(p_payload->>'utm_campaign'),''),
      nullif(trim(p_payload->>'utm_term'),''),nullif(trim(p_payload->>'utm_content'),''),
      nullif(trim(p_payload->>'gclid'),''),nullif(trim(p_payload->>'gbraid'),''),
      nullif(trim(p_payload->>'wbraid'),''),nullif(trim(p_payload->>'dclid'),''),
      nullif(trim(p_payload->>'msclkid'),''),nullif(trim(p_payload->>'fbclid'),''),
      nullif(trim(p_payload->>'li_fat_id'),''),nullif(trim(p_payload->>'ttclid'),''),
      nullif(trim(p_payload->>'affiliate_id'),''),nullif(trim(p_payload->>'affiliate_click_id'),''),
      nullif(trim(p_payload->>'first_touch_at'),'')::timestamptz,
      nullif(trim(p_payload->>'last_touch_at'),'')::timestamptz,
      coalesce(p_payload->'attribution','{}'::jsonb),'new',true
    ) returning lead_id into v_lead_id;
    v_strategy:='new_company'; v_disposition:='created';
  elsif v_score>=90 then
    v_disposition:='merged';
    select * into v_existing from public.offerpsp_leads where lead_id=v_lead_id for update;
    update public.offerpsp_leads set
      company_url=coalesce(nullif(trim(company_url),''),v_url),
      telegram=coalesce(nullif(trim(telegram),''),nullif(trim(p_payload->>'telegram'),'')),
      monthly_volume=coalesce(nullif(trim(monthly_volume),''),nullif(trim(p_payload->>'monthly_volume'),'')),
      methods=coalesce(nullif(trim(methods),''),nullif(trim(p_payload->>'methods'),'')),
      details=coalesce(nullif(trim(details),''),nullif(trim(p_payload->>'details'),'')),
      record_state='active',archived_at=null,archived_by=null,archive_reason=null,
      status=case when status in ('closed','lost') then 'qualifying' else status end,
      last_activity_at=now()
    where lead_id=v_lead_id;
  else
    v_disposition:='review_required';
    update public.offerpsp_leads set record_state='active',archived_at=null,archived_by=null,
      archive_reason=null,status=case when status in ('closed','lost') then 'qualifying' else status end,
      last_activity_at=now() where lead_id=v_lead_id;
  end if;

  if v_disposition<>'review_required' then
    select id into v_contact_id from private.offerpsp_merchant_contacts
    where lead_id=v_lead_id and active and lower(email)=v_email for update;
    if v_contact_id is null then
      select not exists(select 1 from private.offerpsp_merchant_contacts where lead_id=v_lead_id and active)
        into v_is_primary;
      insert into private.offerpsp_merchant_contacts(
        lead_id,full_name,email,telegram,preferred_channel,is_primary,active,notes
      ) values (
        v_lead_id,v_name,v_email,nullif(trim(p_payload->>'telegram'),''),'email',v_is_primary,true,
        case when v_disposition='merged' then 'Added automatically from a verified public intake identity match.'
          else 'Primary contact from the public intake.' end
      ) returning id into v_contact_id;
    else
      update private.offerpsp_merchant_contacts set full_name=v_name,
        telegram=coalesce(nullif(trim(p_payload->>'telegram'),''),telegram),updated_at=now()
      where id=v_contact_id;
    end if;
  end if;

  insert into private.offerpsp_intake_submissions(
    lead_id,contact_id,request_hash,disposition,match_strategy,submitted_name,
    submitted_email,submitted_company,submitted_domain,payload
  ) values (
    v_lead_id,v_contact_id,v_request_hash,v_disposition,v_strategy,v_name,
    v_email,v_company,v_identity_domain,p_payload-'is_spam'
  ) returning id into v_submission_id;

  select * into v_existing from public.offerpsp_leads where lead_id=v_lead_id;
  if v_disposition<>'review_required' then
    v_organization_id:=private.ensure_offerpsp_merchant_organization(
      v_existing.client_user_id,v_existing.work_email,v_existing.company);
    if v_existing.merchant_organization_id is null and v_organization_id is not null then
      update public.offerpsp_leads set merchant_organization_id=v_organization_id where lead_id=v_lead_id;
    end if;
  end if;

  if v_disposition<>'created' then
    insert into public.offerpsp_tasks(
      lead_id,assigned_to,source,title,details,status,priority,due_at,automation_ref,metadata
    ) values (
      v_lead_id,v_existing.assigned_to,'system',
      case when v_disposition='merged' then 'Review new contact request' else 'Confirm company identity before linking contact' end,
      v_name||' <'||v_email||'> submitted a new request for '||v_company||'.','pending',
      case when v_disposition='review_required' then 'high' else 'normal' end,now()+interval '24 hours',
      'intake_submission:'||v_submission_id::text,
      jsonb_build_object('submission_id',v_submission_id,'contact_id',v_contact_id,
        'match_strategy',v_strategy,'disposition',v_disposition)
    );
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id,actor_type,activity_type,title,body,metadata,client_visible
  ) values (
    v_lead_id,'system',
    case v_disposition when 'created' then 'company_intake_created'
      when 'merged' then 'company_contact_intake_merged' else 'company_contact_intake_review_required' end,
    case v_disposition when 'created' then 'Company intake created'
      when 'merged' then 'New contact added to the existing company card'
      else 'Company match requires staff confirmation' end,
    v_name||' <'||v_email||'>',
    jsonb_build_object('submission_id',v_submission_id,'contact_id',v_contact_id,
      'match_strategy',v_strategy,'submitted_company',v_company,'submitted_domain',v_identity_domain),false
  );

  return jsonb_build_object('lead_id',v_lead_id,'submission_id',v_submission_id,
    'contact_id',v_contact_id,'created',v_disposition='created','merged',v_disposition='merged',
    'review_required',v_disposition='review_required','match_strategy',v_strategy,'replayed',false);
end $$;

revoke all on function public.upsert_offerpsp_lead_intake(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.upsert_offerpsp_lead_intake(jsonb) to service_role;

create or replace function public.can_access_offerpsp_client_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_catalog
as $$
  select auth.uid() is not null and exists(
    select 1 from public.offerpsp_leads l where l.lead_id=p_lead_id
      and l.record_state<>'archived' and l.status not in ('closed','spam') and (
        l.client_user_id=auth.uid()
        or (l.merchant_organization_id is not null and public.is_offerpsp_organization_member(
          l.merchant_organization_id,array['owner','admin','manager','viewer']))
        or (l.agent_organization_id is not null and l.merchant_organization_id is not null
          and public.is_offerpsp_organization_member(l.agent_organization_id,array['owner','admin','manager'])
          and exists(select 1 from public.offerpsp_agent_clients ac
            where ac.agent_organization_id=l.agent_organization_id
              and ac.merchant_organization_id=l.merchant_organization_id and ac.status='active'))
      )
  )
$$;
revoke execute on function public.can_access_offerpsp_client_lead(uuid) from public,anon;
grant execute on function public.can_access_offerpsp_client_lead(uuid) to authenticated,service_role;

create or replace function public.claim_offerpsp_leads()
returns table(lead_id uuid,company text,claimed boolean)
language plpgsql security definer set search_path=public,private,auth,pg_catalog
as $$
declare v_email text; v_item record; v_org uuid; v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=auth.uid();
  if v_email is null then raise exception 'Authenticated email is unavailable'; end if;

  for v_item in
    select distinct l.lead_id,l.company,l.work_email,l.client_user_id,l.merchant_organization_id,
      (lower(l.work_email)=v_email) as primary_email
    from public.offerpsp_leads l
    where l.record_state<>'archived' and l.status not in ('closed','spam') and (
      lower(l.work_email)=v_email or exists(select 1 from private.offerpsp_merchant_contacts c
        where c.lead_id=l.lead_id and c.active and lower(c.email)=v_email))
  loop
    update public.offerpsp_leads l set client_user_id=auth.uid(),last_activity_at=now()
      where l.lead_id=v_item.lead_id and v_item.primary_email
        and (l.client_user_id is null or l.client_user_id=auth.uid());
    v_org:=coalesce(v_item.merchant_organization_id,
      private.ensure_offerpsp_merchant_organization(v_item.client_user_id,v_item.work_email,v_item.company));
    if v_org is not null then
      update public.offerpsp_leads l set merchant_organization_id=v_org
        where l.lead_id=v_item.lead_id and l.merchant_organization_id is null;
      v_role:=case when v_item.primary_email then 'owner' else 'manager' end;
      insert into public.offerpsp_organization_members(organization_id,user_id,role,active,created_by)
        values(v_org,auth.uid(),v_role,true,auth.uid())
      on conflict(organization_id,user_id) do update set active=true,
        role=case when public.offerpsp_organization_members.role='owner' then 'owner' else excluded.role end;
    end if;
  end loop;

  return query select distinct l.lead_id,l.company::text,true
  from public.offerpsp_leads l where public.can_access_offerpsp_client_lead(l.lead_id)
  order by l.company;
end $$;
revoke all on function public.claim_offerpsp_leads() from public,anon;
grant execute on function public.claim_offerpsp_leads() to authenticated;

drop policy if exists offerpsp_staff_select_leads on public.offerpsp_leads;
create policy offerpsp_staff_select_leads on public.offerpsp_leads for select to authenticated
using(
  public.is_offerpsp_staff()
  or client_user_id=(select auth.uid())
  or public.can_access_offerpsp_client_lead(lead_id)
);

create or replace function public.list_offerpsp_workspace_requests()
returns table(lead_id uuid,company text,vertical text,status text,submitted_at timestamptz,
  updated_at timestamptz,target_geos text[],requested_currencies text[],requested_flows text[],
  requested_methods text[],traffic_types text[],expected_monthly_volume numeric,volume_currency text,
  min_transaction_amount numeric,max_transaction_amount numeric,transaction_currency text,access_mode text)
language sql stable security definer set search_path=public,pg_catalog
as $$
  select l.lead_id,l.company::text,l.vertical::text,l.status::text,l.submitted_at,l.updated_at,
    l.target_geos,l.requested_currencies,l.requested_flows,l.requested_methods,l.traffic_types,
    l.expected_monthly_volume,l.volume_currency,l.min_transaction_amount,l.max_transaction_amount,
    l.transaction_currency,
    case when l.client_user_id=auth.uid() or (l.merchant_organization_id is not null
      and public.is_offerpsp_organization_member(l.merchant_organization_id,array['owner','admin','manager','viewer']))
      then 'merchant' else 'agent' end::text
  from public.offerpsp_leads l where public.can_access_offerpsp_client_lead(l.lead_id)
  order by l.submitted_at desc
$$;

create or replace function public.prepare_offerpsp_telegram_intake_card(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare
  v_lead public.offerpsp_leads; v_task public.offerpsp_tasks;
  v_operator private.offerpsp_telegram_operators; v_case private.offerpsp_compliance_cases;
  v_submission private.offerpsp_intake_submissions; v_task_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  if not found or v_lead.record_state<>'active' or v_lead.status in ('closed','spam','won','lost') then
    return jsonb_build_object('outcome','inactive'); end if;
  v_task_id:=private.offerpsp_ensure_intake_task(p_lead_id);
  select * into v_task from public.offerpsp_tasks where id=v_task_id;
  select o.* into v_operator from private.offerpsp_telegram_operators o
    join public.offerpsp_staff_members s on s.user_id=o.staff_user_id and s.active
    join private.offerpsp_integration_settings i on i.integration_key='telegram' and i.enabled
      and coalesce((i.configuration->>'lead_notifications')::boolean,false)
    where o.enabled and (s.role='owner' or s.user_id=v_lead.assigned_to)
    order by (o.staff_user_id=v_task.assigned_to) desc nulls last,o.telegram_user_id limit 1;
  if not found then return jsonb_build_object('outcome','operator_unconfigured'); end if;
  update private.offerpsp_telegram_intake_actions set active=false
    where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id and active
      and (receipt is not null or consumed_at is not null or expires_at<=now());
  insert into private.offerpsp_telegram_intake_actions(lead_id,staff_user_id,chat_id,action)
    select p_lead_id,v_operator.staff_user_id,v_operator.chat_id,a
    from unnest(array['screen','matching','missing_draft','reply_draft','remind']) a
    on conflict(lead_id,staff_user_id,action) where active do nothing;
  select * into v_case from private.offerpsp_compliance_cases where lead_id=p_lead_id;
  select * into v_submission from private.offerpsp_intake_submissions
    where lead_id=p_lead_id order by created_at desc limit 1;
  return jsonb_build_object('outcome','ready','chat_id',v_operator.chat_id,
    'lead',jsonb_build_object('id',p_lead_id,'company',v_lead.company,'contact',v_lead.name,
      'domain',v_lead.company_url,'vertical',v_lead.vertical,'geos',v_lead.geos,'volume',v_lead.monthly_volume),
    'latest_submission',case when v_submission.id is null then null else jsonb_build_object(
      'id',v_submission.id,'name',v_submission.submitted_name,'email',v_submission.submitted_email,
      'company',v_submission.submitted_company,'disposition',v_submission.disposition,
      'match_strategy',v_submission.match_strategy,'created_at',v_submission.created_at) end,
    'screening',jsonb_build_object('status',v_case.case_status,'completeness',v_case.completeness_score,
      'missing',v_case.missing_information,'risk',v_case.risk_level,'red_flags',v_case.red_flags,
      'yellow_flags',v_case.yellow_flags,'screened_at',v_case.last_screened_at),
    'possible_duplicates',(select count(*) from public.offerpsp_leads l where l.lead_id<>p_lead_id
      and l.record_state='active' and l.status<>'spam' and
      (lower(trim(l.work_email))=lower(trim(v_lead.work_email)) or
       (nullif(trim(v_lead.company_url),'') is not null and
        private.offerpsp_normalize_domain(l.company_url)=private.offerpsp_normalize_domain(v_lead.company_url)))),
    'workspace_ready',v_lead.client_user_id is not null or v_lead.merchant_organization_id is not null,
    'match_count',(select count(*) from private.offerpsp_route_matches where lead_id=p_lead_id),
    'task',jsonb_build_object('id',v_task.id,'status',v_task.status,'due_at',v_task.due_at),
    'auto_reply',coalesce((select jsonb_build_object('status',r.status,'reply_class',r.reply_class,
      'reason_code',r.reason_code,'sent_at',r.sent_at,'updated_at',r.updated_at)
      from private.offerpsp_intake_auto_replies r where r.lead_id=p_lead_id),jsonb_build_object('status','waiting')),
    'actions',(select jsonb_object_agg(action,token) from private.offerpsp_telegram_intake_actions
      where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id
        and active and receipt is null and consumed_at is null and expires_at>now()));
end $$;

revoke all on function public.prepare_offerpsp_telegram_intake_card(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_offerpsp_telegram_intake_card(uuid) to service_role;
