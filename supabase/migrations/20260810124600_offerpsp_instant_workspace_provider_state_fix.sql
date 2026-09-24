-- The private provider registry uses relationship_status and archived_at.
-- Correct the already-created instant-intake function without changing data.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.process_offerpsp_instant_intake(uuid,integer)'::regprocedure
  ) into v_definition;

  v_definition := replace(
    v_definition,
    'and provider.status = ''active''',
    E'and provider.relationship_status = ''active''\n        and provider.archived_at is null'
  );

  execute v_definition;
end;
$$;
