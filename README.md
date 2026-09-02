# AI Front Desk

AI Front Desk is a Next.js 16 hackathon project for the AssemblyAI Voice Agent Hackathon. It gives small businesses a browser-based voice front desk that can answer inbound calls, capture leads only after a mandatory read-back confirmation, run a follow-up confirmation call, assign a booking ID, and collect post-booking feedback.

## Problem

Small businesses miss calls, lose appointment requests, and rarely collect structured feedback after a booking. A missed or poorly documented call can mean lost revenue, while manual follow-up takes time away from serving customers.

## Solution

AI Front Desk turns a Voice Agent into a lightweight receptionist workflow:

1. Create a business voice agent.
2. Start an inbound browser voice call.
3. Capture a lead after the agent reads the details back and the caller confirms.
4. Run a simulated outbound confirmation call for the lead.
5. Save booking details and feedback into Supabase.
6. Review agents, calls, leads, bookings, and feedback from the dashboard.

## Key Features

- Business voice agent creation.
- Browser-based inbound voice demo using microphone audio.
- Mandatory read-back confirmation before the `capture_lead` tool saves a lead.
- Dashboard for agents, inbound calls, confirmation calls, leads, bookings, and feedback.
- Confirmation-call flow at `/confirm/[leadId]`.
- Booking assignment with `booking_id`, `confirmed_date`, `confirmed_time`, and `confirmation_status`.
- Feedback capture with `feedback_rating` and `feedback_notes`.
- Dashboard manual refresh plus refresh-on-focus and visibility change.
- Static successful-workflow snapshot on the homepage for demo resilience if live mic/API access fails.

## AssemblyAI Usage

The app uses AssemblyAI Voice Agent capabilities in two places:

- Inbound demo call: `/demo` opens a browser microphone session against the created AssemblyAI agent and handles the `capture_lead` tool call.
- Confirmation call: `/confirm/[leadId]` starts a browser voice session with a purpose-built confirmation prompt and exposes `assign_booking` and `capture_feedback` tools.

Audio is streamed over the AssemblyAI Voice Agent WebSocket using PCM audio from `public/assemblyai-pcm-worklet.js`. Server routes mint voice tokens, start/end call records, and persist tool-call results.

## Architecture

- `app/page.tsx`: agent creation, demo guide, and static successful-workflow snapshot.
- `app/demo/page.tsx`: inbound browser voice call demo.
- `app/confirm/[leadId]/page.tsx`: confirmation call UI, tool handling, and live results refresh.
- `app/dashboard/page.tsx`: dashboard for agents, calls, leads, bookings, and feedback.
- `app/api/*`: route handlers for agents, calls, leads, voice tokens, confirmation context, booking, and feedback.
- `lib/assemblyai/client.ts`: AssemblyAI API client helpers.
- `lib/supabase/*`: Supabase clients.
- `supabase/migrations/*`: core tables and confirmation workflow fields.

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

1. Create an agent for a sample business, such as "Bright Cut Studio".
2. Start the inbound call and ask to book an appointment.
3. Confirm the read-back so the lead is saved.
4. Open the dashboard and show the inbound call plus pending lead.
5. Open the confirmation flow, agree on date/time, and give a 1-5 rating.
6. Return to the dashboard and show the booking ID, confirmed time, status, rating, and notes.

## Known Limitations

- The confirmation flow is simulated in-browser rather than dialing a real phone number.
- Live demo quality depends on microphone permissions, browser audio support, and AssemblyAI/Supabase credentials.
- The app is optimized for hackathon clarity, not multi-tenant production authorization.
- Scheduling availability is not integrated with a real calendar yet.

## Future Roadmap

- Real outbound phone calling for confirmations.
- Calendar integration for live availability and booking conflicts.
- Authentication and multi-business workspaces.
- SMS/email follow-up with review links.
- Analytics for missed calls, conversion rate, and customer satisfaction.
- Human handoff when callers ask complex or sensitive questions.
