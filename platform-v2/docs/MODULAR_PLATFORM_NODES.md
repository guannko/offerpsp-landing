# OfferPSP modular platform nodes

Updated: 2026-08-14

## Non-negotiable boundary

Supabase remains the source of truth for merchants, PSPs, casinos, agents, routes,
commercial values, tasks, audit history and operational AIBot memory. External nodes never own
OfferPSP business state and can be rebuilt or disabled without losing the platform.

Every node supports one of three modes:

- `off`: no external request is made;
- `shadow`: the node calculates or extracts, but cannot replace an authoritative decision;
- `active`: the audited node can serve its defined function.

## First package

### Docling — document extraction

Purpose: convert PDF, Word, Excel, PowerPoint, email and image files into normalized text and
structured JSON before the existing OfferPSP parser creates atomic route drafts.

- Existing PDF path: `POST /api/extract-offer-pdf`.
- Universal path: `POST /api/extract-document`.
- Authentication: server-to-server `X-OfferPSP-Parser-Token` or the current authenticated
  Captain's Bridge staff session. The Docling API key remains server-only.
- Safety: extraction never publishes an offer. Existing parser, anomaly checks and manual review
  remain mandatory.
- Runtime: the CPU deployment image is pinned to
  `quay.io/docling-project/docling-serve-cpu:v1.28.0`.
- Browser upload boundary: complex documents up to 3 MB can be sent through the protected Vercel
  endpoint. Larger PDF, DOCX, XLSX and images retain the existing local fallback; moving larger
  opaque Office/email files through a private Storage reference is a later hardening step.

### GoRules — explainable decision rules

Purpose: move deterministic eligibility policies out of UI code. The first JDM policy checks
merchant and route risk categories.

- Policy: `rules/merchant-route-risk-v1.jdm.json`.
- Staff-only evaluation: `POST /api/evaluate-rules` (routed through the shared platform modules function).
- Current authority: shadow only.
- The existing Supabase matching and confidentiality rules remain authoritative until rule-by-rule
  parity tests pass on production snapshots.

### PostHog — product analytics

Purpose: measure how staff use Captain's Bridge without capturing secrets, offer text or contact
data.

Current events:

- `control_bridge_page_viewed` with path;
- `control_bridge_search_used` with source and result count.

Autocapture, session recording, page text and element attributes are disabled. Supabase SEO/GEO
analytics and PostHog answer different questions and remain separate datasets.

### Mem0 plus operational memory

Purpose: semantic recall without weakening the existing operational notebook.

- Operational truth: Supabase `BIXOFFPSP` Memory, Journal, Conversation Archive and Contact Timeline.
- Semantic recall: Mem0 under profile `BIXOFFPSP`.
- Combined staff endpoint: `POST /api/hybrid-memory-search`.
- Mem0 accepts only verified facts from an allowlisted category and rejects likely secrets.
- In `shadow`, proposed memories are returned for inspection but are not stored.

Conflicts are never auto-resolved in Mem0's favour. The dated Supabase record wins and the agent
must ask Boris when the conflict cannot be resolved from evidence.

### Meilisearch — unified staff search

Purpose: fast search before the working set grows to thousands of entities.

- Source: read-only snapshots from Supabase.
- Indexed objects: merchants, operational and research PSPs, casinos, agents and atomic routes.
- Deduplication: a research PSP linked by legacy ID, normalized name or domain is excluded when an
  operational PSP already exists.
- Endpoints: `POST /api/search-index-sync`, `GET /api/unified-search`.
- A full refresh builds a staging index and atomically swaps it into place. Removed and hidden
  records therefore cannot survive as stale search results, and the current index remains available
  while the replacement is being built.
- UI: the existing Captain's Bridge search uses Meilisearch when available and falls back to the
  current in-memory search when it is not.
- Recovery: delete and rebuild the index from Supabase; it contains no unique business state.

## Environment

Use `platform-v2/.env.example` as the complete variable list. Server secrets must never use a
`VITE_` prefix. Docling and Meilisearch can run from `infra/modules/compose.yaml` on a private host;
their ports are bound to localhost by default and require an authenticated reverse proxy for remote
access.

Docling and Meilisearch process confidential OfferPSP material and must remain on BIX-controlled
private infrastructure. Do not enable hosted Mem0 writes for contact, commercial or provider data
without a separate privacy review and Boris's approval. `shadow` is the default for semantic memory.

## Delivery state

| Node | Local code | Production service | Connected to working flow |
|---|---|---|---|
| Docling | verified | not deployed | protected universal intake and native fallback ready |
| GoRules | verified | bundled with API | staff-only shadow evaluation ready; matching unchanged |
| PostHog | verified build | not configured | page/search allowlist ready, sends nothing without env |
| Mem0 | verified adapter | not configured | hybrid staff endpoint ready; AIBot recall not switched |
| Meilisearch | verified | Northflank, private | production index and cockpit search active |

The exact local production build is verified. Meilisearch is deployed privately on Northflank and
connected to the cockpit. The remaining external modules are not implied active until their own
production health and behaviour are verified.

This package is deliberately fail-open for the existing UI and fail-closed for external writes:
turning every new variable off leaves the current production system unchanged.

## Rollout order

1. Keep the verified Meilisearch production index and fallback search under monitoring.
2. Do not provision permanent Docling capacity until the document volume justifies its minimum
   practical CPU/RAM cost. Prefer an on-demand job with asynchronous queue/storage when required.
3. Run real document fixtures through native extraction now; compare them with Docling before
   selecting `shadow` or `active` for the external extractor.
4. Configure a PostHog EU project and verify that only the two allowlisted event types arrive.
5. Compare GoRules decisions with existing matching on low-risk, high-risk and unknown cases.
6. Compare operational and semantic memory results without enabling Mem0 writes.
7. Activate one node at a time. Roll back by changing its mode to `off`; no Supabase data rollback
   is required.

## Verification commands

- `npm run test:modules`
- `npm run test:pdf-extractor -- <fixture.pdf>`
- `npm run test:offer-parser`
- `npm run build`
- `npm run lint`

## Phase two

Chatwoot remains deliberately outside the first package. It becomes useful after the current email,
Telegram and portal communication flows are normalized into one conversation model. Adding it now
would create a second source of truth for conversations.

## Licences reviewed

- Docling: MIT.
- GoRules Zen Engine: MIT.
- Mem0: Apache-2.0.
- Meilisearch core: MIT; enterprise features use a separate licence.
- PostHog open-source core: MIT; the repository also contains separately licensed enterprise code.

Before redistribution or resale, pin container versions and run a fresh licence scan of the exact
artifacts included in the package.
