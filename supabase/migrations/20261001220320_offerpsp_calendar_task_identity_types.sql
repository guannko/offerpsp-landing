-- Keep the already-applied base migration intact. Legacy task entity_id is text,
-- not uuid; compare strings without casting untrusted legacy identifiers to uuid.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.get_offerpsp_calendar_events(timestamptz,timestamptz,integer,integer)'::regprocedure)
    into v_definition;
  if strpos(v_definition, 'q.lead_id = t.entity_id') = 0 or strpos(v_definition, 'q.id = t.entity_id') = 0 then
    raise exception 'Unexpected calendar definition: review task identity comparisons';
  end if;
  v_definition := replace(v_definition, 'q.lead_id = t.entity_id', 'q.lead_id::text = t.entity_id::text');
  v_definition := replace(v_definition, 'q.id = t.entity_id', 'q.id::text = t.entity_id::text');
  execute v_definition;
end;
$$;
