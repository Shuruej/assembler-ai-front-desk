# VoiceAgent Studio / AI Front Desk Hackathon Demo Script

## 2-3 Minute Pitch

"VoiceAgent Studio is a no-code AssemblyAI Voice Agent builder for businesses. A business owner describes what they do, chooses an agent purpose, adds lightweight business knowledge, and the app creates a purpose-driven voice agent with the right prompt, tool instructions, and dashboard workflow.

AI Front Desk is one template inside that broader studio. It handles appointment booking with a mandatory read-back before saving a lead, then runs a confirmation call that assigns a booking ID and captures feedback."

## Live Demo Flow

1. On the homepage, create an agent.

Say: "I will create an agent for Bright Cut Studio, a salon. The agent name is Ava, and I will choose the appointment booking purpose. I can also paste business knowledge such as services, hours, pricing notes, policies, or FAQs."

Example business knowledge:

```text
Services include haircuts, color, and blowouts. Haircuts start at $45. Open Tuesday through Saturday, 9 AM to 6 PM. Same-day appointments may be available, but staff must confirm final times.
```

2. Click `Start test call`.

Say to the voice agent: "Hi, my name is Maya Chen. I want to book a haircut this Friday afternoon. My phone number is 415-555-0198."

When the agent reads details back, say: "Yes, that is correct."

3. Open the dashboard.

Say: "The dashboard now shows the agent purpose and a compact knowledge preview. The lead is pending confirmation, and the booking columns are labeled as optional workflow fields because not every VoiceAgent Studio template is a booking agent."

4. Click `Confirm` for the appointment lead.

Say to the confirmation agent: "Yes, Friday at 2:30 PM works for me."

When the agent reads the final appointment back, say: "Yes, correct."

When asked for feedback, say: "Five out of five. It was fast and clear, and I liked that the agent repeated everything back."

If the agent asks to confirm the feedback, say: "Yes, that is right."

5. Return to the dashboard and click `Refresh`.

Say: "The same lead now has a confirmed status, a booking ID, confirmed date and time, feedback rating, and feedback notes. The call table separates inbound calls from confirmation calls."

## Alternate Purpose Demo

If you want to show the broader product direction after the booking flow, create a second agent:

- Business: "Northstar Gear"
- Industry: "Outdoor retail"
- Purpose: "Product inquiry"
- Knowledge: "Carries hiking packs, trail shoes, rain shells, and tents. Warranty is 30 days for unused items. Staff can follow up on special orders and size availability."

Say to the agent: "Do you carry waterproof hiking boots, and can someone call me if size 10 is available?"

Say: "For product inquiry agents, the prompt tells the agent to answer from business knowledge first, then capture a lead only when the caller wants follow-up, availability updates, quotes, or staff contact."

## Backup Demo If Live Voice Fails

Use the homepage's successful-workflow snapshot.

Say: "If browser mic permissions or live API access fail during judging, this static panel shows the completed AI Front Desk template: inbound lead, confirmation booking, and customer feedback. The dashboard supports the same stored workflow fields while the broader Studio layer now adds purpose-driven prompting and business knowledge."
