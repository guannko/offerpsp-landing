-- Append-only human evidence. This does not manufacture automated AI visibility.
create table private.offerpsp_geo_observations (
  id uuid primary key default gen_random_uuid(),
  engine text not null check(engine in ('chatgpt','gemini','perplexity')),
  model text,
  language text not null,
  country text not null,
  prompt text not null,
  response_text text not null,
  citations jsonb not null default '[]',
  evidence_url text,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  mode text not null default 'manual' check(mode='manual'),
  brand_mentioned boolean not null,
  site_cited boolean not null,
  fingerprint text not null unique
);
alter table private.offerpsp_geo_observations enable row level security;
revoke all on private.offerpsp_geo_observations from public,anon,authenticated,service_role;
create index offerpsp_geo_observations_time_idx on private.offerpsp_geo_observations(observed_at desc);
create index offerpsp_geo_observations_actor_idx on private.offerpsp_geo_observations(recorded_by);

create or replace function public.record_offerpsp_geo_observation(p_observation jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_row private.offerpsp_geo_observations%rowtype; v_citations jsonb; v_time timestamptz; v_hash text;
begin
  if not public.is_offerpsp_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_observation->>'engine' not in ('chatgpt','gemini','perplexity')
    or coalesce(length(trim(p_observation->>'prompt')),0) not between 5 and 2000
    or coalesce(length(trim(p_observation->>'response_text')),0) not between 10 and 20000
    or coalesce(p_observation->>'language','') !~ '^[a-z]{2}(-[A-Z]{2})?$'
    or coalesce(p_observation->>'country','') !~ '^[A-Z]{2}$'
    or coalesce(p_observation->>'observed_at','')='' then
    raise exception 'Invalid GEO observation';
  end if;
  v_time=(p_observation->>'observed_at')::timestamptz;
  if v_time > now()+interval '5 minutes' then raise exception 'Observation cannot be in the future'; end if;
  v_citations=coalesce(p_observation->'citations','[]'::jsonb);
  if jsonb_typeof(v_citations)<>'array' or jsonb_array_length(v_citations)>50 then raise exception 'Invalid citations'; end if;
  if exists(select 1 from jsonb_array_elements(v_citations) c where jsonb_typeof(c)<>'string'
    or (c#>>'{}') !~ '^https://[^[:space:]]+$' or length(c#>>'{}')>2000) then raise exception 'Citations must be HTTPS URLs'; end if;
  if nullif(p_observation->>'evidence_url','') is not null and (p_observation->>'evidence_url') !~ '^https://[^[:space:]]+$' then raise exception 'Evidence link must be HTTPS'; end if;
  v_hash=md5(jsonb_build_object('engine',p_observation->>'engine','prompt',trim(p_observation->>'prompt'),
    'response',trim(p_observation->>'response_text'),'citations',v_citations,'at',v_time,
    'country',p_observation->>'country','language',p_observation->>'language')::text);
  insert into private.offerpsp_geo_observations(engine,model,language,country,prompt,response_text,citations,evidence_url,
    observed_at,recorded_by,brand_mentioned,site_cited,fingerprint)
    values(p_observation->>'engine',left(p_observation->>'model',100),p_observation->>'language',p_observation->>'country',
      trim(p_observation->>'prompt'),trim(p_observation->>'response_text'),v_citations,nullif(p_observation->>'evidence_url',''),
      v_time,auth.uid(),(p_observation->>'response_text') ~* '\mofferpsp\M',
      exists(select 1 from jsonb_array_elements_text(v_citations) u where u ~* '^https://(www\.)?offerpsp\.com([/?#]|$)'),v_hash)
    on conflict(fingerprint) do nothing returning * into v_row;
  if not found then select * into v_row from private.offerpsp_geo_observations where fingerprint=v_hash; end if;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.record_offerpsp_geo_observation(jsonb) from public,anon,service_role;
grant execute on function public.record_offerpsp_geo_observation(jsonb) to authenticated;

create or replace function public.get_offerpsp_geo_observations()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  return jsonb_build_object('generated_at',now(),'automation_status','not_configured',
    'totals', (select jsonb_build_object('checks',count(*),'mentions',count(*) filter(where brand_mentioned),
      'citations',count(*) filter(where site_cited)) from private.offerpsp_geo_observations where observed_at >= now()-interval '30 days'),
    'observations',coalesce((select jsonb_agg(to_jsonb(o) order by observed_at desc) from
      (select * from private.offerpsp_geo_observations order by observed_at desc limit 30) o),'[]'::jsonb));
end; $$;
revoke all on function public.get_offerpsp_geo_observations() from public,anon,service_role;
grant execute on function public.get_offerpsp_geo_observations() to authenticated;
