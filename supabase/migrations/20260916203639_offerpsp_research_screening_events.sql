-- Local Astra review candidate. Shares the existing signed wake-up channel.
-- The event contains no company or job data; the 12-hour worker sweep is the fallback.

create table private.offerpsp_research_screening_dispatches (
  id bigint generated always as identity primary key,
  job_id uuid not null references private.offerpsp_research_screening_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  request_id bigint,
  outcome text not null check (outcome in ('queued','unconfigured','enqueue_failed')),
  error_code text
);
alter table private.offerpsp_research_screening_dispatches enable row level security;
revoke all on private.offerpsp_research_screening_dispatches from public,anon,authenticated,service_role;
create index offerpsp_research_screening_dispatches_job_idx
  on private.offerpsp_research_screening_dispatches(job_id,created_at desc);

create or replace function private.offerpsp_notify_research_screening_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token text; v_request bigint; v_enabled boolean; v_signed text; v_ticket text;
begin
  if new.status<>'pending' then return new; end if;
  if tg_op='UPDATE' and old.status='pending' then return new; end if;
  if not private.offerpsp_module_enabled('pre_compliance') then return new; end if;
  select c.enabled,s.decrypted_secret into v_enabled,v_token
    from private.offerpsp_screening_dispatch_config c
    left join vault.decrypted_secrets s on s.id=c.secret_id where c.singleton;
  if not coalesce(v_enabled,false) or v_token is null then
    insert into private.offerpsp_research_screening_dispatches(job_id,outcome) values(new.id,'unconfigured');
    return new;
  end if;
  v_signed := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' ||
    translate(rtrim(encode(convert_to(jsonb_build_object(
      'iss','offerpsp-production','aud','offerpsp_screening_wakeup',
      'iat',floor(extract(epoch from clock_timestamp())),
      'exp',floor(extract(epoch from clock_timestamp()))+60,'jti',gen_random_uuid()
    )::text,'UTF8'),'base64'),'='),'+/' || chr(10),'-_');
  v_ticket := v_signed || '.' || translate(rtrim(encode(
    extensions.hmac(convert_to(v_signed,'UTF8'),convert_to(v_token,'UTF8'),'sha256'),
    'base64'),'='),'+/' || chr(10),'-_');
  begin
    select net.http_post(
      url := 'https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-screening-ready-v1',
      body := '{"event":"research_screening_ready"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_ticket),
      timeout_milliseconds := 10000
    ) into v_request;
    insert into private.offerpsp_research_screening_dispatches(job_id,request_id,outcome)
      values(new.id,v_request,'queued');
  exception when others then
    insert into private.offerpsp_research_screening_dispatches(job_id,outcome,error_code)
      values(new.id,'enqueue_failed',sqlstate);
  end;
  return new;
end;
$$;
revoke all on function private.offerpsp_notify_research_screening_pending() from public,anon,authenticated,service_role;

create trigger offerpsp_research_screening_ready
  after insert or update of status on private.offerpsp_research_screening_jobs
  for each row execute function private.offerpsp_notify_research_screening_pending();
