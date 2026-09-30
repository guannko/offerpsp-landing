create or replace function public.get_offerpsp_organization_members(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from public.offerpsp_organizations where id = p_organization_id) then
    raise exception 'OfferPSP organization not found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', om.id,
      'organization_id', om.organization_id,
      'user_id', om.user_id,
      'email', u.email,
      'role', om.role,
      'active', om.active,
      'created_at', om.created_at,
      'updated_at', om.updated_at
    ) order by om.active desc, om.role = 'owner' desc, lower(u.email))
    from public.offerpsp_organization_members om
    join auth.users u on u.id = om.user_id
    where om.organization_id = p_organization_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_offerpsp_organization_member(
  p_organization_id uuid,
  p_member_id uuid default null,
  p_email text default null,
  p_role text default 'viewer',
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $$
declare
  v_member public.offerpsp_organization_members;
  v_before public.offerpsp_organization_members;
  v_user_id uuid;
  v_email text;
  v_action text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from public.offerpsp_organizations where id = p_organization_id) then
    raise exception 'OfferPSP organization not found';
  end if;
  if p_role not in ('owner', 'admin', 'manager', 'viewer') then
    raise exception 'Unsupported organization role';
  end if;

  if p_member_id is null then
    v_email := lower(nullif(trim(p_email), ''));
    if v_email is null then raise exception 'Member email is required'; end if;
    select id into v_user_id from auth.users where lower(email) = v_email;
    if v_user_id is null then
      raise exception 'No Supabase user exists for this email. Invite the user before assigning a role';
    end if;

    insert into public.offerpsp_organization_members(
      organization_id, user_id, role, active, created_by
    ) values (
      p_organization_id, v_user_id, p_role, p_active, auth.uid()
    )
    on conflict (organization_id, user_id) do update
    set role = excluded.role,
        active = excluded.active
    returning * into v_member;
    v_action := 'member_added';
  else
    select * into v_before
    from public.offerpsp_organization_members
    where id = p_member_id and organization_id = p_organization_id
    for update;
    if not found then raise exception 'Organization member not found'; end if;

    if v_before.active and v_before.role = 'owner'
      and (not p_active or p_role <> 'owner')
      and not exists (
        select 1 from public.offerpsp_organization_members other
        where other.organization_id = p_organization_id
          and other.id <> v_before.id
          and other.active
          and other.role = 'owner'
      )
    then
      raise exception 'Organization must keep at least one active owner';
    end if;

    update public.offerpsp_organization_members
    set role = p_role,
        active = p_active
    where id = v_before.id
    returning * into v_member;
    v_action := case when p_active then 'member_updated' else 'member_deactivated' end;
  end if;

  select email into v_email from auth.users where id = v_member.user_id;
  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'organization', p_organization_id::text, v_action, auth.uid(),
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_member) || jsonb_build_object('email', v_email)
  );

  return jsonb_build_object(
    'id', v_member.id,
    'organization_id', v_member.organization_id,
    'user_id', v_member.user_id,
    'email', v_email,
    'role', v_member.role,
    'active', v_member.active,
    'updated_at', v_member.updated_at
  );
end;
$$;

revoke all on function public.get_offerpsp_organization_members(uuid) from public, anon;
revoke all on function public.save_offerpsp_organization_member(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.get_offerpsp_organization_members(uuid) to authenticated;
grant execute on function public.save_offerpsp_organization_member(uuid,uuid,text,text,boolean) to authenticated;

comment on function public.save_offerpsp_organization_member(uuid,uuid,text,text,boolean) is
  'Staff-only organization membership and role management with last-owner protection and audit history.';
