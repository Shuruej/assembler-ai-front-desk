# AI Front Desk Hackathon Demo Script

## 2-3 Minute Pitch

"AI Front Desk is a voice receptionist for small businesses. It answers inbound calls, captures appointment leads only after reading the details back, then runs a confirmation call that assigns a booking ID and captures feedback. The goal is to turn missed or messy phone calls into structured bookings a business owner can trust."

## Live Demo Flow

1. On the homepage, create an agent.

Say: "I will create an agent for Bright Cut Studio, a salon. The agent name is Ava."

2. Click `Start test call`.

Say to the voice agent: "Hi, my name is Maya Chen. I want to book a haircut this Friday afternoon. My phone number is 415-555-0198."

When the agent reads details back, say: "Yes, that is correct."

3. Open the dashboard.

Say: "Now the dashboard shows the inbound call and the lead. The lead is pending confirmation, so the business can follow up instead of losing the request."

4. Click `Confirm` for the lead.

Say to the confirmation agent: "Yes, Friday at 2:30 PM works for me."

When the agent reads the final appointment back, say: "Yes, correct."

When asked for feedback, say: "Five out of five. It was fast and clear, and I liked that the agent repeated everything back."

If the agent asks to confirm the feedback, say: "Yes, that is right."

5. Return to the dashboard and click `Refresh`.

Say: "The same lead now has a confirmed status, a booking ID, confirmed date and time, feedback rating, and feedback notes. The call table also separates inbound calls from confirmation calls."

## Backup Demo If Live Voice Fails

Use the homepage's successful-workflow snapshot.

Say: "If browser mic permissions or live API access fail during judging, this static panel shows the exact completed workflow state: inbound lead, confirmation booking, and customer feedback. The dashboard is built to display these same fields when the live workflow succeeds."
