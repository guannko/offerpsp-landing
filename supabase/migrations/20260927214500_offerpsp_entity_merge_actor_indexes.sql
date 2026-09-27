-- Cover the actor foreign keys introduced by the reversible entity merge.
create index if not exists offerpsp_organizations_merged_by_idx
  on public.offerpsp_organizations(merged_by) where merged_by is not null;

create index if not exists offerpsp_providers_merged_by_idx
  on private.offerpsp_providers(merged_by) where merged_by is not null;
