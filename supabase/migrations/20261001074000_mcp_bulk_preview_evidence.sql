-- Model prose/UUIDs are not evidence that a server preview exists.
create or replace function public.get_offerpsp_bulk_confirmation_preview(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item private.aibot_bulk_confirmations;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_item from private.aibot_bulk_confirmations
  where id=p_token and status='pending' and expires_at>now();
  if not found then return null; end if;
  return jsonb_build_object('confirmation_required',true,'confirmation_token',v_item.id,
    'status',v_item.status,'action',v_item.action,'entity_type',v_item.entity_type,
    'count',cardinality(v_item.target_ids),'items',v_item.preview,
    'requested_changes',v_item.command-'ids'-'chat_id'-'action'-'entity_type',
    'expires_at',v_item.expires_at);
end;
$$;
revoke all on function public.get_offerpsp_bulk_confirmation_preview(uuid) from public,anon,service_role;
grant execute on function public.get_offerpsp_bulk_confirmation_preview(uuid) to authenticated;
