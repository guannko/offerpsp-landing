create or replace function public.bulk_manage_offerpsp_leads(
  p_lead_ids uuid[],
  p_action text,
  p_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ids uuid[];
  v_action text := lower(trim(coalesce(p_action, '')));
  v_value text := nullif(trim(coalesce(p_value, '')), '');
  v_assignee uuid;
  v_count integer;
  v_statuses constant text[] := array[
    'new', 'qualifying', 'needs_clarification', 'matching', 'matched',
    'shortlist_ready', 'shared', 'option_selected', 'dossier_ready',
    'provider_reviewing', 'provider_needs_info', 'provider_accepted',
    'provider_declined', 'telegram_created', 'zoom_scheduled',
    'negotiating', 'won', 'lost', 'closed', 'spam'
  ];
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select coalesce(array_agg(distinct lead_id), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_lead_ids, '{}'::uuid[])) lead_id;

  if cardinality(v_ids) = 0 then
    raise exception 'Select at least one merchant';
  end if;
  if cardinality(v_ids) > 100 then
    raise exception 'Bulk operation is limited to 100 merchants';
  end if;
  if (select count(*) from public.offerpsp_leads where lead_id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'One or more merchants were not found';
  end if;

  if v_action = 'assign' then
    if v_value is not null then
      begin
        v_assignee := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid staff member';
      end;
      if not exists (
        select 1 from public.offerpsp_staff_members
        where user_id = v_assignee and active = true
      ) then
        raise exception 'Active staff assignee not found';
      end if;
    end if;
    update public.offerpsp_leads
    set assigned_to = v_assignee, updated_at = now()
    where lead_id = any(v_ids);
  elsif v_action = 'status' then
    if v_value is null or not (v_value = any(v_statuses)) then
      raise exception 'Unsupported merchant status';
    end if;
    update public.offerpsp_leads
    set status = v_value, updated_at = now()
    where lead_id = any(v_ids);
  elsif v_action = 'archive' then
    update public.offerpsp_leads
    set record_state = 'archived', updated_at = now()
    where lead_id = any(v_ids);
  elsif v_action = 'restore' then
    update public.offerpsp_leads
    set record_state = 'active', updated_at = now()
    where lead_id = any(v_ids);
  else
    raise exception 'Unsupported bulk action';
  end if;

  get diagnostics v_count = row_count;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  )
  select
    lead_id,
    auth.uid(),
    'staff',
    'merchant_bulk_updated',
    'Merchant updated from Inbox',
    jsonb_build_object('action', v_action, 'value', v_value, 'batch_size', v_count),
    false
  from unnest(v_ids) lead_id;

  return jsonb_build_object(
    'updated_count', v_count,
    'action', v_action,
    'value', v_value,
    'lead_ids', to_jsonb(v_ids)
  );
end;
$$;

revoke all on function public.bulk_manage_offerpsp_leads(uuid[], text, text) from public;
revoke execute on function public.bulk_manage_offerpsp_leads(uuid[], text, text) from anon;
grant execute on function public.bulk_manage_offerpsp_leads(uuid[], text, text) to authenticated;

comment on function public.bulk_manage_offerpsp_leads(uuid[], text, text) is
  'Atomic staff-only assignment, status and archive operations for the OfferPSP Inbox.';
