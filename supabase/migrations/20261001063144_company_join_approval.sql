-- Company identity search is not permission to join its workspace.
-- New employees verify email, then a confirmed owner/admin (or staff) decides.
create table private.offerpsp_company_join_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  organization_id uuid references public.offerpsp_organizations(id) on delete set null,
  submission_id uuid not null references private.offerpsp_intake_submissions(id),
  requester_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  telegram text,
  submitted_company text not null,
  status text not null default 'awaiting_verification'
    check(status in ('awaiting_verification','pending_owner','pending_staff','approved','rejected')),
  expires_at timestamptz not null default now()+interval '14 days',
  verified_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  granted_role text check(granted_role in ('viewer','manager')),
  created_at timestamptz not null default now(),
  unique(lead_id,email),
  check(status<>'approved' or granted_role is not null)
);
create index offerpsp_company_join_requests_owner_idx
  on private.offerpsp_company_join_requests(organization_id,status,created_at);
create index offerpsp_company_join_requests_user_idx
  on private.offerpsp_company_join_requests(requester_user_id,status);
create index offerpsp_company_join_requests_submission_idx
  on private.offerpsp_company_join_requests(submission_id);
create index offerpsp_company_join_requests_actor_idx
  on private.offerpsp_company_join_requests(decided_by) where decided_by is not null;
alter table private.offerpsp_company_join_requests enable row level security;
revoke all on private.offerpsp_company_join_requests from public,anon,authenticated,service_role;

create or replace function private.offerpsp_stage_company_join_request()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_lead public.offerpsp_leads;
begin
  if new.disposition<>'review_required' then return new; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=new.lead_id;
  if lower(v_lead.work_email)=lower(new.submitted_email) then return new; end if;
  insert into private.offerpsp_company_join_requests(
    lead_id,organization_id,submission_id,email,full_name,telegram,submitted_company
  ) values(new.lead_id,v_lead.merchant_organization_id,new.id,lower(new.submitted_email),
    new.submitted_name,nullif(trim(new.payload->>'telegram'),''),new.submitted_company)
  on conflict(lead_id,email) do nothing;
  return new;
end $$;
revoke all on function private.offerpsp_stage_company_join_request() from public,anon,authenticated,service_role;
create trigger offerpsp_stage_company_join_request after insert on private.offerpsp_intake_submissions
for each row execute function private.offerpsp_stage_company_join_request();

-- Only the primary verified applicant can bootstrap the first owner. Existing
-- contacts and domain matches cannot create memberships or revive a revoked one.
create or replace function public.claim_offerpsp_leads()
returns table(lead_id uuid,company text,claimed boolean)
language plpgsql security definer set search_path=''
as $$
declare v_email text; v_item record; v_org uuid; v_join record; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into v_email from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified email is required'; end if;
  for v_item in
    select l.* from public.offerpsp_leads l
    where l.record_state='active' and l.status not in ('closed','spam','lost')
      and lower(l.work_email)=v_email
      and (l.client_user_id is null or l.client_user_id=auth.uid())
  loop
    v_org:=coalesce(v_item.merchant_organization_id,
      private.ensure_offerpsp_merchant_organization(null,v_item.work_email,v_item.company));
    perform pg_advisory_xact_lock(hashtextextended('company_owner:'||v_org::text,0));
    if v_org is not null and not exists(
      select 1 from public.offerpsp_organization_members m where m.organization_id=v_org
    ) then
      insert into public.offerpsp_organization_members(organization_id,user_id,role,active,created_by)
      values(v_org,auth.uid(),'owner',true,auth.uid()) on conflict(organization_id,user_id) do nothing;
    end if;
    if exists(select 1 from public.offerpsp_organization_members m
      where m.organization_id=v_org and m.user_id=auth.uid() and m.active) then
      update public.offerpsp_leads l set client_user_id=auth.uid(),
        merchant_organization_id=v_org,last_activity_at=now()
      where l.lead_id=v_item.lead_id and (l.client_user_id is null or l.client_user_id=auth.uid());
    end if;
  end loop;
  for v_join in
    select j.id,j.lead_id,j.organization_id from private.offerpsp_company_join_requests j
    join public.offerpsp_leads l on l.lead_id=j.lead_id
    where lower(j.email)=v_email and j.status='awaiting_verification' and j.expires_at>now()
      and (j.requester_user_id is null or j.requester_user_id=auth.uid())
      and l.record_state='active' and l.status not in ('closed','spam','lost')
    for update of j
  loop
    v_org:=coalesce(v_join.organization_id,(select l.merchant_organization_id
      from public.offerpsp_leads l where l.lead_id=v_join.lead_id));
    v_status:=case when exists(
      select 1 from public.offerpsp_organization_members m
      join auth.users u on u.id=m.user_id
      where m.organization_id=v_org and m.active and m.role in ('owner','admin')
        and m.user_id<>auth.uid() and u.email_confirmed_at is not null
        and not exists(select 1 from public.offerpsp_staff_members sm
          where sm.user_id=m.user_id and sm.active)
    ) then 'pending_owner' else 'pending_staff' end;
    update private.offerpsp_company_join_requests set organization_id=v_org,
      requester_user_id=auth.uid(),verified_at=now(),status=v_status where id=v_join.id;
    insert into private.offerpsp_entity_audit(entity_type,entity_id,action_type,actor_user_id,after_state)
    values('merchant',v_join.lead_id::text,'company_join_requested',auth.uid(),
      jsonb_build_object('request_id',v_join.id,'status',v_status));
  end loop;
  return query select distinct l.lead_id,l.company::text,true from public.offerpsp_leads l
    where public.can_access_offerpsp_client_lead(l.lead_id) order by l.company;
end $$;
revoke all on function public.claim_offerpsp_leads() from public,anon,service_role;
grant execute on function public.claim_offerpsp_leads() to authenticated;

create or replace function public.get_offerpsp_company_join_requests()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null) then raise exception 'Verified email is required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',j.id,'lead_id',case when public.is_offerpsp_staff() then j.lead_id end,
      'company',(select s.submitted_company from private.offerpsp_intake_submissions s
        where s.id=j.submission_id),'name',j.full_name,'email',j.email,
      'telegram',j.telegram,'status',case when j.expires_at<=now()
        and j.status not in ('approved','rejected') then 'expired' else j.status end,
      'created_at',j.created_at,'expires_at',j.expires_at,'role',j.granted_role,
      'can_decide',j.requester_user_id is not null and j.requester_user_id<>auth.uid()
        and j.status in ('pending_owner','pending_staff') and j.expires_at>now()
        and (public.is_offerpsp_staff() or public.is_offerpsp_organization_member(
          j.organization_id,array['owner','admin']))
    ) order by j.created_at desc)
    from private.offerpsp_company_join_requests j
    where j.requester_user_id=auth.uid() or public.is_offerpsp_staff()
      or (j.requester_user_id is not null and j.status in ('pending_owner','pending_staff')
        and public.is_offerpsp_organization_member(j.organization_id,array['owner','admin']))
  ),'[]'::jsonb);
end $$;

create or replace function public.decide_offerpsp_company_join_request(
  p_request_id uuid,p_approve boolean,p_role text default 'viewer'
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_join private.offerpsp_company_join_requests; v_org uuid; v_lead public.offerpsp_leads;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid()
    and u.email_confirmed_at is not null) then raise exception 'Verified email is required'; end if;
  select * into v_join from private.offerpsp_company_join_requests where id=p_request_id for update;
  if not found then raise exception 'Join request unavailable'; end if;
  if not(public.is_offerpsp_staff() or public.is_offerpsp_organization_member(
    v_join.organization_id,array['owner','admin'])) then raise exception 'Company owner/admin approval required'; end if;
  if v_join.requester_user_id is null or v_join.requester_user_id=auth.uid() then
    raise exception 'A verified different applicant is required';
  end if;
  if p_approve is null or p_role is null or p_role not in ('viewer','manager') then raise exception 'Unsupported join decision'; end if;
  if v_join.status in ('approved','rejected') then
    if (v_join.status='approved') is distinct from p_approve then raise exception 'Join request already decided'; end if;
    return jsonb_build_object('id',v_join.id,'status',v_join.status,'replayed',true);
  end if;
  if v_join.status not in ('pending_owner','pending_staff') or v_join.expires_at<=now() then
    raise exception 'Join request expired or unverified';
  end if;
  if not exists(select 1 from auth.users u where u.id=v_join.requester_user_id
    and lower(u.email)=v_join.email and u.email_confirmed_at is not null) then
    raise exception 'Applicant email verification no longer matches';
  end if;
  select * into v_lead from public.offerpsp_leads where lead_id=v_join.lead_id for update;
  if v_lead.record_state<>'active' or v_lead.status in ('closed','spam','lost') then
    raise exception 'Company workspace is inactive';
  end if;
  if p_approve then
    v_org:=coalesce(v_lead.merchant_organization_id,v_join.organization_id);
    if not public.is_offerpsp_staff() and not public.is_offerpsp_organization_member(
      v_org,array['owner','admin']) then
      raise exception 'Company organization changed; fresh owner approval required';
    end if;
    if v_org is null then
      if not public.is_offerpsp_staff() then raise exception 'Staff must initialize the company workspace'; end if;
      v_org:=public.ensure_offerpsp_company_workspace(v_join.lead_id);
    end if;
    if not exists(select 1 from public.offerpsp_organizations o
      where o.id=v_org and o.status='active' and o.merged_into_id is null) then
      raise exception 'Company organization is inactive or merged';
    end if;
    -- This flow never grants or revives privileged roles.
    if exists(select 1 from public.offerpsp_organization_members m
      where m.organization_id=v_org and m.user_id=v_join.requester_user_id
        and m.role in ('owner','admin')) then
      raise exception 'Privileged membership requires separate staff review';
    end if;
    insert into public.offerpsp_organization_members(organization_id,user_id,role,active,created_by)
    values(v_org,v_join.requester_user_id,p_role,true,auth.uid())
    on conflict(organization_id,user_id) do update set active=true,role=excluded.role;
    insert into private.offerpsp_merchant_contacts(lead_id,full_name,email,telegram,preferred_channel,is_primary,active,notes)
    values(v_join.lead_id,v_join.full_name,v_join.email,v_join.telegram,'email',false,true,
      'Company member approved through verified join request '||v_join.id::text)
    on conflict(lead_id,lower(email)) where active and email is not null do nothing;
  end if;
  update private.offerpsp_company_join_requests set organization_id=coalesce(v_org,organization_id),
    status=case when p_approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=auth.uid(),
    granted_role=case when p_approve then p_role end where id=v_join.id;
  insert into private.offerpsp_entity_audit(entity_type,entity_id,action_type,actor_user_id,after_state)
  values('merchant',v_join.lead_id::text,'company_join_decided',auth.uid(),
    jsonb_build_object('request_id',v_join.id,'approved',p_approve,'role',case when p_approve then p_role end));
  update public.offerpsp_tasks set status=case when p_approve then 'done' else 'cancelled' end,
    completed_at=now() where lead_id=v_join.lead_id and automation_ref='intake_submission:'||v_join.submission_id::text
      and status in ('pending','in_progress');
  return jsonb_build_object('id',v_join.id,'status',case when p_approve then 'approved' else 'rejected' end,'replayed',false);
end $$;
revoke all on function public.get_offerpsp_company_join_requests() from public,anon,service_role;
revoke all on function public.decide_offerpsp_company_join_request(uuid,boolean,text) from public,anon,service_role;
grant execute on function public.get_offerpsp_company_join_requests() to authenticated;
grant execute on function public.decide_offerpsp_company_join_request(uuid,boolean,text) to authenticated;

-- Keep QA fixtures out of live company identity resolution in both directions.
-- Strong company/email-domain rules remain intact; domain-only matches become review candidates.
create or replace function private.offerpsp_upsert_lead_intake_without_aliases(p_payload jsonb)
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
  v_is_qa boolean;
  v_identity_candidate_id uuid;
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

  -- This separates fixtures only; it does not confer clearance or workspace access.
  v_is_qa:=coalesce(private.offerpsp_is_qa_lead(
    jsonb_populate_record(null::public.offerpsp_leads,p_payload)),false);
  v_company_norm:=private.offerpsp_normalize_company_name(v_company);
  v_url_domain:=private.offerpsp_normalize_domain(v_url);
  v_email_domain:=private.offerpsp_normalize_domain(v_email);
  v_identity_domain:=coalesce(v_url_domain,
    case when not private.offerpsp_is_public_mail_domain(v_email_domain) then v_email_domain end);
  v_request_hash:=md5(p_payload::text);
  -- Company spelling is shared by employees with different mail/site domains.
  perform pg_advisory_xact_lock(hashtextextended('intake_company:'||v_company_norm,0));
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

  with identities as (
    select l.lead_id,l.submitted_at,
      private.offerpsp_normalize_company_name(l.company) as company_norm,
      private.offerpsp_normalize_domain(l.company_url) as url_domain,
      case
        when not private.offerpsp_is_public_mail_domain(private.offerpsp_normalize_domain(l.work_email))
          then private.offerpsp_normalize_domain(l.work_email)
      end as email_domain
    from public.offerpsp_leads l
    where l.status<>'spam'
      and coalesce(private.offerpsp_is_qa_lead(l),false)=v_is_qa
      -- Different fixtures often share Boris's mailbox. Domain alone is not identity.
      and (not v_is_qa
        or private.offerpsp_normalize_company_name(l.company)=v_company_norm
        or (v_url_domain is not null and private.offerpsp_normalize_domain(l.company_url)=v_url_domain))
  ), ranked as (
    select i.lead_id,i.submitted_at,
      case
        when i.company_norm=v_company_norm
          and not private.offerpsp_is_public_mail_domain(v_email_domain)
          and v_email_domain=coalesce(i.url_domain,i.email_domain)
          and (v_url_domain is null or i.url_domain is null or v_url_domain=i.url_domain)
          then 'verified_company_email_domain'
        when i.company_norm=v_company_norm and v_url_domain is not null
          and i.url_domain is not null and v_url_domain<>i.url_domain
          then 'company_domain_conflict'
        when i.company_norm=v_company_norm and v_url_domain is not null and v_url_domain=i.url_domain
          then 'contact_domain_unverified'
        when i.company_norm=v_company_norm
          then 'company_identity_unverified'
        when v_url_domain is not null and v_url_domain=i.url_domain
          then 'website_domain_company_conflict'
        when not private.offerpsp_is_public_mail_domain(v_email_domain)
          and v_email_domain=coalesce(i.url_domain,i.email_domain)
          then 'email_domain_company_conflict'
        else null end strategy,
      case
        when i.company_norm=v_company_norm
          and not private.offerpsp_is_public_mail_domain(v_email_domain)
          and v_email_domain=coalesce(i.url_domain,i.email_domain)
          and (v_url_domain is null or i.url_domain is null or v_url_domain=i.url_domain) then 100
        when i.company_norm=v_company_norm and v_url_domain is not null
          and i.url_domain is not null and v_url_domain<>i.url_domain then 80
        when i.company_norm=v_company_norm and v_url_domain is not null and v_url_domain=i.url_domain then 75
        when i.company_norm=v_company_norm then 70
        when v_url_domain is not null and v_url_domain=i.url_domain then 60
        when not private.offerpsp_is_public_mail_domain(v_email_domain)
          and v_email_domain=coalesce(i.url_domain,i.email_domain) then 50
        else 0 end score
    from identities i
    where v_company_norm is not null and length(v_company_norm)>=2
      and v_company_norm not in ('company','merchant','casino','unknown','testcompany')
  )
  select lead_id,strategy,score into v_lead_id,v_strategy,v_score from ranked
  where score>0 order by score desc,submitted_at asc,lead_id limit 1;

  -- A shared domain with a different company name is only a staff candidate.
  -- Create the applicant's own card; never revive or grant access to that candidate.
  if v_score in (50,60) then
    v_identity_candidate_id:=v_lead_id;
    v_lead_id:=null;
  end if;

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
    if v_identity_candidate_id is null then v_strategy:='new_company'; end if;
    v_disposition:='created';
  elsif v_score>=70 and exists(
    select 1 from public.offerpsp_leads l where l.lead_id=v_lead_id
      and l.record_state='active' and l.status not in ('closed','spam','lost')
      and (lower(l.work_email)=v_email or exists(
        select 1 from public.offerpsp_organization_members m join auth.users u on u.id=m.user_id
        where m.organization_id=l.merchant_organization_id and m.active
          and lower(u.email)=v_email and u.email_confirmed_at is not null
      ))
  ) then
    v_disposition:='merged';
    select * into v_existing from public.offerpsp_leads where lead_id=v_lead_id for update;
    update public.offerpsp_leads set
      company_url=coalesce(nullif(trim(company_url),''),v_url),
      telegram=coalesce(nullif(trim(telegram),''),nullif(trim(p_payload->>'telegram'),'')),
      monthly_volume=coalesce(nullif(trim(monthly_volume),''),nullif(trim(p_payload->>'monthly_volume'),'')),
      methods=coalesce(nullif(trim(methods),''),nullif(trim(p_payload->>'methods'),'')),
      details=coalesce(nullif(trim(details),''),nullif(trim(p_payload->>'details'),'')),
      last_activity_at=now()
    where lead_id=v_lead_id;
  else
    v_disposition:='review_required';

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
        case when v_disposition='merged' then 'Existing primary contact or approved organization member.'
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

  if v_disposition<>'created' or v_identity_candidate_id is not null then
    insert into public.offerpsp_tasks(
      lead_id,assigned_to,source,title,details,status,priority,due_at,automation_ref,metadata
    ) values (
      v_lead_id,v_existing.assigned_to,'system',
      case when v_identity_candidate_id is not null then 'Review possible duplicate: company name differs'
        when v_disposition='merged' then 'Review new contact request' else 'Confirm company identity before linking contact' end,
      v_name||' <'||v_email||'> submitted a new request for '||v_company||'.','pending',
      case when v_disposition='review_required' or v_identity_candidate_id is not null then 'high' else 'normal' end,now()+interval '24 hours',
      'intake_submission:'||v_submission_id::text,
      jsonb_build_object('submission_id',v_submission_id,'contact_id',v_contact_id,
        'match_strategy',v_strategy,'disposition',v_disposition,
        'identity_candidate_lead_id',v_identity_candidate_id)
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
    'review_required',v_disposition='review_required','match_strategy',v_strategy,'replayed',false,
    'identity_candidate_lead_id',v_identity_candidate_id);
end $$;



revoke all on function private.offerpsp_upsert_lead_intake_without_aliases(jsonb)
  from public,anon,authenticated,service_role;
