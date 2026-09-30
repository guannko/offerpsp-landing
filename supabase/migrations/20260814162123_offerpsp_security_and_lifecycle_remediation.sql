-- Close the legacy client projection that returns unsanitized settlement terms.
-- Keep service-role access only for controlled rollback/forensics.
revoke execute on function public.list_offerpsp_client_options(uuid)
  from public, anon, authenticated;
grant execute on function public.list_offerpsp_client_options(uuid)
  to service_role;

comment on function public.list_offerpsp_client_options(uuid) is
  'Legacy client projection retained for controlled service-role rollback only. Clients must use list_offerpsp_client_offers(uuid).';

-- Archiving a merchant workspace must revoke client and agent access even if
-- the old business status remains shared or otherwise open.
create or replace function public.can_access_offerpsp_client_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.offerpsp_leads l
    where l.lead_id = p_lead_id
      and l.record_state <> 'archived'
      and l.status not in ('closed', 'spam')
      and (
        l.client_user_id = auth.uid()
        or (
          l.agent_organization_id is not null
          and l.merchant_organization_id is not null
          and public.is_offerpsp_organization_member(
            l.agent_organization_id,
            array['owner', 'admin', 'manager']
          )
          and exists (
            select 1
            from public.offerpsp_agent_clients ac
            where ac.agent_organization_id = l.agent_organization_id
              and ac.merchant_organization_id = l.merchant_organization_id
              and ac.status = 'active'
          )
        )
      )
  );
$$;

revoke execute on function public.can_access_offerpsp_client_lead(uuid)
  from public, anon;
grant execute on function public.can_access_offerpsp_client_lead(uuid)
  to authenticated, service_role;

comment on function public.can_access_offerpsp_client_lead(uuid) is
  'Client/agent access predicate. Archived, closed and spam merchant requests are never accessible.';

-- PAYOK has no published routes and remains under source/terms review. Keep it
-- in the processing registry until staff explicitly publishes verified supply.
update private.offerpsp_providers p
set relationship_status = 'onboarding',
    updated_at = now()
where lower(trim(p.brand_name)) = 'payok'
  and p.relationship_status = 'active'
  and not exists (
    select 1
    from private.offerpsp_offer_routes r
    where r.provider_id = p.id
      and r.status = 'published'
  );

-- Closed or archived merchants must not leave apparently active work behind.
update public.offerpsp_tasks t
set status = 'cancelled',
    completed_at = coalesce(t.completed_at, now()),
    updated_at = now(),
    metadata = t.metadata || jsonb_build_object(
      'auto_cancelled_reason', 'merchant_lifecycle',
      'auto_cancelled_at', now()
    )
from public.offerpsp_leads l
where l.lead_id = t.lead_id
  and t.status in ('pending', 'in_progress')
  and (l.record_state = 'archived' or l.status in ('closed', 'spam'));

create or replace function private.offerpsp_cancel_tasks_for_inactive_lead()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.record_state = 'archived' or new.status in ('closed', 'spam') then
    update public.offerpsp_tasks
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'auto_cancelled_reason', 'merchant_lifecycle',
          'auto_cancelled_at', now()
        )
    where lead_id = new.lead_id
      and status in ('pending', 'in_progress');
  end if;
  return new;
end;
$$;

revoke all on function private.offerpsp_cancel_tasks_for_inactive_lead()
  from public, anon, authenticated;

drop trigger if exists offerpsp_leads_cancel_inactive_tasks on public.offerpsp_leads;
create trigger offerpsp_leads_cancel_inactive_tasks
after update of status, record_state on public.offerpsp_leads
for each row
when (old.status is distinct from new.status or old.record_state is distinct from new.record_state)
execute function private.offerpsp_cancel_tasks_for_inactive_lead();

-- Keep explicit E2E mail evidence for forensics, but remove it from the live queue.
update public.offerpsp_email_threads
set status = 'archived', updated_at = now()
where status <> 'archived'
  and subject ~* '^\\[(TEST|LIVE E2E)\\]';

-- Foreign-key indexes used by the active operations, matching and deal paths.
create index if not exists offerpsp_tasks_lead_idx
  on public.offerpsp_tasks (lead_id) where lead_id is not null;
create index if not exists offerpsp_introductions_lead_idx
  on private.offerpsp_introductions (lead_id);
create index if not exists offerpsp_introductions_provider_idx
  on private.offerpsp_introductions (provider_id);
create index if not exists offerpsp_introductions_route_idx
  on private.offerpsp_introductions (route_id);
create index if not exists offerpsp_provider_reviews_route_idx
  on private.offerpsp_provider_reviews (route_id);
create index if not exists offerpsp_settlement_terms_route_idx
  on private.offerpsp_settlement_terms (route_id);
create index if not exists offerpsp_offer_fee_components_route_idx
  on private.offerpsp_offer_fee_components (route_id);
create index if not exists offerpsp_offer_limits_route_idx
  on private.offerpsp_offer_limits (route_id);
