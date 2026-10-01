# Captain's Bridge course organizer

Status: local implementation, not deployed. Date: 2026-10-01.

## Product contract

The homepage is organized around the captain's course, ordered business directions,
expected outcomes and explicitly linked merchant cases / existing tasks. Existing modules
remain in their original navigation positions. The calm paper / olive theme is scoped to
the homepage, not a global redesign of SEO/GEO or the other workspaces.

The right context panel is collapsed initially. It follows the selected direction and
shows linked cases, mail threads and task assignees. Conditions/documents currently link
to the canonical PSP/offer workspaces; this first version does **not** claim to automatically
extract a confirmed price or a commercial decision from a partner conversation.

Direction order affects the organizer's cross-direction task plan. Pausing a direction
excludes it from that plan but **does not cancel tasks, pause a merchant or control n8n**.
The organizer does not send messages, approve compliance, disclose providers, publish
offers or execute autonomous business goals.

Completed tasks and a merchant `won` status are separate evidence. Neither is proof of
processing volume or a commission payment. Unknown stages are not guessed. Initial
RU/CIS, USA and Intake directions are unsaved suggestions with no implicit entity links.

## Data and access

- `CoursePage.tsx`: existing staff gate and core data, `get_offerpsp_operations_workspace`,
  `get_offerpsp_mail_center` (read only, up to 250 threads), new course read/save RPCs.
- `CourseOrganizer.tsx`: actual React interface and receipt-based state updates.
- `coursePlan.ts`: direction projection, priority ordering and validation.
- `courseVisibility.ts`: QA/E2E, inactive-case, task and mail visibility boundaries.
- `20261001165903_offerpsp_course_organizer.sql`: one shared private planning record and
  append-only revision snapshots. RLS enabled, no direct client/service table privileges.
  Staff-only RPCs require `auth.uid()` and the existing `is_offerpsp_staff()` check, use an
  empty search path and explicitly revoke anonymous/public/service execution.
- Every save requires the expected revision. An advisory transaction lock covers first
  creation and row locking covers updates. Stale writes return a conflict, not an overwrite.
- No privileged keys, auth bypass, localStorage persistence or production demo fixtures.
- Planner changes do not rewrite canonical tasks, clients, rates, statuses or workflows.

Tasks are limited by the existing 500-row workspace RPC. Mail shows only the loaded
250-thread selection; missing data is not presented as proof of an empty queue.
Unavailable links can be removed from the plan without changing the underlying record.

The homepage's exact task links are supported by `OperationsWorkspace?task=...`.
Exact thread links are supported by `CommunicationsWorkspace?thread=...`; if the thread
is unavailable or still loading, another thread is not silently substituted.

## Working-document constructor

The organizer toolbar opens `Новый документ` as a full-page template gallery in the
same large workspace. It offers a blank sheet, note, PSP proposal, contract outline,
conversation summary and solution comparison. The gallery, editor and saved-document
library are separate screens. Opening the gallery/library preserves the current draft;
selecting another template/document still requires explicit confirmation if it is dirty.

Every new sheet has the same unrestricted document model: a template supplies editable
blocks, not a persistent type or workflow. A started blank sheet can append a template
without erasing its text, source, links or identity. Template insertion is undoable and
rejects overflow atomically. Contract headings are a structure, not invented legal or
commercial terms or a signed agreement. No live rates, counterparties or commissions
are inserted into any template.

- `WorkDocumentDesk.tsx`: text, headings, lists, checklists, tables, callouts and material
  links; reorder/duplicate/remove blocks, undo/redo (20 local edits), preview and manual save.
- `workDocuments.ts`: typed blocks, validation, independent copies and validated JSON
  backup recovery. Restoring a backup never reuses a saved document's identity.
- `documentTemplates.ts` / `DocumentTemplateGallery.tsx`: six starting structures, fresh
  block identities, immutable append helper and paper-style template previews. There is
  no document-type selector or new schema requirement; legacy kinds remain readable.
- `workDocumentRepository.ts`: existing staff session, list/get/save RPCs, explicit
  save receipts and expected-revision conflicts. No privileged key or localStorage cache.
- `20261001174709_offerpsp_workspace_documents.sql`: private staff documents and atomic
  append-only versions. RLS is enabled, direct client/service access revoked. The three
  RPCs require a user and the existing staff guard; the private validator has no client
  execute grant. Every write validates shape, bounds, safe link schemes and real
  client/PSP/course references. Initial directions use string IDs such as `cis`, not UUIDs.
- The library paginates 50 summaries at a time; it does not fetch all contract bodies.
  The context shows the last 100 version headers. Historical versions remain view-only;
  working copies preserve the original saved document.
- A source can be attached as text/TXT and/or an external reference. Once saved, its
  captured text/label/URL is immutable. Working blocks are independent. This does **not**
  store original Word/PDF bytes or lock a file at an external URL.
- Optional client, PSP and direction associations do not publish the document to a
  merchant cabinet, overwrite the entity-file registry or dispatch operational tasks.
  In-document checklist ticks do not execute the bot or change the Operations queue.
- Loss warnings for the editor Back button, selecting another document and internal
  link clicks use an accessible in-app confirmation. Browser reload/close receives a
  `beforeunload` warning. Full SPA browser-back blocking is not implemented.
- TXT/JSON export shows inspectable text and a visible download link. JSON includes the
  source snapshot and internal terms; it is not a client-safe projection. Word/PDF editing,
  binary attachment uploads, signature, autonomous sends and PDF/DOCX export are excluded.

`test:work-documents` passes 17 tests, including the actual SQL in isolated PGlite and
pure model/backup/template tests. This is not production or multi-process concurrency evidence.
Browser checks on synthetic records confirmed construction, undo/redo, save/reopen,
historical read-only views, source sealing, draft preservation on conflict, disabled
save on storage failure, in-app loss warning and visible JSON export content. The 320px
iframe fixture has document/body scroll width 320, including table and context; both
light and dark themes were visually inspected. An automated Blob-download capture timed
out, so filesystem delivery of exported files and browser file-chooser TXT/JSON import
are not claimed as verified. Copyable export text and backup parser are verified.

The revised gallery flow was checked in the actual component on synthetic records:
blank sheet → custom introduction → PSP proposal insertion → undo/redo → manual save
→ separate library → reopen, with the original text intact. Opening the gallery does
not discard an unsaved draft; cancelling template replacement and continuing the sheet
preserves edits. The gallery was visually checked in light/dark themes and at 320px
inside the dev fixture (HTML/body scroll width 320, no horizontal page overflow).

## Verification commands

```sh
npm --prefix platform-v2 run test:course-organizer
npm --prefix platform-v2 run test:work-documents
npm --prefix platform-v2 run test:control-integrity
npm --prefix platform-v2 run lint
npm --prefix platform-v2 run build
git diff --check
```

The course suite executes the actual migration in isolated PGlite, including permissions,
authorization failures, version conflicts, malformed payload rejection and no task/client
mutation. It also tests projection/ordering, stage honesty, QA visibility and route guards.
PGlite does not prove multi-process production concurrency; the lock strategy must receive
an integration smoke after an authorized release.

The dev-only fixture is `platform-v2/scripts/ui-fixtures/course-organizer.html`.
It uses the actual component, explicitly synthetic records and an in-memory save adapter,
not a production session. It is not a Vite production entry point or an auth-gate bypass.

## Release boundary

Both organizer and working-document migrations are prepared locally only. They must be
applied before the new homepage release;
otherwise the UI shows the error and disables planning writes. The migration is additive
and does not backfill or mutate operational data. Commit the exact release from a clean
tree without accidentally including unrelated existing edits, then deploy and verify
staff access, read/save/read-back, two-tab conflict and exact object navigation on live
records. Include document/source/version/backup checks and confirm downloads with the
normal staff browser. No external sends are needed for this smoke.

Rollback frontend: restore the previous root page import. The additive planning tables
can remain for recovery; do not delete planning history as part of a UI rollback.
