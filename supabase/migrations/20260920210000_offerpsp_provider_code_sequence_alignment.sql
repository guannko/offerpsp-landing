-- Keep generated PSP-* codes ahead of legacy/manual codes and make the
-- generator skip historical collisions instead of failing provider creation.
select setval(
  'private.offerpsp_provider_code_seq',
  greatest(
    coalesce(
      (
        select max((substring(internal_code from '[0-9]+$'))::bigint)
        from private.offerpsp_providers
        where internal_code ~ '^PSP-[0-9]+$'
      ),
      0
    ),
    1
  ),
  true
);

create or replace function private.next_offerpsp_provider_code()
returns text
language plpgsql
volatile
set search_path = pg_catalog, private
as $function$
declare
  v_code text;
begin
  loop
    v_code := 'PSP-' || lpad(nextval('private.offerpsp_provider_code_seq')::text, 6, '0');
    exit when not exists (
      select 1
      from private.offerpsp_providers
      where internal_code = v_code
    );
  end loop;

  return v_code;
end;
$function$;

revoke all on function private.next_offerpsp_provider_code() from public;

comment on function private.next_offerpsp_provider_code() is
  'Generates collision-safe PSP identifiers after historical or manual imports.';
