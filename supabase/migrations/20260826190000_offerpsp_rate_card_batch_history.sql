-- A source can be intentionally reprocessed into later batch versions.
-- Clean projects inherited an inline uniqueness constraint from the original
-- table definition even though the v5 lifecycle only dropped its later name.
alter table private.offerpsp_rate_card_batches
  drop constraint if exists offerpsp_rate_card_batches_provider_id_source_hash_parser_v_key;

alter table private.offerpsp_rate_card_batches
  drop constraint if exists offerpsp_rate_card_batches_provider_source_parser_key;

create index if not exists offerpsp_rate_card_batches_source_hash_idx
  on private.offerpsp_rate_card_batches(provider_id, source_hash, received_at desc);

comment on table private.offerpsp_rate_card_batches is
  'Versioned PSP source imports; the same source hash may be reprocessed by later parser or lifecycle runs.';
