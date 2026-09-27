# Assembler cross-business validation

> Historical record from the former Gateway-based compiler. Guided Blueprint assembly now runs locally and does not call the LLM Gateway. The live-service results below remain a record of that earlier attempt; see the current README for the active flow.

Recorded 2026-09-27. **No live blueprint or voice session was successfully produced during this run.** The AssemblyAI LLM Gateway and Voice Agent token endpoints both timed out while establishing HTTPS connections. The configured Supabase project hostname did not resolve, and this workspace has no Supabase CLI, project link, `psql`, or signed-in SQL editor session. The additive `20260927120000_assembler_core.sql` migration was **not applied**. Automated tests use mocked external services; they do not establish live business generality.

## Verification evidence

- Environment: AssemblyAI API key, Supabase URL/service-role key, and Google OAuth variables are present. The compiler model override is absent, so the configured default is `openai/gpt-5-nano`. A new 32-byte `CONNECTION_ENCRYPTION_KEY` was generated in ignored `.env.local` for future local connection testing; no value was printed or committed.
- Gateway diagnosis: DNS resolved `llm-gateway.assemblyai.com`, but a minimal non-streaming request (100-byte JSON payload, 12-second abort) failed with `UND_ERR_CONNECT_TIMEOUT`, before an HTTP status. The application compiler uses a 60-second timeout; its structured-output request is about 6.4 KB, including a 3.7 KB JSON schema. Model support, authentication, credit limits, and strict-schema compatibility cannot be diagnosed until HTTPS connects. The separate Voice Agent token endpoint failed with the same connection timeout.
- Supabase diagnosis: the configured project hostname returned a DNS name-does-not-exist error. No database migration, create/read, call outcome, tool log, connection-state, or existing-agent regression could be verified against the target project. The migration was inspected: it adds two nullable columns and three new tables with indexes/RLS/grants, and contains no drop or destructive data rewrite.
- Local generic executor: a real loopback HTTP server accepted GET lookup and POST webhook requests through `executeOutbound`. HTTP 400, an 8-second timeout, and an unsafe `file:` URL were rejected as expected. This does **not** prove persisted connections or browser voice invocation.
- UI smoke: `/` rendered; Guided and Manual switching worked. A Guided Auto Repair request showed the controlled gateway-unreachable error. `/dashboard` rendered its empty state, then displayed `TypeError: fetch failed` from the unavailable Supabase host. Blueprint Review, populated Agent Studio sections, and `/demo` with an actual agent could not be exercised.
- Security smoke: agent and connection browser APIs use explicit non-secret projections; tool logs retain approved argument names, not values. None of the AssemblyAI API key, Supabase service-role key, or Google client secret values appeared in 29 built static files. `.env.local` is ignored and no `.env*` file is tracked. This is a targeted smoke check, not an authentication or tenancy audit.

| Scenario | Blueprint summary observed | Capability executed | Result | Limitation |
| --- | --- | --- | --- | --- |
| Auto Repair | None; live compiler unavailable | None | FAIL — unverified | Need vehicle/problem intake, booking, and emergency escalation. |
| Ecommerce Support | None; live compiler unavailable | None | FAIL — unverified | Need order ID, generic order API lookup, support, escalation; no unwarranted Calendar. |
| Real Estate Buyer Qualification | None; live compiler unavailable | None | FAIL — unverified | Need budget, area, requirements, financing/timeline, qualification outcome; no assumed booking. |
| Restaurant Reservations | None; live compiler unavailable | None | FAIL — unverified | Need party size, date/time, availability, and booking or human fallback. |
| IT Helpdesk | None; live compiler unavailable | None | FAIL — unverified | Need issue intake, troubleshooting knowledge, ticket record, escalation; no assumed Calendar. |
| Car Rental | None; live compiler unavailable | None | FAIL — unverified | Need dates, vehicle requirements, availability source, booking or inquiry outcome. |
| Recruitment Screening | None; live compiler unavailable | None | FAIL — unverified | Need role/experience/availability, candidate record, recruiter follow-up; no assumed booking. |
| Property Management Maintenance Intake | None; live compiler unavailable | None | FAIL — unverified | Need property, issue, urgency, maintenance record, emergency escalation. |

Before upgrading any row to PASS, use the same Guided compiler and runtime for that scenario, inspect fields/tools/connections/rules, create the agent, configure required connections, run a representative browser call, verify a persisted record or external action, verify a sanitized tool log and approved call outcome, and note failures. Do not add scenario-specific compiler branches to force a passing result.

Automated evidence available: strict blueprint validation and mocked gateway responses; all six rule operators; registry success/unknown/invalid/crash paths; mocked outbound HTTP and unsafe URL rejection; encrypted secret round-trip; secret-free connection projection; generated flat AssemblyAI function shape; and preservation of the inbound `reply.done` tool-result queue. These establish local contracts, not live external success.
