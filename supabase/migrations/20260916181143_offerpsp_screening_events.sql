-- Server migration version reconciled after MCP apply; do not reapply under the CLI timestamp.
-- Event-driven wake-up; the existing fenced queue remains the source of truth.
-- No merchant data leaves Postgres in the notification. pg_net sends only after commit.
create extension if not exists pg_net with schema extensions;

create table private.offerpsp_screening_dispatch_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  secret_id uuid references vault.secrets(id),
  updated_at timestamptz not null default now()
);
insert into private.offerpsp_screening_dispatch_config(singleton) values (true);
alter table private.offerpsp_screening_dispatch_config enable row level security;
revoke all on private.offerpsp_screening_dispatch_config from public, anon, authenticated, service_role;

create table private.offerpsp_screening_dispatches (
  id bigint generated always as identity primary key,
  case_id uuid not null references private.offerpsp_compliance_cases(id),
  created_at timestamptz not null default now(),
  request_id bigint,
  outcome text not null check (outcome in ('queued', 'unconfigured', 'enqueue_failed')),
  error_code text
);
alter table private.offerpsp_screening_dispatches enable row level security;
revoke all on private.offerpsp_screening_dispatches from public, anon, authenticated, service_role;

-- Narrow write-only provisioning API. Neither URL nor vault secret is returned or caller-selectable.
create function public.configure_offerpsp_screening_dispatch(p_token text, p_enabled boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_enabled is null then
    raise exception 'Invalid dispatch configuration';
  end if;
  select secret_id into v_id from private.offerpsp_screening_dispatch_config where singleton for update;
  if v_id is null then
    select vault.create_secret(p_token, 'offerpsp_screening_event_token', 'Narrow n8n queue wake-up only') into v_id;
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  update private.offerpsp_screening_dispatch_config
    set secret_id=v_id, enabled=p_enabled, updated_at=now() where singleton;
  return jsonb_build_object('configured', true, 'enabled', p_enabled);
end;
$$;
revoke all on function public.configure_offerpsp_screening_dispatch(text, boolean) from public, anon, authenticated;
grant execute on function public.configure_offerpsp_screening_dispatch(text, boolean) to service_role;

create function private.offerpsp_notify_screening_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token text; v_request bigint; v_enabled boolean;
begin
  if new.case_status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.case_status = 'pending' then return new; end if;
  if not private.offerpsp_module_enabled('pre_compliance') or not exists (
    select 1 from public.offerpsp_leads l where l.lead_id=new.lead_id
      and l.record_state='active' and l.status not in ('closed','spam','won','lost')
  ) then return new; end if;
  select c.enabled, s.decrypted_secret into v_enabled, v_token
    from private.offerpsp_screening_dispatch_config c
    left join vault.decrypted_secrets s on s.id=c.secret_id where c.singleton;
  if not coalesce(v_enabled, false) or v_token is null then
    insert into private.offerpsp_screening_dispatches(case_id,outcome) values(new.id,'unconfigured');
    return new;
  end if;
  begin
    select net.http_post(
      url := 'https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-screening-ready-v1',
      body := '{"event":"screening_ready"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','X-OfferPSP-Screening-Event',v_token),
      timeout_milliseconds := 10000
    ) into v_request;
    insert into private.offerpsp_screening_dispatches(case_id,request_id,outcome) values(new.id,v_request,'queued');
  exception when others then
    -- Preserve intake even if the network extension is unavailable. The 12-hour sweep recovers it.
    -- Never store SQLERRM: an upstream exception could contain authorization headers.
    insert into private.offerpsp_screening_dispatches(case_id,outcome,error_code) values(new.id,'enqueue_failed',sqlstate);
  end;
  return new;
end;
$$;
revoke all on function private.offerpsp_notify_screening_pending() from public, anon, authenticated, service_role;
create trigger offerpsp_screening_ready
  after insert or update of case_status on private.offerpsp_compliance_cases
  for each row execute function private.offerpsp_notify_screening_pending();
