create schema if not exists private;

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_status_allowed;

alter table public.offerpsp_leads
  add constraint offerpsp_leads_status_allowed
  check (
    status in (
      'new',
      'reviewing',
      'qualified',
      'matched',
      'closed',
      'spam',
      'qualifying',
      'matching',
      'shortlist_ready',
      'shared',
      'negotiating',
      'won',
      'lost'
    )
  );

create or replace function private.offerpsp_quality_score(p_lead public.offerpsp_leads)
returns integer
language sql
immutable
set search_path = public, private
as $$
  select least(
    100,
    20
    + case when nullif(trim(p_lead.company_url), '') is not null then 10 else 0 end
    + case when nullif(trim(p_lead.telegram), '') is not null then 5 else 0 end
    + case when nullif(trim(p_lead.monthly_volume), '') is not null then 15 else 0 end
    + case when nullif(trim(p_lead.geos), '') is not null then 15 else 0 end
    + case when nullif(trim(p_lead.methods), '') is not null then 15 else 0 end
    + case when length(trim(coalesce(p_lead.details, ''))) >= 40 then 10 else 0 end
    + case when nullif(trim(p_lead.vertical), '') is not null then 10 else 0 end
  );
$$;

create or replace function private.rebuild_offerpsp_matches_internal(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_lead public.offerpsp_leads;
  v_quality integer;
  v_grade text;
  v_match_count integer := 0;
  v_shortlist_id uuid;
  v_shortlist_version integer;
begin
  select *
  into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;

  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  v_quality := private.offerpsp_quality_score(v_lead);
  v_grade := case
    when v_quality >= 85 then 'A'
    when v_quality >= 70 then 'B'
    when v_quality >= 50 then 'C'
    else 'D'
  end;

  delete from public.offerpsp_matches
  where lead_id = p_lead_id
    and algorithm_version = 'rules-v1'
    and reviewed_at is null;

  with provider_features as (
    select
      p.id,
      lower(concat_ws(
        ' ',
        p.name,
        p.geo,
        p.cluster,
        p.specialization,
        p.methods,
        p.notes,
        array_to_string(p.supported_countries, ' '),
        array_to_string(p.supported_verticals, ' '),
        array_to_string(p.payment_methods, ' ')
      )) as haystack,
      p.provider_status
    from public.psp_providers p
    where coalesce(p.provider_status, 'research') not in ('inactive', 'blocked')
  ),
  scored as (
    select
      pf.id as psp_id,
      pf.provider_status,
      (
        10
        + case
            when pf.haystack like '%' || lower(trim(v_lead.vertical)) || '%' then 30
            when lower(v_lead.vertical) like '%gaming%'
              and (pf.haystack like '%igaming%' or pf.haystack like '%high-risk%') then 25
            when lower(v_lead.vertical) like '%commerce%'
              and pf.haystack like '%ecommerce%' then 25
            else 0
          end
        + least(
            30,
            15 * (
              select count(*)
              from regexp_split_to_table(lower(coalesce(v_lead.geos, '')), '[,;/|]+') token
              where length(trim(token)) >= 2
                and pf.haystack like '%' || trim(token) || '%'
            )
          )
        + least(
            25,
            10 * (
              select count(*)
              from regexp_split_to_table(lower(coalesce(v_lead.methods, '')), '[,;/|]+') token
              where length(trim(token)) >= 2
                and pf.haystack like '%' || trim(token) || '%'
            )
          )
        + case when pf.provider_status in ('active', 'verified') then 5 else 0 end
      )::integer as match_score,
      pf.haystack like '%' || lower(trim(v_lead.vertical)) || '%'
        or (
          lower(v_lead.vertical) like '%gaming%'
          and (pf.haystack like '%igaming%' or pf.haystack like '%high-risk%')
        ) as vertical_fit,
      exists (
        select 1
        from regexp_split_to_table(lower(coalesce(v_lead.geos, '')), '[,;/|]+') token
        where length(trim(token)) >= 2
          and pf.haystack like '%' || trim(token) || '%'
      ) as geo_fit,
      exists (
        select 1
        from regexp_split_to_table(lower(coalesce(v_lead.methods, '')), '[,;/|]+') token
        where length(trim(token)) >= 2
          and pf.haystack like '%' || trim(token) || '%'
      ) as method_fit
    from provider_features pf
  ),
  ranked as (
    select *
    from scored
    where match_score >= 25
    order by match_score desc, psp_id
    limit 15
  )
  insert into public.offerpsp_matches (
    lead_id,
    psp_id,
    score,
    eligibility,
    strengths,
    risks,
    explanation,
    algorithm_version,
    model_name
  )
  select
    p_lead_id,
    r.psp_id,
    least(100, r.match_score),
    case
      when r.match_score >= 55 then 'eligible'
      when r.match_score >= 35 then 'review'
      else 'ineligible'
    end,
    to_jsonb(array_remove(array[
      case when r.vertical_fit then 'Vertical fit' end,
      case when r.geo_fit then 'GEO overlap' end,
      case when r.method_fit then 'Payment method overlap' end,
      case when r.provider_status in ('active', 'verified') then 'Provider status verified' end
    ]::text[], null)),
    to_jsonb(array_remove(array[
      case when not r.vertical_fit then 'Vertical acceptance requires confirmation' end,
      case when not r.geo_fit then 'GEO coverage requires confirmation' end,
      case when not r.method_fit then 'Requested methods require confirmation' end,
      case when r.provider_status not in ('active', 'verified') then 'Capabilities require verification' end
    ]::text[], null)),
    concat_ws(
      '. ',
      case when r.vertical_fit then 'Vertical profile overlaps' else 'Vertical acceptance is unverified' end,
      case when r.geo_fit then 'At least one requested market overlaps' else 'Market coverage needs manual review' end,
      case when r.method_fit then 'At least one requested method overlaps' else 'Payment methods need manual review' end
    ) || '.',
    'rules-v1',
    null
  from ranked r
  on conflict (lead_id, psp_id, algorithm_version)
  do update set
    score = excluded.score,
    eligibility = excluded.eligibility,
    strengths = excluded.strengths,
    risks = excluded.risks,
    explanation = excluded.explanation,
    generated_at = now();

  get diagnostics v_match_count = row_count;

  delete from public.offerpsp_shortlists
  where lead_id = p_lead_id
    and status = 'draft'
    and created_by is null
    and introduction like 'Automatically generated%';

  if v_match_count > 0 then
    select coalesce(max(version), 0) + 1
    into v_shortlist_version
    from public.offerpsp_shortlists
    where lead_id = p_lead_id;

    insert into public.offerpsp_shortlists (
      lead_id,
      version,
      title,
      introduction,
      status
    )
    values (
      p_lead_id,
      v_shortlist_version,
      'Recommended payment partners',
      'Automatically generated from verified database fields. Review all capabilities before sharing.',
      'draft'
    )
    returning id into v_shortlist_id;

    insert into public.offerpsp_shortlist_items (
      shortlist_id,
      match_id,
      psp_id,
      rank,
      client_note
    )
    select
      v_shortlist_id,
      m.id,
      m.psp_id,
      row_number() over (order by m.score desc, m.psp_id)::integer,
      m.explanation
    from public.offerpsp_matches m
    where m.lead_id = p_lead_id
      and m.algorithm_version = 'rules-v1'
      and m.eligibility in ('eligible', 'review')
    order by m.score desc, m.psp_id
    limit 5;
  end if;

  update public.offerpsp_leads
  set
    quality_score = v_quality,
    quality_grade = v_grade,
    quality_reasons = to_jsonb(array_remove(array[
      case when nullif(trim(v_lead.company_url), '') is null then 'Company website missing' end,
      case when nullif(trim(v_lead.monthly_volume), '') is null then 'Monthly volume missing' end,
      case when nullif(trim(v_lead.methods), '') is null then 'Payment methods missing' end,
      case when length(trim(coalesce(v_lead.details, ''))) < 40 then 'Request details are limited' end
    ]::text[], null)),
    status = case
      when v_lead.status not in ('new', 'qualifying', 'matching', 'shortlist_ready')
        then v_lead.status
      when v_match_count >= 3
        then 'shortlist_ready'
      else 'qualifying'
    end
  where lead_id = p_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id,
    actor_type,
    activity_type,
    title,
    body,
    metadata
  )
  values (
    p_lead_id,
    'aibot',
    'automated_matching_completed',
    'Automated qualification and PSP matching completed',
    format('Lead quality: %s/100 (%s). Candidates: %s.', v_quality, v_grade, v_match_count),
    jsonb_build_object(
      'quality_score', v_quality,
      'quality_grade', v_grade,
      'match_count', v_match_count,
      'algorithm_version', 'rules-v1',
      'shortlist_id', v_shortlist_id
    )
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'quality_score', v_quality,
    'quality_grade', v_grade,
    'match_count', v_match_count,
    'shortlist_id', v_shortlist_id
  );
end;
$$;

create or replace function public.rebuild_offerpsp_matches(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return private.rebuild_offerpsp_matches_internal(p_lead_id);
end;
$$;

create or replace function private.offerpsp_auto_match_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.rebuild_offerpsp_matches_internal(new.lead_id);
  return new;
exception
  when others then
    insert into public.offerpsp_lead_activities (
      lead_id,
      actor_type,
      activity_type,
      title,
      body,
      metadata
    )
    values (
      new.lead_id,
      'system',
      'automated_matching_failed',
      'Automated matching needs attention',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return new;
end;
$$;

drop trigger if exists offerpsp_lead_auto_match on public.offerpsp_leads;
create trigger offerpsp_lead_auto_match
after insert on public.offerpsp_leads
for each row execute function private.offerpsp_auto_match_new_lead();

revoke all on function private.offerpsp_quality_score(public.offerpsp_leads) from public;
revoke all on function private.rebuild_offerpsp_matches_internal(uuid) from public;
revoke all on function private.offerpsp_auto_match_new_lead() from public;
revoke execute on function private.offerpsp_quality_score(public.offerpsp_leads) from anon, authenticated;
revoke execute on function private.rebuild_offerpsp_matches_internal(uuid) from anon, authenticated;
revoke execute on function private.offerpsp_auto_match_new_lead() from anon, authenticated;

revoke all on function public.rebuild_offerpsp_matches(uuid) from public;
revoke execute on function public.rebuild_offerpsp_matches(uuid) from anon;
grant execute on function public.rebuild_offerpsp_matches(uuid) to authenticated;
