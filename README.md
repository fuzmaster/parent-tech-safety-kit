# Parent Tech Safety Kit

A Vite + React + TypeScript + Tailwind + Supabase MVP that lets adult children create a zero-login, senior-friendly help page for an older parent.

## MVP features

- Helper signup/login with Supabase Auth.
- Parent profiles with private PWA-style URLs.
- Public parent page with huge buttons for broken tech, scam concern, or login trouble.
- Supabase Edge Functions for all public parent-page actions.
- Dashboard with help requests, browser diagnostic payloads, and last-seen heartbeat.
- Helper contacts with call, text, and email links.
- Printable Family Tech Binder.
- Client-side AES-GCM encrypted private binder items. The family secret phrase is never sent to Supabase.
- PWA manifest and offline fallback page.

## Local setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY`.
2. Apply `supabase/migrations/20260515000000_parent_tech_safety_kit.sql` to your Supabase project.
3. Deploy the Edge Functions in `supabase/functions`.
4. Run `npm install` and `npm run dev`.

## Security model

Public parent actions never insert directly into private tables from the browser. They call Edge Functions, which look up the parent by private slug and use the service role on the server. Row Level Security is enabled on all app tables; authenticated helpers can only access rows for their own parent profiles.

Private binder values are encrypted in the browser using PBKDF2-SHA-256 and AES-GCM-256. Supabase stores labels, ciphertext, IV, salt, algorithm, KDF, and iteration metadata only.

## Notifications

The MVP starts with email-only notification plumbing. The migration emits a `pg_notify('help_request_created', ...)` event after each help request insert, which can be connected to a Supabase Database Webhook or email provider. Twilio, native apps, remote desktop, AI chat, calendar sync, medication tracking, and payment processing are intentionally out of scope for this version.
