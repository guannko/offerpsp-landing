# Architecture

## Product surfaces

- **Public landing and intake** — receives payment requests and creates a merchant workspace.
- **Merchant portal** — shows anonymized offers, shortlist versions, messages, documents and deal
  progress without exposing the underlying PSP until a controlled introduction.
- **Captain's Bridge** — staff cockpit for merchants, casinos, PSPs, offers, matching, compliance,
  communications, tasks, analytics and integrations.
- **Telegram AIBot** — mobile command surface for the same operating core used by Captain's Bridge.

## Runtime topology

```text
Public site / Client portal / Captain's Bridge
                    |
              Supabase Auth
                    |
        Postgres + RPC + RLS + Storage
                    |
             Supabase Edge Functions
                    |
                  n8n
    +---------------+----------------+
 Telegram       Titan SMTP/IMAP    AI/Search providers
```

## Core guarantees

- PSP identity, source rates, margins and private source files remain staff-only.
- The client receives a frozen anonymized snapshot, not a live pointer to private provider data.
- PayIn and PayOut remain distinct commercial terms even when received in one source message.
- Offer imports are draft-first and provider-independent.
- Replacement is route-level and staff-confirmed; a new India route does not replace unrelated
  India or worldwide routes.
- Worldwide coverage supports explicit allowlists and exclusions, including card-brand-specific
  rules.
- Staff margin is versioned and separated from the PSP source rate.
- Bulk mutations use a server-issued, session-bound, one-time confirmation token.
- Telegram and web AIBot share the `BIXOFFPSP` memory, contact timeline and execution journal.
- External sends are guarded by recipient resolution, history and business-day cooldown checks.

## Source of truth

1. SQL migrations define the database contract and RLS.
2. Supabase RPCs expose the allowed business operations.
3. n8n workflows orchestrate external channels and agent tools.
4. React/TypeScript and static portal clients render the staff and client surfaces.
