# Assembler

**Describe the workflow. Assemble the agent.** Assembler turns a business description into a validated voice-agent blueprint, then uses AssemblyAI's Voice Agent API to create and test an agent in the browser. It is a single-environment hackathon app, not an industry template marketplace.

The blueprint describes identity, behavior, knowledge needs, data fields, tools, connections, rules, outcomes, and a readable workflow. Users review it before agent creation. The existing manual creation, leads, booking, confirmation, feedback, Calendar, simulated SMS, and dashboard flows remain available.

## Architecture

1. Guided creation sends intent to `POST /api/agents/compile`. AssemblyAI LLM Gateway returns strict structured JSON; Assembler validates it before showing Blueprint Review.
2. Creating a blueprint agent stores the blueprint and installs flat Voice Agent function tools. HTTP/webhook connections are configured separately. Calendar tools reuse the existing Google integration and internal-slots fallback.
3. `/demo` streams microphone audio through the existing AssemblyAI WebSocket flow. A blueprint `tool.call` reaches `/api/agents/tools/execute`, where the registry validates its ID and arguments, evaluates deterministic rules, and invokes an approved executor.
4. Executors can save generic records, flag human escalation, use existing availability/booking routes, or call a configured HTTP endpoint or outbound webhook. Results return through the existing `reply.done`-gated `tool.result` queue with the original AssemblyAI `call_id`.
5. Agent Studio shows fields, tool readiness, connections, rules, workflow, records, sanitized tool logs, and call outcomes.

## Setup

Use Node.js and the locked dependencies:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Apply the SQL files in `supabase/migrations` in order. **Blueprint creation requires `20260927120000_assembler_core.sql` first.** It adds nullable blueprint/outcome columns and generic record, connection, and log tables without replacing leads. The API refuses to mint a blueprint agent if its storage is missing.

Create `.env.local` with:

```text
ASSEMBLYAI_API_KEY=...
ASSEMBLER_COMPILER_MODEL=openai/gpt-5-nano
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
CONNECTION_ENCRYPTION_KEY=...
```

`ASSEMBLER_COMPILER_MODEL` is optional and defaults to `openai/gpt-5-nano`. `CONNECTION_ENCRYPTION_KEY` is needed when saving a connection authorization header; use a random 32-byte value encoded as 64 hex characters or base64. Google variables are needed for optional Calendar OAuth. Never commit secrets or expose service-role credentials in browser code.

## Demo path

1. Describe a workflow on the home page; review the Blueprint and regenerate if its proposed data or actions are wrong.
2. Complete business details, create the agent, and open **Configure connections** in Agent Studio.
3. Set up any required HTTPS API/webhook endpoint. Authorization headers are AES-GCM encrypted at rest and not returned by the connection API. Calendar tools can use Google or internal slots.
4. Start a browser voice test and ask for an approved action. Confirm details when prompted.
5. Return to Agent Studio for records, tool logs, and call outcome.

For a cross-business demo, use auto-repair intake with emergency escalation and ecommerce order lookup backed by a test API. The same compiler and dispatcher handle both. Record live results in [docs/ASSEMBLER_VALIDATION.md](docs/ASSEMBLER_VALIDATION.md) before claiming generality.

## Verification

```bash
npx tsc --noEmit
node --test tests/*.test.cjs
npm run build
git diff --check
```

Tests mock paid model calls and external services. They cover blueprint validation, compiler errors, flat Voice Agent tools, rules, registry failures, record validation, encryption, unsafe URLs, secret-free connection responses, and legacy voice-result ordering.

## Known limitations

- There is no account authorization or tenant isolation. **Do not expose this single-operator hackathon app as a public multi-user service.**
- The new migration must be applied to the target Supabase project; a repository file alone does not change a remote database.
- Live compiler and voice quality depend on AssemblyAI connectivity. Eight-business generality validation remains incomplete; see the validation record.
- External connections use a fixed HTTPS endpoint, method, JSON body or GET query from approved tool arguments, optional encrypted authorization header, an eight-second timeout, and no redirects. They are not an integration marketplace.
- The existing Google Calendar path has known timezone and concurrent-booking limitations. Internal slots cover only the seven days generated at agent creation; schedule edits do not replenish them. Confirmation-call booking remains a separate legacy flow.
- No inbound telephony, real SMS provider, or knowledge-retrieval platform is included. SMS notifications are simulated log entries.
