# Assembler demo script

## Two-minute story

“Businesses describe work, not JSON schemas. Assembler turns that description into a reviewed blueprint: what the voice agent should know, what details it collects, what actions it can take, which systems those actions need, and what counts as success. AssemblyAI supplies the real-time voice; Assembler supplies the business rules and action layer.”

## Current demo status

The 2026-09-27 verification did not reach a live blueprint or voice session. The configured Supabase host failed DNS resolution, and both AssemblyAI Gateway and Voice Agent token HTTPS connections timed out. No Auto Repair or Ecommerce end-to-end path is verified. Do not present the steps below as already tested. Until connectivity and the migration are restored, the honest fallback is to show the working Guided/Manual interface, the controlled compiler error, the local contract tests, and the cross-business validation record.

## Planned live path — run only after external setup is verified

1. **Describe.** Paste an auto-repair workflow: “Identify the vehicle and problem, answer common service questions from our supplied knowledge, check appointment availability, create a booking after explicit confirmation, and escalate immediately for brake failure, smoke, or an accident.” Click **Design blueprint**. Review fields, tools, connections, emergency rules, and workflow. Do not imply this was chosen from a vehicle template.
2. **Create.** Complete the business name, schedule, and factual knowledge. Create the agent. Open **Configure connections**. Calendar tools can use the existing Google connection or internal slots. Show the readiness labels; do not say an unconfigured connection is ready.
3. **Speak.** Start the browser voice test. Ask for an appointment, choose a returned time, and confirm it. The generated tool call should use the existing result queue; the booking should appear in the dashboard. Try a danger report separately to demonstrate escalation.
4. **Inspect.** In Agent Studio, show a real record or booked lead, the sanitized tool log, and the approved call outcome. If a tool fails, show its actual failure status.
5. **Contrast.** Create an ecommerce support blueprint: collect order ID, look up order status through a generic configured HTTPS API, answer from supplied policies, escalate unresolved issues. Point out that it should not require Calendar unless the description asks for scheduling. Configure a test API before claiming the lookup ran.

## Prerequisites

- Apply `supabase/migrations/20260927120000_assembler_core.sql` to the target project.
- Verify AssemblyAI LLM Gateway and Voice Agent API connectivity, service-role Supabase access, browser microphone permissions, and any external test API.
- Set `CONNECTION_ENCRYPTION_KEY` if a connection needs an authorization header.
- Complete and record the scenario checks in `docs/ASSEMBLER_VALIDATION.md` before saying the eight-business generality requirement passed.

## Honest fallback

If the gateway or microphone fails, show Blueprint Review only if a fresh live compile actually succeeded. Otherwise show the existing committed code/tests and the legacy working agent path. Do not present a static illustration, mocked response, or unconfigured action as a successful live run.
