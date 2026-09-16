-- Intermediate definition; encoding is corrected by 20260916182014 before dispatch is enabled.
create or replace function private.offerpsp_notify_screening_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token text; v_request bigint; v_enabled boolean; v_signed text; v_ticket text;
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
  -- Do not enqueue the Vault signing secret. A captured ticket expires in 60 seconds
  -- and only wakes the idempotent queue (it cannot choose a lead or mutate a result).
  v_signed := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' ||
    translate(rtrim(encode(convert_to(jsonb_build_object(
      'iss','offerpsp-production','aud','offerpsp_screening_wakeup',
      'iat',floor(extract(epoch from clock_timestamp())),
      'exp',floor(extract(epoch from clock_timestamp()))+60,'jti',gen_random_uuid()
    )::text,'UTF8'),'base64'),'='), E'+/\\n', '-_');
  v_ticket := v_signed || '.' || translate(rtrim(encode(
    extensions.hmac(convert_to(v_signed,'UTF8'),convert_to(v_token,'UTF8'),'sha256'),
    'base64'),'='), E'+/\\n', '-_');
  begin
    select net.http_post(
      url := 'https://annoris--n8n-make--xjvz9xynmzwk.code.run/webhook/offerpsp-screening-ready-v1',
      body := '{"event":"screening_ready"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_ticket),
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
