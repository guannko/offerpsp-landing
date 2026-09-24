-- Route every completed automated screening into an explicit human-review queue.
-- Automation remains unable to clear, reject or classify a lead as spam on its own.

alter table private.offerpsp_compliance_cases
  drop constraint if exists offerpsp_compliance_cases_case_status_check;

alter table private.offerpsp_compliance_cases
  add constraint offerpsp_compliance_cases_case_status_check
  check (case_status in (
    'pending',
    'screening',
    'manual_review',
    'needs_info',
    'cleared',
    'hold',
    'rejected',
    'spam'
  ));

create or replace function private.offerpsp_route_completed_screening_to_manual_review()
returns trigger
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
begin
  if new.case_status = 'screening'
     and new.last_screened_at is not null
     and new.last_screened_at is distinct from old.last_screened_at then
    new.case_status := 'manual_review';
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_completed_screening_manual_review
  on private.offerpsp_compliance_cases;

create trigger offerpsp_completed_screening_manual_review
before update on private.offerpsp_compliance_cases
for each row
execute function private.offerpsp_route_completed_screening_to_manual_review();

-- Cases already screened before this migration must not remain in an ambiguous running state.
update private.offerpsp_compliance_cases
set case_status = 'manual_review',
    updated_at = now()
where case_status = 'screening'
  and last_screened_at is not null;

update public.offerpsp_tasks t
set title = 'Ручная проверка заявки: ' || l.company,
    details = 'Автопроверка завершена. Изучите доказательства и примите решение: допустить, запросить данные, поставить на паузу, отклонить или отметить как спам.',
    priority = 'high',
    updated_at = now()
from public.offerpsp_leads l
join private.offerpsp_compliance_cases c on c.lead_id = l.lead_id
where t.lead_id = l.lead_id
  and t.metadata ->> 'module' = 'pre_compliance'
  and t.status in ('pending', 'in_progress')
  and c.case_status = 'manual_review';

insert into public.offerpsp_tasks(
  lead_id, source, title, details, status, priority, due_at, metadata
)
select
  l.lead_id,
  'system',
  'Ручная проверка заявки: ' || l.company,
  'Автопроверка завершена. Изучите доказательства и примите решение: допустить, запросить данные, поставить на паузу, отклонить или отметить как спам.',
  'pending',
  'high',
  now() + interval '4 hours',
  jsonb_build_object('module', 'pre_compliance', 'case_id', c.id, 'queue', 'manual_review')
from private.offerpsp_compliance_cases c
join public.offerpsp_leads l on l.lead_id = c.lead_id
where c.case_status = 'manual_review'
  and l.record_state <> 'archived'
  and not exists (
    select 1
    from public.offerpsp_tasks t
    where t.lead_id = l.lead_id
      and t.metadata ->> 'module' = 'pre_compliance'
      and t.status in ('pending', 'in_progress')
  );

revoke all on function private.offerpsp_route_completed_screening_to_manual_review()
  from public, anon, authenticated;

