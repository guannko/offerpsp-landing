-- The previous regex used a doubly escaped bracket under
-- standard_conforming_strings and did not match the literal fixture prefixes.
update public.offerpsp_email_threads
set status = 'archived', updated_at = now()
where status <> 'archived'
  and (
    subject ilike '[TEST]%'
    or subject ilike '[LIVE E2E]%'
  );
