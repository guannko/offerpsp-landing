create or replace function public.set_offerpsp_provider_default_markups(
  p_provider_id uuid,
  p_payin_markup_pp numeric,
  p_payout_markup_pp numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_payin jsonb;
  v_payout jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if not exists (
    select 1
    from private.offerpsp_providers
    where id = p_provider_id
  ) then
    raise exception 'PSP provider not found';
  end if;

  if p_payin_markup_pp is null or p_payin_markup_pp < 0 or p_payin_markup_pp > 100 then
    raise exception 'PayIn markup must be between 0 and 100 percentage points';
  end if;

  if p_payout_markup_pp is null or p_payout_markup_pp < 0 or p_payout_markup_pp > 100 then
    raise exception 'PayOut markup must be between 0 and 100 percentage points';
  end if;

  v_payin := public.set_offerpsp_margin_policy(
    p_provider_id,
    null,
    'payin',
    'percentage_points',
    p_payin_markup_pp,
    null,
    null,
    coalesce(nullif(trim(p_notes), ''), 'Provider default PayIn markup updated')
  );

  v_payout := public.set_offerpsp_margin_policy(
    p_provider_id,
    null,
    'payout',
    'percentage_points',
    p_payout_markup_pp,
    null,
    null,
    coalesce(nullif(trim(p_notes), ''), 'Provider default PayOut markup updated')
  );

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'payin', v_payin,
    'payout', v_payout
  );
end;
$$;

revoke all on function public.set_offerpsp_provider_default_markups(uuid, numeric, numeric, text)
  from public, anon;
grant execute on function public.set_offerpsp_provider_default_markups(uuid, numeric, numeric, text)
  to authenticated;

comment on function public.set_offerpsp_provider_default_markups(uuid, numeric, numeric, text) is
  'Atomically versions provider-level PayIn and PayOut percentage-point markups. Route- and merchant-specific policies retain precedence.';
