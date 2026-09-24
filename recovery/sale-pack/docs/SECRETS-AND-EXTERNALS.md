# Secrets and external dependencies

The pack intentionally contains **no secret values**. Restore them through native secret stores.

## Vercel environment variables

### Captain's Bridge

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `AIBOT_WEBHOOK_URL`
- `AIBOT_WEBHOOK_SECRET`
- `N8N_EMAIL_WEBHOOK_URL`
- `N8N_TELEGRAM_WEBHOOK_URL`
- `OFFERPSP_PARSER_TOKEN`
- `OFFERPSP_IMAP_HOST`
- `OFFERPSP_IMAP_PORT`
- `OFFERPSP_IMAP_USER`
- `OFFERPSP_IMAP_PASSWORD`
- `OFFERPSP_MAIL_INGEST_URL`
- `OFFERPSP_MAIL_INGEST_TOKEN`
- `OFFERPSP_MAILBOX_POLL_SECRET`
- `OFFERPSP_MAILBOX_BATCH_LIMIT`
- `CRON_SECRET`

## n8n credentials

- Supabase service role
- Telegram bot
- Titan SMTP
- Groq API
- OpenAI-compatible DeepSeek API
- SerpAPI
- Internal webhook header credentials for AIBot, offer intake, parser and mailbox polling

## External setup

- Google OAuth consent screen and Supabase Auth redirect URLs
- Telegram bot webhook and command menu
- Titan/GoDaddy mailbox, SMTP and IMAP access
- Vercel projects and cron configuration
- Public domain/DNS and transactional email DNS records

The private recovery runbook records where each value belongs, but never its value.
