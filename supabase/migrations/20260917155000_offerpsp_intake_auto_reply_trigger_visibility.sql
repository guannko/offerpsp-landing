-- A STABLE SQL function uses the calling statement's snapshot. The AFTER UPDATE
-- trigger must see the just-completed compliance row, so this read is VOLATILE.
-- The function remains private, SECURITY DEFINER and revoked from API roles.
alter function private.offerpsp_intake_auto_reply_source_hash(uuid) volatile;
