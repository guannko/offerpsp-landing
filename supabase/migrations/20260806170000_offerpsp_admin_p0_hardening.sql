-- P0 hardening for Control Bridge research and communication tables.
-- Browser clients must use staff-checked RPC functions; n8n keeps service-role access.

do $block$
declare
  v_table text;
begin
  foreach v_table in array array['messages_log', 'email_templates', 'casino_interactions'] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('revoke all on table public.%I from anon, authenticated', v_table);
      execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
    end if;
  end loop;
end;
$block$;

-- Keep the generated CAS number ahead of every existing record and skip any
-- historical collision left by old imports or manually assigned identifiers.
select setval(
  'public.casino_leads_internal_seq',
  greatest(
    (select last_value from public.casino_leads_internal_seq),
    coalesce((
      select max(substring(internal_id from '^CAS-([0-9]+)$')::bigint)
      from public.casino_leads
      where internal_id ~ '^CAS-[0-9]+$'
    ), 0)
  ),
  true
);

create or replace function public.generate_casino_internal_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_internal_id text;
begin
  if new.internal_id is null then
    loop
      v_internal_id := 'CAS-' || lpad(nextval('public.casino_leads_internal_seq')::text, 4, '0');
      exit when not exists (
        select 1 from public.casino_leads where internal_id = v_internal_id
      );
    end loop;
    new.internal_id := v_internal_id;
  end if;
  return new;
end;
$function$;

comment on function public.generate_casino_internal_id() is
  'Assigns collision-safe CAS identifiers to AIBot casino research records.';
