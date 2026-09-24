# OfferPSP Auth email templates

Production source of truth for Supabase Auth email branding.

## Magic link or OTP

- Sender name: `OfferPSP`
- Sender email: `bizdev@offerpsp.com`
- Subject: `magic-link-or-otp.subject.txt`
- Body: `magic-link-or-otp.html`
- Link variable: `{{ .ConfirmationURL }}`

The same template serves the merchant and PSP portals. Supabase keeps the requested `emailRedirectTo`, so a merchant returns to `/portal/` and a PSP member returns to `/psp/`.

SMTP credentials must remain in Supabase encrypted configuration and must never be committed here.
