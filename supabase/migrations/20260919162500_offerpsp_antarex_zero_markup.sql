-- Antarex source rates already include OfferPSP's commercial margin.
-- Deactivate the legacy +1 percentage-point PayIn policy so client pricing
-- falls back to the provider's zero-markup default. Preserve every previous
-- policy version and write the change to the supply and entity audit trails.

do $$
declare
  v_provider_id uuid;
  v_policy private.offerpsp_margin_policies;
  v_after private.offerpsp_margin_policies;
begin
  select id
  into v_provider_id
  from private.offerpsp_providers
  where internal_code = 'PSP-000002'
    and brand_name = 'Antarex';

  if v_provider_id is null then
    raise notice 'Canonical Antarex provider PSP-000002 is not present; zero-markup migration is a no-op';
    return;
  end if;

  if coalesce((
    select margin_included_default
    from private.offerpsp_providers
    where id = v_provider_id
  ), true) then
    raise exception 'Antarex zero-markup fallback is not configured';
  end if;

  for v_policy in
    select *
    from private.offerpsp_margin_policies
    where provider_id = v_provider_id
      and route_id is null
      and merchant_lead_id is null
      and flow = 'payin'
      and active
    for update
  loop
    update private.offerpsp_margin_policies
    set active = false,
        effective_to = greatest(clock_timestamp(), effective_from + interval '1 microsecond'),
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Deactivated 2026-09-19: Antarex client rates already include the OfferPSP margin; provider PayIn markup set to 0%.'
        ),
        updated_at = clock_timestamp()
    where id = v_policy.id
    returning * into v_after;

    insert into private.offerpsp_supply_activities (
      provider_id,
      route_id,
      actor_user_id,
      action_type,
      summary,
      before_state,
      after_state
    ) values (
      v_provider_id,
      null,
      null,
      'margin_policy_deactivated',
      'Antarex provider PayIn markup set to 0%',
      to_jsonb(v_policy),
      to_jsonb(v_after)
    );

    insert into private.offerpsp_entity_audit (
      entity_type,
      entity_id,
      action_type,
      actor_user_id,
      reason,
      before_state,
      after_state
    ) values (
      'margin_policy',
      v_policy.id::text,
      'provider_margin_deactivated',
      null,
      'Antarex client rates already include the OfferPSP margin; provider PayIn markup set to 0%.',
      to_jsonb(v_policy),
      to_jsonb(v_after)
    );
  end loop;
end
$$;
