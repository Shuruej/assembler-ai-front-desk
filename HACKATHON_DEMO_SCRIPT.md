# Assembler demo script

## Opening (20 seconds)

**From business intent to working voice agents.** Businesses need more than a prompt: they need data, actions, connections, rules and outcomes. Assembler builds that structure from a workflow description. Built on AssemblyAI; an independent hackathon project.

## Presentation path (3 minutes)

1. Open the creation screen. Select Auto Repair, edit the business intent, then show the other five starter workflows. These are editable descriptions using the same compiler.
2. If AssemblyAI is reachable, select Design blueprint. Review Agent, Data, Tools, Connections, Rules, Outcomes and Workflow before creating anything.
3. If the compiler is unavailable, show its actual error. Continue with an existing saved blueprint in Agent Studio if one exists. Otherwise use the architecture and example prompts below; do not substitute fabricated generated output.
4. In Agent Studio, show the selected agent, fields, tools, connection requirements and rules. Explain that configuration does not prove execution.
5. Show Test Agent and explain the connection requirement. Only start a real call when connectivity is available. Show records and tool activity only when backed by real results.
6. Close: Any business workflow → a deployable voice agent is the vision. Today, Assembler provides the compiled structure and generic execution path.

## Verified locally

The automated suite exercises blueprint validation, compiler failure handling, tool contracts, deterministic rules, record validation, connection encryption and voice result ordering using mocks. Final typecheck, test and build results are reported in the submission freeze report. These checks do not establish live service connectivity.

## Requires external AssemblyAI connection

Live intent compilation, remote agent creation or updates, and a browser voice call. External AssemblyAI endpoints could not be live-tested in the current network environment. No successful live voice call is claimed. Configured HTTP/webhook services and optional Google Calendar also need their own working connections.

## Six example prompts

### Auto Repair

Create an auto repair voice agent. Collect customer name and contact details, vehicle make, model and year, issue and urgency. Check availability and book a service appointment after confirmation. Escalate dangerous issues such as brake failure, smoke or fuel leaks to a person immediately; do not suggest driving an unsafe vehicle.

### Ecommerce Support

Create an ecommerce support voice agent. Collect customer contact details and order number. Look up the order through a connected API and explain shipping status. Record delayed, missing or damaged deliveries and escalate unresolved issues to support. Never invent a status when lookup is unavailable.

### Real Estate

Create a real estate voice agent. Qualify buyers by collecting name, contact details, budget, preferred areas, property requirements, financing readiness and purchase timeline. Save buyer requirements for follow-up by a property agent. Do not promise unverified property availability.

### Restaurant Reservations

Create a restaurant reservations voice agent. Collect guest name, contact details, party size, preferred date and time. Check availability and offer available alternatives. Confirm reservation details before booking. Record special requests and accessibility needs; refer requests that cannot be guaranteed to staff.

### IT Helpdesk

Create an IT helpdesk voice agent. Collect user name, contact details, device and issue. Guide approved troubleshooting, record steps tried, and assess severity and business impact. Create a support ticket and escalate severe or unresolved incidents. Never ask for passwords or authentication codes.

### Property Management

Create a property management voice agent. Collect tenant details, contact information, property address and unit, maintenance issue and urgency. Save a maintenance request with access preferences. Escalate emergencies such as gas leaks, fire or major flooding immediately to the emergency contact.

## Demo guardrails

Use no fake production records. SMS entries are simulated. Keep credentials hidden. This is a single-operator hackathon app without account authorization or tenant isolation.
