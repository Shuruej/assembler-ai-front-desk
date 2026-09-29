# Reviewer Evidence — Assembler

This file is the shortest path for an independent hackathon reviewer. It separates reproducible repository evidence from live-service evidence so no claim depends on hidden credentials.

## Reproduce locally

```bash
npm ci
npx tsc --noEmit
node --test tests/*.test.cjs
npm run build
git diff --check
```

Fresh verification on 2026-09-30: TypeScript PASS; 53/53 automated tests PASS; production build PASS; diff check PASS. The suite now includes a regression test proving Auto Repair emergency intake is deterministically redirected from the ordinary record action to `escalate_issue`, with outcome `escalated`.

## What the repository directly proves

- Six starter workflows compile through the same local Blueprint assembly path; the automated suite validates every starter and verifies distinct Auto Repair, Ecommerce and Real Estate Blueprints without a network request.
- Blueprints are validated contracts covering data fields, tools, connections, rules, outcomes and workflow.
- The generic tool registry validates tool IDs/arguments, executes approved internal actions, contains executor failures, persists approved outcomes and sanitizes logs.
- Deterministic rule operators, generic record validation, encrypted connection secrets, HTTPS/private-network protections and secret-free connection projections are covered by automated tests.
- AssemblyAI agent creation uses flat function tools derived from the Blueprint; voice-token and preview routes keep the AssemblyAI API key server-side.
- 16 supported voice choices are catalogued and tested, including legacy defaults.
- Google Sheets parsing/configuration and first-row header creation are tested. Calendar and Sheets server routes are present in source.

## Live evidence vs repository evidence

The repository proves implementation and mocked/local contracts. It does not claim that a third-party integration is live merely because code exists. Live Calendar, Sheets, Supabase and AssemblyAI behavior requires deployed credentials and provider availability.

A recorded browser run used Auto Repair safety escalation: a brake-risk request triggered `escalate_issue`, returned outcome `escalated`, and the agent continued speaking after the tool result. Treat this as recorded demo evidence, not proof that every starter has been live-exercised.

A second deployed evidence run on 2026-09-30 used a fresh Harbor Table Restaurant appointment agent with Europe/London, confirmation calls and feedback enabled. Its configured shared Google Calendar returned live availability for 2026-10-01; booking the returned 11:00 slot persisted a confirmed lead, created a Google Calendar event, and returned google_sheets_sync: synced. The booking-confirmation SMS path also produced an SMS log. SMS delivery remains simulated unless Twilio production credentials are configured.

## Architecture map

`Business Intent → Agent Blueprint → Data/Tools/Rules/Connections → Generic Runtime → AssemblyAI Voice Agent → Business Outcome`

Start at:
- `lib/assembler/blueprint.ts` — Blueprint contract and validation.
- `lib/assembler/compiler.ts` — deterministic local assembly.
- `lib/assembler/registry.ts` and `lib/assembler/rules.ts` — runtime dispatch and rules.
- `app/api/agents/tools/execute/route.ts` — server tool execution boundary.
- `lib/assemblyai/client.ts`, `token.ts`, `voices.ts` — AssemblyAI integration.
- `lib/google-calendar.ts`, `lib/google-sheets.ts` — external integrations.
- `supabase/migrations/` — persistence schema.
- `tests/` — reproducible verification.

## Security boundary

Secrets are environment-only. `.env*`, Vercel metadata, PEM files, build output and local provider state are ignored. Public code must never contain AssemblyAI keys, Supabase service-role keys, Google service-account/private keys, OAuth client secrets, reviewer secrets or database passwords.

The public Supabase URL and anon key are intentionally browser-safe identifiers; privileged database access uses the server-only service-role variable.

## Honest limitations

- This is a hackathon/single-operator build, not a hardened multi-tenant SaaS.
- Automated tests mock external providers; they validate contracts, not provider uptime.
- Auto Repair has recorded live voice evidence; the separate Harbor Table run proves a second deployed business workflow at the server/integration layer, not a second recorded voice conversation. Do not infer six live voice demonstrations.
- Google Calendar booking has documented timezone/concurrency limitations in the current implementation.
- SMS has a Twilio-capable outbound provider path but the current deployed evidence run used simulated/log mode because production Twilio credentials are not configured; inbound PSTN telephony is not included.
- Demo video is intentionally outside this evidence package.

## Reviewer rule

Score a claim as VERIFIED only when you can reproduce it from source/tests or observe it live. Score code-present but externally unexercised integrations as implementation evidence, not live proof. This standard should be applied equally to Assembler and competing submissions.
