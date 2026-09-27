-- Cover relationship audit actor foreign keys reported by the Supabase advisor.
-- These indexes keep account cleanup and staff-history lookups bounded as the
-- relationship graph grows.

create index if not exists offerpsp_entity_relationships_created_by_idx
  on private.offerpsp_entity_relationships(created_by)
  where created_by is not null;

create index if not exists offerpsp_entity_relationships_verified_by_idx
  on private.offerpsp_entity_relationships(verified_by)
  where verified_by is not null;

create index if not exists offerpsp_entity_relationships_ended_by_idx
  on private.offerpsp_entity_relationships(ended_by)
  where ended_by is not null;
