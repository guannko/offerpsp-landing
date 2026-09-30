revoke all on public.offerpsp_organizations from authenticated;
grant select, insert, update, delete on public.offerpsp_organizations to authenticated;

revoke all on public.offerpsp_organization_members from authenticated;
grant select, insert, update, delete on public.offerpsp_organization_members to authenticated;

revoke all on public.offerpsp_agent_clients from authenticated;
grant select, insert, update, delete on public.offerpsp_agent_clients to authenticated;

revoke all on public.offerpsp_client_shortlist from authenticated;
grant select on public.offerpsp_client_shortlist to authenticated;
