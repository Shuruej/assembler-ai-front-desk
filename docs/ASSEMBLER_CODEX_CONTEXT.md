# Assembler Codex Context

Baseline audited on 2026-09-23. This document is the compact starting point for the phased conversion of the existing AI Front Desk / VoiceAgent Studio hackathon app into Assembler. Read this before broad repository scans. Treat code as authoritative where this document and older README/demo copy disagree.

## Baseline

- Repository: `C:/Users/User/Documents/ChatGPT/Ai Agent`
- Branch: `master`
- HEAD before this audit: `796ee109ab7de43557a5a1fb7ad6adc4fadabb0b`
- Working tree before this audit: clean
- Stack: Next.js 16.3.4 App Router, React 19.2.8, TypeScript 5, Tailwind CSS 4, Supabase JS 2.112.4
- Package name remains `ai-front-desk`; no Assembler rename has been performed.
- No authentication or tenant/workspace boundary exists. The current product is a single-environment hackathon app.

## Verified baseline status

- `npx tsc --noEmit`: PASS, exit 0.
- `npm run build`: PASS, exit 0; all 17 static/dynamic routes built.
- There is no `test` script in `package.json`.
- Direct run `node --test tests/follow-up-preferences.test.cjs`: FAIL, exit 1; 10 of 11 tests pass. The failing test is `feedback endpoint never writes when either preference is off` because the VM route harness does not provide the newer `@/lib/sms` dependency. No production fix was attempted.
- Lint is configured as `npm run lint` but was not required or run for this audit.

## Product and execution map

### User-facing pages

- `app/page.tsx`: large client-side landing and agent-creation page. Supports Simple natural-language configuration via `/api/agents/configure` and Advanced direct form entry, then creates through `/api/agents`. It also contains static dental/booking demo content and old AI Front Desk branding.
- `app/dashboard/page.tsx`: large client-side dashboard. Lists agents, loads calls/leads/simulated SMS logs for the selected agent, computes client-side analytics/lifecycle stages, links to edit/test/confirmation, and starts Google Calendar OAuth.
- `app/demo/page.tsx`: inbound browser voice runtime. Mints a token, starts a call row, opens the AssemblyAI WebSocket, streams PCM microphone audio, displays transcripts, dispatches four hardcoded tools, and ends/persists the call.
- `app/confirm/[leadId]/page.tsx`: separate outbound-style browser confirmation runtime. Loads lead/agent context, starts a confirmation call row, builds its own prompt/tool definitions, handles `assign_booking` and optional `capture_feedback`, and persists the transcript.
- `app/agents/[id]/edit/page.tsx`: edits core agent identity, purpose, knowledge, hours, business days, and appointment duration. PUT updates AssemblyAI first and then the Supabase row.
- `app/layout.tsx` and `app/globals.css`: minimal global shell, Geist font variables, Tailwind import, old AI Front Desk metadata, and basic light/dark root colors. There is no shared component/design-system directory.

### Agent creation and configuration

- `POST /api/agents/configure` (`app/api/agents/configure/route.ts`) sends the business description to AssemblyAI LLM Gateway using hardcoded model `claude-sonnet-4-6`. It asks for a small fixed receptionist config, parses JSON, normalizes fields, and silently falls back to keyword/regex inference on network, HTTP, parsing, or schema-like failures.
- The configuration representation is local to the route/page and is not a canonical domain model. It contains fixed purpose templates and no blueprint, dynamic data schema, connections, rules, outcomes, or workflow model.
- Fallback industry inference contains hardcoded dental/clinic/salon/restaurant/gym/legal cases. Purpose inference is keyword based. Missing timezone defaults to `Asia/Karachi`.
- Generated hours are not strongly constrained by the LLM route to `HH:MM`; `/api/agents` is stricter and can reject incompatible generated values.
- `POST /api/agents` (`app/api/agents/route.ts`) validates legacy fields, creates the AssemblyAI agent, inserts the Supabase agent, and generates seven days of internal slots.
- `GET/PUT /api/agents/[id]` loads or updates an agent. PUT calls AssemblyAI before updating Supabase. It does not rebuild internal slots after hours/days/duration edits.
- `lib/assemblyai/client.ts` is the canonical current front-desk prompt/tool builder and AssemblyAI create/update client. It defines the four flat Voice Agent tools: `capture_lead`, `escalate_to_human`, `check_availability`, and `book_slot`.

### Inbound voice runtime and tool sequencing

Primary flow:

1. `/demo?agent_id=...` requests `/api/voice-token`.
2. It creates a persisted inbound call through `POST /api/calls/start`.
3. `/api/calls/start` resolves the agent by `assemblyai_agent_id`, inserts a `calls` row, and returns a runtime prompt containing current local time and the persisted business schedule.
4. The client opens `wss://agents.assemblyai.com/v1/ws`, first sends `session.update` with `agent_id`, then after `session.ready` sends a second `session.update` with the runtime prompt because AssemblyAI does not allow the agent ID and overrides together.
5. PCM audio is captured by `public/assemblyai-pcm-worklet.js`; transcripts/audio are handled in the page.
6. `tool.call` dispatch is hardcoded in `handleToolCall` to `/api/leads`, `/api/leads/escalate`, `/api/availability/check`, or `/api/availability/book`.
7. Results retain AssemblyAI's original `call_id` and are queued in `pendingToolResultsRef`.
8. `tool.result` is sent only when `reply.done` opens the result window. The queue is flushed both when the API finishes and when `reply.done` arrives, covering either ordering.
9. Duplicate tool calls are suppressed by `handledToolCallsRef`. Interrupted replies clear pending results, increment `toolTurnVersionRef`, and prevent stale async results from being injected.
10. Call end posts the accumulated transcript to `/api/calls/end`; duration is calculated server-side.

Do not casually rewrite `handleToolCall`, `flushPendingToolResults`, the `reply.done`/interruption branches, call cleanup, audio playback scheduling, or the PCM worklet. This sequencing fixed a historical post-tool silence failure and has focused test coverage.

### Confirmation voice runtime

- `/api/leads/[id]/confirmation-context` loads the lead plus related call/agent and returns a deliberately selected context, including follow-up preferences and schedule facts.
- `/api/calls/confirmation/start` checks confirmation preference and creates a `calls` row with `call_type = 'confirmation'`.
- `app/confirm/[leadId]/page.tsx` builds a separate confirmation-specific system prompt and exposes flat `assign_booking` and optionally `capture_feedback` tools.
- Its tool-result queue/interruption logic largely duplicates `/demo` and should remain stable until a later phase intentionally extracts a tested shared runtime.
- Confirmation `assign_booking` writes directly through `/api/leads/[id]/confirm`; it does not call availability/freebusy or the race-safe internal slot RPC. The prompt knows the schedule, but persistence does not enforce it.

## Persistence and database model

All migrations are under `supabase/migrations`; this audit did not inspect the remote migration history, so repository presence does not prove remote application.

- `agents`: business identity, purpose, knowledge, AssemblyAI ID, hours, timezone, follow-up flags, Google refresh token/connected flag, business days, appointment duration, creation timestamp.
- `calls`: agent FK, caller number, start/end/duration, transcript, summary, status, and `call_type` (`inbound` or `confirmation`).
- `leads`: call FK, caller/contact/request fields, notes/status/spam, booking/confirmation fields, feedback, human-escalation flags/reason, and Google event ID.
- `agent_slots`: agent/date/time availability, booked flag, optional lead FK, and unique `(agent_id, slot_date, slot_time)`.
- `sms_logs`: simulated notification records for booking confirmation, escalation alert, feedback alert, and review request.
- `book_agent_slot_for_call(...)`: PL/pgSQL RPC that locks the selected internal slot, finds/updates or inserts a lead, books the slot, and returns the lead. This is the only race-safe internal booking path.
- Follow-up preferences have both application normalization and a database trigger/constraint enforcing `feedback_enabled => confirmation_call_enabled`.
- Migrations do not enable RLS or define ownership policies. Routes use the service-role client.

## Calls, leads, escalation, booking, and notifications

- `POST /api/leads` creates a lead and applies a small hardcoded spam heuristic to name/phone values.
- `POST /api/leads/escalate` updates an existing lead for the call or creates one, sets `needs_human`, merges notes, and logs a simulated escalation SMS.
- `POST /api/availability/check` selects Google Calendar freebusy when connected; otherwise it enforces `business_days` and reads unbooked `agent_slots`.
- `POST /api/availability/book` creates a real Google event and lead for connected agents; otherwise it enforces the closed-day rule and calls the slot-booking RPC.
- `POST /api/leads/[id]/confirm` is the separate confirmation-call booking writer; it generates a booking ID and updates the lead without checking slots/calendar.
- `POST /api/leads/[id]/feedback` stores rating/notes, logs a low-rating alert for 1-2, and logs a review request for 4-5.
- `lib/sms.ts` is intentionally simulated persistence, not an SMS provider. Failures are logged and swallowed. The positive-feedback message contains a literal `[review link placeholder]`.
- `/api/agents/[id]/calls`, `/leads`, and `/sms-logs` power the dashboard.

## Google Calendar integration

- `GET /api/agents/[id]/google-calendar/connect` redirects to Google OAuth using the agent ID as `state`.
- `GET /api/agents/google-calendar/callback` exchanges the code, stores the refresh token directly on `agents`, and marks the connection active.
- `lib/google-calendar.ts` refreshes access tokens, calls FreeBusy for the primary calendar, generates candidate slots using configured duration, and creates primary-calendar events.
- Internal `business_days` closure applies only to the fallback slot path by design. Google-connected availability relies on freebusy plus configured daily hours.
- Calendar date/time conversion appends `Z` and treats submitted local-looking times as UTC; the stored agent timezone is not used in Google API conversion. This is a likely timezone defect outside UTC.
- Freebusy check and event creation are separate requests with no reservation/atomic conflict protection.

## Current working feature set

- Natural-language assisted legacy config plus editable creation form.
- Purpose-specific AssemblyAI agent creation and live update.
- Business knowledge prompt injection.
- Accurate open/closed schedule grounding in inbound and confirmation prompts.
- Browser microphone/audio voice sessions and live transcripts.
- Confirmed lead capture, human escalation, internal/Google availability, and booking.
- Follow-up preference gating, confirmation calls, booking IDs, and feedback.
- Call/lead/transcript persistence and dashboard analytics.
- Simulated notification log and dashboard panel.
- Google Calendar opt-in OAuth/freebusy/event creation with internal slots as fallback.

## Partial, fragile, or misleading areas

### Security and tenancy

- There is no login, authorization, tenant ownership, rate limiting, or CSRF protection.
- Every API route can instantiate the Supabase service-role client. Client-supplied agent/call/lead IDs are trusted after existence checks.
- `GET /api/agents` and `GET /api/agents/[id]` use `select('*')`; because Google refresh tokens live on `agents`, those endpoints can return refresh tokens to browser clients.
- Google OAuth `state` is a bare agent ID, not a session-bound anti-CSRF value. Connect/callback routes are unauthenticated.
- The public schema migrations contain no RLS policies. This is especially important if the anon client (`lib/supabase/client.ts`) becomes used; it currently appears unused.

### Consistency and lifecycle

- Agent creation can orphan an AssemblyAI agent if the subsequent Supabase insert fails.
- Agent update can diverge because AssemblyAI is updated before Supabase.
- Google booking can create an event before a failed lead write, leaving an orphan event.
- Internal slots are generated only for the next seven days at agent creation. There is no rolling replenishment job.
- Editing schedule/duration does not regenerate existing internal slots, so configured schedule and bookable slots can diverge.
- `leads.call_id` is not unique. `/api/leads` can create multiple leads, while escalation uses `maybeSingle` and booking paths often select the first lead.
- Booking IDs are random application strings without a database uniqueness constraint.
- The confirmation booking path bypasses availability enforcement and the internal booking RPC.

### Architecture and maintainability

- `app/page.tsx`, `app/dashboard/page.tsx`, `app/demo/page.tsx`, and `app/confirm/[leadId]/page.tsx` are large client components with local domain types and UI helpers.
- Inbound and confirmation pages duplicate audio capture/playback, inactivity, transcript, cleanup, and tool-result sequencing logic.
- Business-day parsing, defaults, input normalization, booking-ID creation, note merging, and local API types are duplicated across routes/pages.
- Tool definitions and dispatch are hardcoded rather than registry-driven. No generic blueprint, data schema, record layer, connection abstraction, rule engine, tool log, or call outcome exists yet.
- Agent configuration uses a hardcoded model and permissive normalization rather than a versioned, runtime-validated schema.
- README and demo script are stale: they claim Calendar and human handoff are future work even though both are implemented.
- UI styling is inconsistent: landing/edit use a mauve custom palette, dashboard/demo/confirmation use zinc, and there is no shared shell or primitive library.
- Static successful-workflow content on the landing page is demo-only and contains dental/booking assumptions.

## Tests and coverage

- Only `tests/follow-up-preferences.test.cjs` exists. It transpiles TS/TSX into VM contexts and mocks route dependencies manually.
- Covered: follow-up normalization, create persistence of preferences, runtime follow-up prompt text, confirmation gating, feedback gating intent, confirmation prompt branching, disabled feedback handler, disabled startup, conditional confirmation tools, inbound tool-result ordering/deduplication, and dashboard lifecycle states.
- Current failure: the feedback route test harness predates the `@/lib/sms` import.
- No automated coverage for agent compiler parsing, AssemblyAI create/update calls, escalation persistence, availability routes, slot RPC integration, Google OAuth/token/freebusy/event paths, SMS logging, call end persistence, schedule formatting, edit synchronization, or UI end-to-end flows.
- No browser/voice E2E tests and no database integration tests exist.

## Files that should not be casually refactored

- `app/demo/page.tsx`: proven AssemblyAI protocol, pending-result ordering, interruption handling, audio lifecycle.
- `app/confirm/[leadId]/page.tsx`: parallel confirmation runtime and conditional tool flow.
- `lib/assemblyai/client.ts`: current flat Voice Agent tool schema and prompt compatibility.
- `app/api/availability/book/route.ts` plus `20260906140000_create_agent_slots.sql`: split Google/internal booking behavior and race-safe internal RPC.
- `lib/google-calendar.ts` and OAuth routes: working integration with known security/timezone debt.
- Existing migrations: append only; do not rewrite applied history.
- `lib/follow-up-preferences.ts` and its DB trigger contract.

## Minimal change points for the Assembler conversion

- Product shell/brand: `app/layout.tsx`, `app/globals.css`, and the visible page shells only.
- Creation UX: preserve `/api/agents` for legacy agent creation while later introducing a single canonical blueprint compiler beside `/api/agents/configure` rather than adding another ad hoc config shape.
- Voice runtime: preserve the current event state machine; later place only tool lookup/execution behind a registry-compatible adapter.
- Persistence: add nullable/backwards-compatible blueprint and generic-record structures; do not migrate or delete leads during the initial vertical slices.
- Calendar: wrap `lib/google-calendar.ts` and existing availability routes rather than rebuilding OAuth/freebusy/event creation.
- Dashboard: evolve the selected-agent workspace into Studio sections while keeping calls, leads, notifications, calendar, edit, and test links functional.

## Exact existing files recommended for Phase 1 (brand + product shell)

- `app/layout.tsx`
- `app/globals.css`
- `app/page.tsx`
- `app/dashboard/page.tsx`
- `app/demo/page.tsx`
- `app/confirm/[leadId]/page.tsx`
- `app/agents/[id]/edit/page.tsx`

Phase 1 may add a small shared shell/primitives module under `app/components/` or `components/` if it removes repeated visible chrome. It should not touch `lib/assemblyai/client.ts`, the PCM worklet, API routes, Supabase helpers, migrations, or voice event/tool sequencing.

## Highest risks for upcoming phases

1. Regressing the `tool.call` → queued result → `reply.done` sequencing and restoring the post-tool silence bug.
2. Creating a second agent/config/tool representation instead of one canonical `AgentBlueprint` with a legacy adapter.
3. Treating the service-role, unauthenticated hackathon API as production-safe or exposing stored connection secrets through broad `select('*')` responses.
4. Rebuilding working Google Calendar and booking paths rather than adapting them.
5. Breaking legacy lead/booking behavior while adding generic records and tools.
6. Letting generated blueprints define executable code, arbitrary tool kinds, or unvalidated rules.
7. Expanding UI navigation with dead sections before their real vertical slices exist.
8. Allowing large visual refactors to mix with high-risk runtime changes.

## Phase boundary reminder

Prompt 0 creates only this audit document. Do not begin the Assembler visual shell, blueprint compiler, generic records, tool registry, connections, rules, or Studio runtime work until the corresponding phase is explicitly requested.
