# Captain's Bridge: paper theme and source documents

Date: 2026-10-01. Status before frontend rollout: PARTIAL.

## Scope

Shared calm paper/olive tokens extend the approved organizer theme across staff
workspaces. Sidebar widths, routes, datasets and actions remain unchanged. No
SEO/GEO, subagent, Telegram-chat or Zoom business logic changes. Theme deliberately
excludes `/seo-geo` and `/agents` including nested routes.

The editor can attach an immutable DOCX/PDF to a saved working document, extract
text locally, add that text as separate blocks, and retrieve the original through
staff-authorized Storage. No external parsing service or paid editor was added.
Originals are not published to clients and no email/Telegram send is involved.

## Preservation and access

- Bucket `offerpsp-work-originals` is private; 15 MiB/object, PDF/DOCX MIME types.
- Four public RPCs check authenticated staff, use an empty search path and revoke
  anon/service execution. Private metadata has RLS and no direct client grants.
- Storage INSERT requires the uploader's pending reservation; staff SELECT is
  allowed. No UPDATE/DELETE policy: upsert/replacement is forbidden.
- Reservation locks the saved document, validates current revision and metadata,
  deduplicates by document/hash and limits a document to 20 original reservations.
- Completion checks Storage object size/MIME. Download checks binary size and
  SHA-256 before opening. The hash is computed by the staff client; this is not a
  server malware scanner or independently server-attested content hash.
- Pending uploads are explicit and resumable with the same file. There is no
  automatic pending cleanup; a stalled reservation still counts toward the limit.
- Working revisions, undo/redo and immutable text snapshots are separate from the
  binary original. Copy/TXT/JSON operations explicitly exclude binary attachments.

## Parsing limits and honest product boundary

DOCX central metadata is checked first, then every entry's actual decompression is
stream-counted (40 MiB total / 20 MiB per entry). Forged declared lengths are
rejected. Mammoth extracts plain text, not exact Word formatting, signatures,
comments or tracked changes. PDF.js uses a bundled worker, at most 100 pages,
200,000 text characters and a 30-second load/page extraction interruption.
Password-protected PDF is rejected; scans may have no extractable text and need
OCR not included here. No exact Word round-trip or DOCX/PDF working export.

## Verification before rollout

- 8 original-file regression tests pass, including actual ZIP inflation and forged
  ZIP-length rejection, idempotency, revision conflict, history and Storage/RPC ACLs.
- 17 work-document tests and 11 organizer tests pass.
- Four control-integrity suites pass (delivery evidence, QA isolation, email view).
- Lint, TypeScript/Vite build and diff check pass.
- Brave local visual fixture: light/dark registry palette and actual editor checked.
- Synthetic DOCX rendered through bundled LibreOffice and reviewed, including
  Cyrillic. Synthetic PDF rendered and reviewed. Actual parser extraction passes.
- Additive migration applied via Supabase MCP:
  local `20261001195538_offerpsp_work_document_files.sql` -> remote
  `20261001202145 offerpsp_work_document_files`.
- Live transactional reserve/dedup/object-complete/list/nonstaff-denial checks
  passed, all test writes rolled back. These use rollback-only Storage metadata,
  not binary upload. Supabase's own storage DELETE-protection trigger caused the
  first assertion to abort safely; zero test rows remained. The corrected test
  treats both RLS and trigger rejection as denial, without disabling safeguards.
- Live bucket privacy, limits, RPC search paths/grants and zero table grants checked.
- Advisors before/after: private RLS-without-policy INFO 39 -> 40; authenticated
  SECURITY DEFINER WARN 183 -> 187. Exactly the new private table and four explicit
  staff-gated RPCs account for the difference. Existing debt is not claimed fixed.
  References: [private deny-by-default RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
  [authenticated SECURITY DEFINER review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Frontend deployment/live screen checks are recorded after rollout. Browser upload
of the two synthetic originals requires the pending user confirmation. No real
contracts, contact details or rates are used for fixtures.
