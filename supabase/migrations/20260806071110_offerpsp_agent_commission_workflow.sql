create or replace function public.list_offerpsp_agent_commissions(
  p_agent_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (
    select 1 from public.offerpsp_organizations
    where id = p_agent_organization_id and organization_type = 'agent'
  ) then raise exception 'Agent organization not found'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'merchant_name', m.name,
      'lead_company', l.company
    ) order by c.period_start desc nulls last, c.created_at desc)
    from private.offerpsp_agent_commissions c
    left join public.offerpsp_organizations m on m.id = c.merchant_organization_id
    left join public.offerpsp_leads l on l.lead_id = c.lead_id
    where c.agent_organization_id = p_agent_organization_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_offerpsp_agent_commission(
  p_agent_organization_id uuid,
  p_commission_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_agent_commissions;
  v_after private.offerpsp_agent_commissions;
  v_merchant_id uuid := nullif(trim(p_payload ->> 'merchant_organization_id'), '')::uuid;
  v_lead_id uuid := nullif(trim(p_payload ->> 'lead_id'), '')::uuid;
  v_basis text := coalesce(nullif(trim(p_payload ->> 'basis'), ''), 'processing_volume');
  v_currency text := upper(nullif(trim(p_payload ->> 'currency'), ''));
  v_amount numeric := nullif(trim(p_payload ->> 'amount'), '')::numeric;
  v_period_start date := nullif(trim(p_payload ->> 'period_start'), '')::date;
  v_period_end date := nullif(trim(p_payload ->> 'period_end'), '')::date;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (
    select 1 from public.offerpsp_organizations
    where id = p_agent_organization_id and organization_type = 'agent'
  ) then raise exception 'Agent organization not found'; end if;
  if v_basis not in ('processing_volume', 'revenue_share', 'fixed_referral', 'manual') then
    raise exception 'Unsupported commission basis';
  end if;
  if v_amount is null or v_amount < 0 or v_currency is null then
    raise exception 'Commission amount and currency are required';
  end if;
  if v_period_end is not null and v_period_start is not null and v_period_end < v_period_start then
    raise exception 'Commission period end cannot precede period start';
  end if;
  if v_merchant_id is not null and not exists (
    select 1 from public.offerpsp_agent_clients
    where agent_organization_id = p_agent_organization_id
      and merchant_organization_id = v_merchant_id
  ) then raise exception 'Merchant is not assigned to this agent'; end if;

  if p_commission_id is null then
    insert into private.offerpsp_agent_commissions(
      agent_organization_id, merchant_organization_id, lead_id, basis,
      basis_amount, commission_percent, commission_fixed, currency, amount,
      status, period_start, period_end, notes, created_by
    ) values (
      p_agent_organization_id, v_merchant_id, v_lead_id, v_basis,
      nullif(trim(p_payload ->> 'basis_amount'), '')::numeric,
      nullif(trim(p_payload ->> 'commission_percent'), '')::numeric,
      nullif(trim(p_payload ->> 'commission_fixed'), '')::numeric,
      v_currency, v_amount, 'projected', v_period_start, v_period_end,
      nullif(trim(p_payload ->> 'notes'), ''), auth.uid()
    ) returning * into v_after;
  else
    select * into v_before from private.offerpsp_agent_commissions
    where id = p_commission_id and agent_organization_id = p_agent_organization_id for update;
    if not found then raise exception 'Agent commission not found'; end if;
    if v_before.status <> 'projected' then
      raise exception 'Only projected commissions can be edited';
    end if;
    update private.offerpsp_agent_commissions set
      merchant_organization_id = v_merchant_id,
      lead_id = v_lead_id,
      basis = v_basis,
      basis_amount = nullif(trim(p_payload ->> 'basis_amount'), '')::numeric,
      commission_percent = nullif(trim(p_payload ->> 'commission_percent'), '')::numeric,
      commission_fixed = nullif(trim(p_payload ->> 'commission_fixed'), '')::numeric,
      currency = v_currency,
      amount = v_amount,
      period_start = v_period_start,
      period_end = v_period_end,
      notes = nullif(trim(p_payload ->> 'notes'), '')
    where id = v_before.id returning * into v_after;
  end if;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'organization', p_agent_organization_id::text,
    case when p_commission_id is null then 'commission_created' else 'commission_updated' end,
    auth.uid(), case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end;
$$;

create or replace function public.set_offerpsp_agent_commission_status(
  p_commission_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_agent_commissions;
  v_after private.offerpsp_agent_commissions;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_before from private.offerpsp_agent_commissions where id = p_commission_id for update;
  if not found then raise exception 'Agent commission not found'; end if;
  if not (
    (v_before.status = 'projected' and p_status in ('approved', 'void')) or
    (v_before.status = 'approved' and p_status in ('earned', 'void')) or
    (v_before.status = 'earned' and p_status in ('paid', 'void'))
  ) then raise exception 'Invalid commission status transition'; end if;

  update private.offerpsp_agent_commissions set
    status = p_status,
    earned_at = case when p_status = 'earned' then now() else earned_at end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_commission_id returning * into v_after;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'organization', v_after.agent_organization_id::text,
    'commission_' || p_status, auth.uid(), to_jsonb(v_before), to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end;
$$;

revoke all on function public.list_offerpsp_agent_commissions(uuid) from public, anon;
revoke all on function public.save_offerpsp_agent_commission(uuid,uuid,jsonb) from public, anon;
revoke all on function public.set_offerpsp_agent_commission_status(uuid,text,text) from public, anon;
grant execute on function public.list_offerpsp_agent_commissions(uuid) to authenticated;
grant execute on function public.save_offerpsp_agent_commission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.set_offerpsp_agent_commission_status(uuid,text,text) to authenticated;

comment on function public.set_offerpsp_agent_commission_status(uuid,text,text) is
  'Staff-only projected to approved to earned to paid commission workflow with immutable terminal states.';
