# Emergency restore: zero to production

Use the private pack for disaster recovery. Use the sanitized pack only for a clean installation or
sale. Never import production data into a buyer's environment.

## 1. Source

1. Clone from the Git bundle in `source/offerpsp-landing.bundle` or extract
   `source/offerpsp-source-head.tar.gz`.
2. Apply `source/uncommitted-working-tree.patch` only after reviewing it.
3. Install with the lockfiles and run the root validation plus the Captain's Bridge lint/build.

## 2. Supabase

1. Create a new project in the required region.
2. Apply all SQL files in `supabase/schema/local-migrations/` in filename order.
3. Compare the resulting schema with `supabase/schema/catalog.json`, `columns.json` and
   `security.json`.
4. Deploy the two Edge Functions with the captured `verify_jwt` settings.
5. For exact disaster recovery only, run `supabase/data/restore-data.sql` as an owner after taking
   a fresh empty-project snapshot. It disables triggers while loading the captured rows and must not
   be used against a populated database.
6. Recreate Auth identities, then use `auth-users-map.json` to reconnect staff, client and provider
   memberships. Google/email users must prove ownership again; passwords are not backed up.
7. Restore Storage objects from `supabase/storage/objects/`. Any item marked `blocked` in the
   Storage manifest must be recovered from the original source or a platform backup.

## 3. n8n

1. Import the 17 JSON files from `n8n/active/` with every workflow inactive.
2. Create the credential types listed in the private manifest and reconnect each node by type.
3. Configure internal webhook secrets before exposing webhook URLs.
4. Activate tool/sender workers first, then the shared AIBot, inbound lead/mail flows, schedulers,
   daily brief and global error alerts.
5. Keep `n8n/retired/` inactive. It exists only for rollback and historical inspection.

## 4. Vercel

1. Create separate public/portal and private cockpit projects.
2. Recreate only the environment variable names in `SECRETS-AND-EXTERNALS.md` with values from the
   approved secret store.
3. Deploy the public project first, then Captain's Bridge.
4. Restore deployment protection for the cockpit and verify the allowlisted owner/staff accounts.
5. Configure Vercel cron for mailbox polling if n8n polling is not the selected owner.

## 5. External channels

1. Update Supabase Auth site URL, allowed redirects and Google OAuth redirect URI.
2. Configure Telegram webhook/menu and verify text, voice, file intake and reply routing.
3. Configure Titan SMTP/IMAP and verify SPF, DKIM and DMARC before sending real outreach.
4. Point DNS only after both production deployments pass smoke tests.

## 6. Mandatory smoke tests

- Public request creates exactly one merchant/request and an automatic shortlist when eligible.
- Client receives a login link and sees only anonymized client rates.
- Staff can edit a card, set status, add a note/task and see the event timeline.
- Published offer matching respects GEO, worldwide exclusions/allowlists, method, risk and PayIn/
  PayOut separation.
- Telegram and web AIBot recall the same memory profile and perform a read-only query.
- A mutation is re-read after execution; a bulk mutation requires a valid one-time confirmation.
- Email and Telegram sends produce delivery records; portal messages reach the owner channel.
- Private source rates, margins, PSP identity and Storage files are unavailable to clients/anon.
