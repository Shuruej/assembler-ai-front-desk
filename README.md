# VoiceAgent Studio / AI Front Desk

VoiceAgent Studio is a Next.js 16 hackathon project for the AssemblyAI Voice Agent Hackathon. It creates purpose-driven AssemblyAI voice agents from a business prompt, lightweight business knowledge, and a selected workflow template.

AI Front Desk is one template inside the broader product: an appointment-focused receptionist that answers inbound calls, captures leads only after a mandatory read-back confirmation, runs a follow-up confirmation call, assigns a booking ID, and collects post-booking feedback.

## Problem

Businesses need voice agents for more than appointment booking. A salon may need a front desk, a retailer may need product inquiry handling, a SaaS team may need support triage, and a services business may need lead qualification. Most small teams do not have the time or technical setup to design prompts, tools, call flows, and dashboards from scratch.

## Solution

VoiceAgent Studio turns one business description into a voice agent with a purpose-aware prompt, tool guidance, and dashboard workflow:

1. Describe the business, industry, agent persona, purpose, and business knowledge.
2. Create an AssemblyAI Voice Agent with a dynamic system prompt.
3. Start an inbound browser voice call.
4. Answer questions from business knowledge when available.
5. Capture a confirmed follow-up lead only when the selected purpose calls for it.
6. Review agents, calls, leads, optional bookings, and feedback from the dashboard.

## Current MVP

- Purpose-driven agent creation with templates for general receptionist, appointment booking, product inquiry, customer support, lead qualification, and feedback collection.
- Lightweight business knowledge textarea for products, services, FAQs, policies, pricing notes, and support information.
- Dynamic AssemblyAI system prompts based on business name, industry, agent persona, purpose, and business knowledge.
- Purpose-specific `capture_lead` instructions while keeping the existing tool surface simple.
- Mandatory read-back confirmation before the `capture_lead` tool saves any lead.
- Browser-based inbound voice demo using microphone audio.
- Dashboard for agents, inbound calls, confirmation calls, leads, optional booking workflow fields, and feedback.
- AI Front Desk confirmation-call flow at `/confirm/[leadId]`.
- Booking assignment with `booking_id`, `confirmed_date`, `confirmed_time`, and `confirmation_status`.
- Feedback capture with `feedback_rating` and `feedback_notes`.
- Dashboard manual refresh plus refresh-on-focus and visibility change.
- Static successful-workflow snapshot on the homepage for demo resilience if live mic/API access fails.

## Purpose Templates

- General receptionist: route naturally, answer basic questions, and capture follow-up details when staff should respond.
- Appointment booking: capture booking intent, preferred time, requested service, caller name, phone number, and scheduling notes.
- Product inquiry: answer from business knowledge first, then capture follow-up for quotes, availability, or staff contact.
- Customer support: answer from business knowledge and policies, then capture unresolved issues for human follow-up.
- Lead qualification: gather need, fit, timeline, and contact details before capturing qualified interest.
- Feedback collection: gather rating/comments and capture follow-up when feedback needs staff response.

## AssemblyAI Usage

The app uses AssemblyAI Voice Agent capabilities in two places:

- Inbound demo call: `/demo` opens a browser microphone session against the created AssemblyAI agent and handles the `capture_lead` tool call.
- Confirmation call: `/confirm/[leadId]` starts a browser voice session with a purpose-built confirmation prompt and exposes `assign_booking` and `capture_feedback` tools for the AI Front Desk booking template.

Audio is streamed over the AssemblyAI Voice Agent WebSocket using PCM audio from `public/assemblyai-pcm-worklet.js`. Server routes mint voice tokens, start/end call records, and persist tool-call results.

## Architecture

- `app/page.tsx`: purpose-driven agent creation, demo guide, and static successful-workflow snapshot.
- `app/demo/page.tsx`: inbound browser voice call demo.
- `app/confirm/[leadId]/page.tsx`: AI Front Desk confirmation call UI, tool handling, and live results refresh.
- `app/dashboard/page.tsx`: dashboard for agents, calls, leads, optional bookings, and feedback.
- `app/api/*`: route handlers for agents, calls, leads, voice tokens, confirmation context, booking, and feedback.
- `lib/assemblyai/client.ts`: AssemblyAI API client helpers and dynamic prompt generation.
- `lib/supabase/*`: Supabase clients.
- `supabase/migrations/*`: core tables, purpose/knowledge fields, and confirmation workflow fields.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Apply the Supabase migrations in `supabase/migrations` to your Supabase project before running the full workflow.

## Environment Variables

Create `.env.local` with:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

The service-role key is used only by server-side API routes. Do not expose it in client components.

## Demo Script

Use the full script in `HACKATHON_DEMO_SCRIPT.md`. Short version:

1. Create a purpose-driven agent for a sample business, such as "Bright Cut Studio".
2. Select the appointment booking purpose to show the AI Front Desk template, or product inquiry/support to show broader Studio behavior.
3. Start the inbound call and ask a purpose-relevant question or request.
4. Confirm the read-back so the lead is saved only after explicit caller approval.
5. Open the dashboard and show the agent purpose, knowledge preview, inbound call, and lead.
6. For appointment leads, open the confirmation flow, agree on date/time, and give a 1-5 rating.
7. Return to the dashboard and show the optional booking fields, status, rating, and notes.

## Known Limitations

- Business knowledge is prompt-injected text, not retrieval-augmented generation yet.
- The confirmation flow is simulated in-browser rather than dialing a real phone number.
- Live demo quality depends on microphone permissions, browser audio support, and AssemblyAI/Supabase credentials.
- The app is optimized for hackathon clarity, not multi-tenant production authorization.
- Scheduling availability is not integrated with a real calendar yet.

## Future Roadmap

- Retrieval-augmented generation over uploaded docs, websites, and knowledge bases.
- Twilio inbound and outbound phone calling.
- CRM connectors for HubSpot, Salesforce, Airtable, and similar systems.
- MCP/API integrations so generated agents can safely use business tools.
- Calendar integrations for live availability, booking conflicts, and rescheduling.
- Authentication and multi-business workspaces.
- SMS/email follow-up with review links.
- Analytics for missed calls, conversion rate, support resolution, and customer satisfaction.
- Human handoff when callers ask complex or sensitive questions.
