-- Restore the prior one-minute n8n worker graph as part of this rollback.
-- Retain delivery evidence and Vault secret for diagnosis; never remove merchant data.
begin;
update private.offerpsp_screening_dispatch_config set enabled=false, updated_at=now() where singleton;
alter table private.offerpsp_compliance_cases disable trigger offerpsp_screening_ready;
commit;
