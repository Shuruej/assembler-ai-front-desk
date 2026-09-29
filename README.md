# Assembler

**From business intent to working voice agents.** Building a business voice agent means manually connecting prompts, data, tools, APIs, rules and escalation paths. Assembler turns a workflow described in everyday language into an Agent Blueprint for review before creating an AssemblyAI voice agent. Built on AssemblyAI, Assembler is an independent hackathon project.

The blueprint describes identity, behavior, knowledge needs, data fields, tools, connections, rules, outcomes, and a readable workflow. Users review it before agent creation. The existing manual creation, leads, booking, confirmation, feedback, Calendar, simulated SMS, and dashboard flows remain available.

> **Independent reviewers:** start with [REVIEWER_EVIDENCE.md](REVIEWER_EVIDENCE.md). It maps claims to source/tests, reports the fresh 53/53 verification run, defines the security boundary, and separates reproducible implementation evidence from live-service evidence.

## What it does

Intent → Blueprint → tools/data/rules → voice runtime. Describe the workflow, review its structure, configure required connections, then test the agent and inspect recorded outcomes.

## Why it matters

Businesses currently need to manually configure conversational behavior and backend logic. Assembler assembles a reviewable structure from the selected starter or a general workflow form, so the operator can check data, actions and decision rules together.

## Key Features

- Six editable starter workflows and Start from scratch, assembled locally into reviewed Blueprints.
- Validated Blueprints with dynamic fields, tools, connections, rules, outcomes and workflow.
- Generic record capture, escalation, deterministic rules and approved tool dispatch.
- HTTP actions and outbound webhooks with encrypted authorization headers.
- Booking, Google Calendar, confirmation, feedback and simulated SMS flows.
- Self-service Google Sheets sync: authorize Google, connect an existing sheet or create a new one, choose a tab, and append captured records.
- Agent Studio with calls, leads, records, tool activity and blueprint configuration.
- Browser microphone testing through AssemblyAI.

## Architecture

```text
Business Intent
      ↓
Agent Blueprint
      ↓
Data + Tools + Rules + Connections
      ↓
Generic Runtime
      ↓
AssemblyAI Voice Agent
      ↓
Business Outcome
```

1. Guided creation sends the editable description and optional starter ID to `POST /api/agents/compile`. Assembler builds and validates the Blueprint locally from curated workflow configuration. This is deterministic assembly, not AI inference.
2. Creating a blueprint agent stores the blueprint and installs flat Voice Agent function tools. HTTP/webhook connections are configured separately. Calendar tools reuse the existing Google integration and internal-slots fallback.
3. `/demo` streams microphone audio through the existing AssemblyAI WebSocket flow. A blueprint `tool.call` reaches `/api/agents/tools/execute`, where the registry validates its ID and arguments, evaluates deterministic rules, and invokes an approved executor.
4. Executors can save generic records, flag human escalation, use existing availability/booking routes, or call a configured HTTP endpoint or outbound webhook. Results return through the existing `reply.done`-gated `tool.result` queue with the original AssemblyAI `call_id`.
5. Agent Studio shows fields, tool readiness, connections, rules, workflow, records, sanitized tool logs, and call outcomes.

## AssemblyAI

The existing AssemblyAI Voice Agent API creates and updates remote agents; its WebSocket voice flow carries browser microphone audio, conversation events and tool calls. Assembler supplies the business workflow layer: locally assembled Blueprints, validated contracts, records, connections, rules and outcomes. Configuration readiness is separate from a successful voice test.

## Setup

Use Node.js and the locked dependencies:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Apply the SQL files in `supabase/migrations` in order. **Blueprint creation requires `20260927120000_assembler_core.sql` first.** It adds nullable blueprint/outcome columns and generic record, connection, and log tables without replacing leads. The API refuses to mint a blueprint agent if its storage is missing.

Create `.env.local` with:

```text
ASSEMBLYAI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
CONNECTION_ENCRYPTION_KEY=...
```

`CONNECTION_ENCRYPTION_KEY` is needed when saving connection secrets, including Google Sheets refresh tokens; use a random 32-byte value encoded as 64 hex characters or base64. Google variables are used by optional Calendar and Sheets OAuth. Enable the Google Sheets API in the same Google Cloud project and register `GOOGLE_REDIRECT_URI` as an authorized OAuth redirect URI. Never commit secrets or expose service-role credentials in browser code.

## Screens / Demo

See the [demo script](HACKATHON_DEMO_SCRIPT.md), [eight-slide content](docs/PRESENTATION_CONTENT.md), and [screenshot checklist](docs/SCREENSHOT_CHECKLIST.md). The local Blueprint Review works without external connectivity. Only saved agents, tool logs and voice calls require live services.

1. Choose a starter or Start from scratch, edit the workflow description, then build and review the Blueprint. Starter structure is curated; the freeform option collects a general caller request.
2. Complete business details, create the agent, and open **Configure connections** in Agent Studio.
3. Set up any required HTTPS API/webhook endpoint. Optionally connect Google Sheets from the Connections section to mirror captured Blueprint records into a spreadsheet you control. Authorization headers and Google refresh tokens are AES-GCM encrypted at rest and are never returned by the connection API. Calendar tools can use Google or internal slots.
4. Start a browser voice test and ask for an approved action. Confirm details when prompted.
5. Return to Agent Studio for records, tool logs, and call outcome.

For a cross-business demo, use auto-repair intake with emergency escalation and ecommerce order lookup backed by a test API. The same Voice Agent creation path and generic dispatcher handle both. Record live results in [docs/ASSEMBLER_VALIDATION.md](docs/ASSEMBLER_VALIDATION.md) before claiming generality.

## Verification

```bash
npx tsc --noEmit
node --test tests/*.test.cjs
npm run build
git diff --check
```

Tests cover local Blueprint assembly, validation, flat Voice Agent tools, rules, registry failures, record validation, encryption, unsafe URLs, secret-free connection responses, and legacy voice-result ordering. External voice services are mocked.

## Known Limitations

Repository verification on 2026-09-30 passes TypeScript, 53/53 automated tests, the production build and `git diff --check`. The suite includes a regression test proving Auto Repair emergency intake is deterministically redirected to `escalate_issue`; external-provider tests still use mocks where appropriate, so they prove local contracts rather than provider uptime. A recorded Auto Repair browser run demonstrates safety escalation and post-tool voice continuation; it should not be generalized into a claim that all six workflows or every external integration were live-exercised.

- There is no account authorization or tenant isolation. **Do not expose this single-operator hackathon app as a public multi-user service.**
- The new migration must be applied to the target Supabase project; a repository file alone does not change a remote database.
- Voice quality and remote agent creation depend on AssemblyAI Voice Agent API connectivity. One recorded Auto Repair browser run reached a real tool outcome and post-tool continuation; broader live validation across all starters remains incomplete.
- External connections use a fixed HTTPS endpoint, method, JSON body or GET query from approved tool arguments, optional encrypted authorization header, an eight-second timeout, and no redirects. They are not an integration marketplace.
- The existing Google Calendar path has known timezone and concurrent-booking limitations. Internal slots cover only the seven days generated at agent creation; schedule edits do not replenish them. Confirmation-call booking remains a separate legacy flow.
- No inbound telephony, real SMS provider, or knowledge-retrieval platform is included. SMS notifications are simulated log entries.
