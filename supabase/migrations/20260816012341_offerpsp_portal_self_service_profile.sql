-- Self-service merchant profile for the client portal.
-- The profile is organization-scoped and no longer requires an existing payment request.

create or replace function public.ensure_offerpsp_my_merchant_profile(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_organization_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if v_name is null then raise exception 'Company name is required'; end if;
  if length(v_name) > 160 then raise exception 'Company name is too long'; end if;

  -- Serialize profile initialization per user so concurrent saves cannot create
  -- multiple merchant organizations for the same account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select o.id into v_organization_id
  from public.offerpsp_organization_members om
  join public.offerpsp_organizations o on o.id = om.organization_id
  where om.user_id = v_user_id
    and om.active
    and o.organization_type = 'merchant'
    and o.status = 'active'
  order by (om.role = 'owner') desc, o.created_at
  limit 1;

  if v_organization_id is null then
    insert into public.offerpsp_organizations(
      organization_type, name, legal_name, status, created_by
    ) values (
      'merchant', v_name, v_name, 'active', v_user_id
    ) returning id into v_organization_id;

    insert into public.offerpsp_organization_members(
      organization_id, user_id, role, active, created_by
    ) values (
      v_organization_id, v_user_id, 'owner', true, v_user_id
    );
  end if;

  return v_organization_id;
end;
$$;

create or replace function public.get_offerpsp_company_workspace_by_organization(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_profile jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.is_offerpsp_staff()
    or public.is_offerpsp_organization_member(p_organization_id)
  ) then raise exception 'Access denied'; end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id, 'internal_code', o.internal_code, 'name', o.name,
    'legal_name', o.legal_name, 'registration_number', o.registration_number,
    'registration_jurisdiction', o.registration_jurisdiction,
    'registered_address', o.registered_address, 'operating_address', o.operating_address,
    'website_url', o.website_url, 'description', o.description,
    'license_status', o.license_status, 'license_jurisdiction', o.license_jurisdiction,
    'license_number', o.license_number, 'verification_status', o.verification_status,
    'verified_at', o.verified_at, 'updated_at', o.updated_at
  )) into v_profile
  from public.offerpsp_organizations o
  where o.id = p_organization_id
    and o.organization_type = 'merchant'
    and o.status = 'active';

  if v_profile is null then raise exception 'Merchant organization not found'; end if;

  return jsonb_build_object(
    'organization', v_profile,
    'profile_completion', private.offerpsp_profile_completion(p_organization_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', d.id, 'document_type', d.document_type, 'title', d.title,
        'file_name', d.file_name, 'storage_path', d.storage_path,
        'mime_type', d.mime_type, 'size_bytes', d.size_bytes, 'status', d.status,
        'issued_at', d.issued_at, 'expires_at', d.expires_at,
        'client_note', d.client_note,
        'review_note', case when d.status = 'rejected' then d.review_note else null end,
        'created_at', d.created_at, 'updated_at', d.updated_at
      )) order by (d.status <> 'archived') desc, d.updated_at desc)
      from private.offerpsp_organization_documents d
      where d.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ensure_offerpsp_my_merchant_profile(text)
  from public, anon, authenticated;
revoke all on function public.get_offerpsp_company_workspace_by_organization(uuid)
  from public, anon, authenticated;

grant execute on function public.ensure_offerpsp_my_merchant_profile(text)
  to authenticated;
grant execute on function public.get_offerpsp_company_workspace_by_organization(uuid)
  to authenticated;

comment on function public.ensure_offerpsp_my_merchant_profile(text) is
  'Creates at most one self-service merchant organization for the signed-in portal user.';
comment on function public.get_offerpsp_company_workspace_by_organization(uuid) is
  'Returns client-safe merchant profile and document metadata for an organization member.';
