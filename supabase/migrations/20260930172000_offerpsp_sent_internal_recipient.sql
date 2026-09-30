-- A real Sent copy addressed to ourselves is internal archive evidence, not a
-- retryable ingestion failure. CC-only external recipients remain real contacts.
-- The existing internal-mail trigger excludes self mail from operational queues.
do $migration$
declare
  v_definition text;
  v_before text := E'    select private.offerpsp_mail_extract_email(address) into v_participant\n    from unnest(v_to) address where lower(address)<>v_own limit 1;\n    if v_participant is null then raise exception ''Sent evidence requires an external recipient''; end if;';
  v_after text := E'    select private.offerpsp_mail_extract_email(address) into v_participant\n    from unnest(v_to||v_cc) address\n    where private.offerpsp_mail_extract_email(address)<>v_own limit 1;\n    if v_participant is null and exists (\n      select 1 from unnest(v_to||v_cc) address\n      where private.offerpsp_mail_extract_email(address)=v_own\n    ) then v_participant := v_own; end if;\n    if v_participant is null then raise exception ''Sent evidence requires an external recipient''; end if;';
begin
  v_definition := pg_catalog.pg_get_functiondef('public.aibot_n8n_ingest_email(jsonb)'::regprocedure);
  if position(v_before in v_definition)=0 then
    raise exception 'Unexpected mail ingest definition; controlled replacement refused';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$migration$;
