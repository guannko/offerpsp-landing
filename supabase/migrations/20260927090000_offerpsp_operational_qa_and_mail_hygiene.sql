-- Keep durable QA and service evidence without allowing it to distort the
-- operational PSP catalogue or the Radio Room work queue.

update private.offerpsp_offer_routes
set status = 'archived', updated_at = now()
where provider_id = '1e584fde-67d7-42d1-be52-83c014218c09'::uuid
  and exists (
    select 1
    from private.offerpsp_providers provider
    where provider.id = private.offerpsp_offer_routes.provider_id
      and provider.brand_name = 'PAYOK E2E TEST 20260826'
  )
  and status <> 'archived';

update private.offerpsp_providers
set relationship_status = 'archived',
    archived_at = coalesce(archived_at, now()),
    relationship_notes = concat_ws(
      E'\n',
      nullif(trim(relationship_notes), ''),
      'Synthetic PAYOK E2E provider retained outside operational catalogues.'
    ),
    updated_at = now()
where id = '1e584fde-67d7-42d1-be52-83c014218c09'::uuid
  and brand_name = 'PAYOK E2E TEST 20260826';

insert into private.offerpsp_entity_audit(
  entity_type, entity_id, action_type, reason, after_state
)
select
  'provider', provider.id::text, 'qa_fixture_archived',
  'Exclude the historical PAYOK E2E provider and its routes from operational surfaces.',
  jsonb_build_object(
    'relationship_status', provider.relationship_status,
    'archived_at', provider.archived_at,
    'archived_route_count', (
      select count(*)
      from private.offerpsp_offer_routes route
      where route.provider_id = provider.id and route.status = 'archived'
    )
  )
from private.offerpsp_providers provider
where provider.id = '1e584fde-67d7-42d1-be52-83c014218c09'::uuid;

create or replace function private.offerpsp_mail_non_operational_reason(
  p_subject text,
  p_participant_email text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(trim(coalesce(p_participant_email, ''))) in (
      'bizdev@offerpsp.com',
      'hello@offerpsp.com',
      'guannko@gmail.com'
    ) then 'internal'
    when lower(trim(coalesce(p_participant_email, ''))) ~ '@[^@]+[.]invalid$'
      then 'qa_fixture'
    when lower(trim(coalesce(p_subject, ''))) like '[test]%'
      or lower(trim(coalesce(p_subject, ''))) like '[live e2e]%'
      or lower(trim(coalesce(p_subject, ''))) like '[offerpsp test]%'
      or lower(trim(coalesce(p_subject, ''))) like '[offerpsp e2e]%'
      then 'qa_fixture'
    when lower(trim(coalesce(p_subject, ''))) in (
      'test',
      'offerpsp control bridge — verified sender',
      'offerpsp control bridge — system check'
    ) then 'qa_fixture'
    when lower(trim(coalesce(p_participant_email, ''))) in (
      'team@connect.sparkmailapp.com',
      'spark@readdle.com'
    ) then 'mail_service'
    when lower(trim(coalesce(p_participant_email, ''))) = 'payments@news.ecommpay.com'
      then 'marketing'
    when lower(trim(coalesce(p_participant_email, ''))) like 'mailer-daemon@%'
      then 'delivery_system'
    when lower(trim(coalesce(p_subject, ''))) ~ '(ссылка для входа|your sign[ -]?in link|magic link|confirm your email|email account login)'
      then 'authentication'
    else null
  end;
$$;

create or replace function private.offerpsp_classify_email_thread()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_reason text;
begin
  v_reason := private.offerpsp_mail_non_operational_reason(new.subject, new.participant_email);
  if v_reason is null then
    return new;
  end if;

  if new.status <> 'trashed' then
    new.status := 'archived';
  end if;
  new.unread_count := 0;
  new.follow_up_at := null;
  new.is_flagged := false;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'operational_visibility', 'excluded',
    'operational_exclusion_reason', v_reason,
    'operational_excluded_at', coalesce(
      new.metadata ->> 'operational_excluded_at',
      now()::text
    )
  );
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_classify_email_thread
  on public.offerpsp_email_threads;
create trigger tg_offerpsp_classify_email_thread
before insert or update
on public.offerpsp_email_threads
for each row execute function private.offerpsp_classify_email_thread();

update public.offerpsp_email_threads thread
set status = case when thread.status = 'trashed' then 'trashed' else 'archived' end,
    unread_count = 0,
    follow_up_at = null,
    is_flagged = false,
    metadata = coalesce(thread.metadata, '{}'::jsonb) || jsonb_build_object(
      'operational_visibility', 'excluded',
      'operational_exclusion_reason', private.offerpsp_mail_non_operational_reason(
        thread.subject,
        thread.participant_email
      ),
      'operational_excluded_at', coalesce(
        thread.metadata ->> 'operational_excluded_at',
        now()::text
      )
    ),
    updated_at = now()
where private.offerpsp_mail_non_operational_reason(
  thread.subject,
  thread.participant_email
) is not null;

revoke all on function private.offerpsp_mail_non_operational_reason(text, text)
  from public, anon, authenticated;
revoke all on function private.offerpsp_classify_email_thread()
  from public, anon, authenticated;
grant execute on function private.offerpsp_mail_non_operational_reason(text, text)
  to service_role;
grant execute on function private.offerpsp_classify_email_thread()
  to service_role;

comment on function private.offerpsp_mail_non_operational_reason(text, text) is
  'Classifies known QA, internal, authentication and bulk-service mail that must remain outside the Radio Room work queue.';
