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
    where v_company_norm is not null and length(v_company_norm)>=6
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
  elsif v_score=100 then
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
        case when v_disposition='merged' then 'Added automatically after exact company and verified work-email domain match.'
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

create or replace function public.upsert_offerpsp_lead_intake(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_original_company text := nullif(trim(p_payload ->> 'company'), '');
  v_original_norm text;
  v_canonical_company text;
  v_canonical_norm text;
  v_effective_payload jsonb := p_payload;
  v_result jsonb;
  v_submission_id uuid;
  v_alias_organization_id uuid;
begin
  if v_role <> 'service_role' then raise exception 'OfferPSP service access required'; end if;
  v_original_norm := private.offerpsp_normalize_company_name(v_original_company);
  if v_original_norm is not null then
    select o.id, coalesce((select l.company from public.offerpsp_leads l
      where l.merchant_organization_id = coalesce(o.merged_into_id, o.id) and l.status <> 'spam'
      order by l.submitted_at, l.lead_id limit 1), canonical.name, o.name)
    into v_alias_organization_id, v_canonical_company
    from private.offerpsp_entity_aliases a
    join public.offerpsp_organizations o on o.id = a.organization_id
    left join public.offerpsp_organizations canonical on canonical.id = o.merged_into_id
    where a.normalized_alias = v_original_norm
      and exists (
        select 1 from public.offerpsp_leads l
        where l.merchant_organization_id=coalesce(o.merged_into_id,o.id)
          and l.status<>'spam'
          and coalesce(private.offerpsp_is_qa_lead(l),false)=coalesce(
            private.offerpsp_is_qa_lead(jsonb_populate_record(null::public.offerpsp_leads,p_payload)),false)
      )
    limit 1;
  end if;
  v_canonical_norm := private.offerpsp_normalize_company_name(v_canonical_company);
  if v_canonical_norm is not null and v_canonical_norm is distinct from v_original_norm then
    v_effective_payload := jsonb_set(p_payload, '{company}', to_jsonb(v_canonical_company), true);
  end if;
  v_result := private.offerpsp_upsert_lead_intake_without_aliases(v_effective_payload);
  v_submission_id := nullif(v_result ->> 'submission_id', '')::uuid;
  if v_submission_id is not null and v_canonical_norm is not null
    and v_canonical_norm is distinct from v_original_norm then
    update private.offerpsp_intake_submissions set submitted_company = v_original_company,
      payload = jsonb_set(payload, '{company}', to_jsonb(v_original_company), true)
    where id = v_submission_id;
    update public.offerpsp_lead_activities set
      metadata = jsonb_set(metadata, '{submitted_company}', to_jsonb(v_original_company), true)
    where metadata ->> 'submission_id' = v_submission_id::text;
    if exists (
      select 1 from public.offerpsp_organizations
      where id = v_alias_organization_id and merged_into_id is not null
    ) then
      insert into private.offerpsp_entity_audit(
        entity_type, entity_id, action_type, actor_user_id, reason, after_state
      ) values (
        'organization', v_alias_organization_id::text, 'alias_intake_resolved', auth.uid(),
        'Historical organization alias resolved to its canonical card',
        jsonb_build_object(
          'submission_id', v_submission_id,
          'submitted_company', v_original_company,
          'canonical_company', v_canonical_company
        )
      );
    end if;
  end if;
  return v_result;
end;
$$;


revoke all on function public.upsert_offerpsp_lead_intake(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.upsert_offerpsp_lead_intake(jsonb) to service_role;
