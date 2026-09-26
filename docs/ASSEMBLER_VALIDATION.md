# Assembler cross-business validation

Recorded 2026-09-27. **No live blueprint or voice session was successfully produced during this run.** The AssemblyAI gateway connection timed out, and the new Supabase migration could not be applied from this workspace because no SQL-capable project connection or dashboard session was available. Automated tests use mocked external services; they do not establish live business generality.

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
