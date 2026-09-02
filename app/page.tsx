"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type CreatedAgent = {
  business_name?: string | null;
  agent_purpose?: string | null;
  business_knowledge?: string | null;
  name?: string | null;
  assemblyai_agent_id?: string | null;
};

type AgentResponse = CreatedAgent & {
  error?: string;
};

const AGENT_PURPOSE_OPTIONS = [
  { value: "general_receptionist", label: "General receptionist" },
  { value: "appointment_booking", label: "Appointment booking" },
  { value: "product_inquiry", label: "Product inquiry" },
  { value: "customer_support", label: "Customer support" },
  { value: "lead_qualification", label: "Lead qualification" },
  { value: "feedback_collection", label: "Feedback collection" },
];

function formatPurpose(value?: string | null): string {
  const option = AGENT_PURPOSE_OPTIONS.find((purpose) => purpose.value === value);

  return option?.label ?? "General receptionist";
}

export default function Home() {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("general_receptionist");
  const [businessKnowledge, setBusinessKnowledge] = useState("");
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedAgent(null);
    setCopyStatus(null);

    const trimmedBusinessName = businessName.trim();
    const trimmedIndustry = industry.trim();
    const trimmedAgentName = agentName.trim();
    const trimmedBusinessKnowledge = businessKnowledge.trim();

    if (!trimmedBusinessName || !trimmedAgentName) {
      setError("Business name and agent name are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: trimmedBusinessName,
          industry: trimmedIndustry,
          name: trimmedAgentName,
          agent_purpose: agentPurpose,
          business_knowledge: trimmedBusinessKnowledge,
        }),
      });
      const data = (await response.json()) as AgentResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create agent.");
      }

      setCreatedAgent(data);
      setBusinessName("");
      setIndustry("");
      setAgentName("");
      setAgentPurpose("general_receptionist");
      setBusinessKnowledge("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyAgentId() {
    const agentId = createdAgent?.assemblyai_agent_id;
    if (!agentId) return;

    try {
      await navigator.clipboard.writeText(agentId);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">AI Front Desk</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              VoiceAgent Studio creates purpose-driven AssemblyAI voice agents
              from a business prompt - from front desk booking to support,
              product questions, lead qualification, and feedback.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium"
            href="/dashboard"
          >
            View dashboard
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Create agent
            </h2>

            <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="business-name">
                  Business name
                </label>
                <input
                  id="business-name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  required
                  type="text"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="industry">
                  Industry
                </label>
                <input
                  id="industry"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  placeholder="e.g. salon, dental, restaurant, general"
                  type="text"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="agent-name">
                  Agent name
                </label>
                <input
                  id="agent-name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  placeholder="e.g. Ava"
                  required
                  type="text"
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="agent-purpose">
                  Agent purpose
                </label>
                <select
                  id="agent-purpose"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  value={agentPurpose}
                  onChange={(event) => setAgentPurpose(event.target.value)}
                >
                  {AGENT_PURPOSE_OPTIONS.map((purpose) => (
                    <option key={purpose.value} value={purpose.value}>
                      {purpose.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="business-knowledge"
                >
                  Business knowledge
                </label>
                <textarea
                  id="business-knowledge"
                  className="min-h-32 resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  placeholder="Products, services, FAQs, policies, pricing notes, support steps, or anything the agent should know."
                  value={businessKnowledge}
                  onChange={(event) => setBusinessKnowledge(event.target.value)}
                />
              </div>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                className="w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Creating..." : "Create Agent"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Demo flow
            </h2>
            <ol className="mt-4 flex flex-col gap-3 text-sm text-zinc-700">
              {[
                "Create agent",
                "Start inbound call",
                "Answer for its purpose",
                "Capture confirmed follow-up",
                "Review dashboard workflow",
              ].map((step, index) => (
                <li className="flex gap-3" key={step}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-zinc-500">
              Use the browser mic for the inbound call. Booking agents can still
              run the confirmation flow, while other purposes capture follow-up
              details only when useful.
            </p>
          </section>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Successful workflow snapshot
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Static demo data for judging: this is what the dashboard shows after
                an appointment-booking lead is captured and the follow-up
                confirmation call saves a booking plus feedback.
              </p>
            </div>
            <Link
              className="inline-flex w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium"
              href="/dashboard"
            >
              Open dashboard
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase text-sky-700">
                Inbound call
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-950">
                Maya Chen asked for a haircut on Friday afternoon.
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                Agent read back name, phone, service, and preferred time before
                saving the lead.
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase text-amber-700">
                Confirmation call
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-950">
                Confirmed for Sep 5, 2026 at 2:30 PM.
              </p>
              <p className="mt-2 font-mono text-xs text-zinc-700">
                Booking ID: BK-8274
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase text-emerald-700">
                Feedback captured
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-950">
                Rating: 5/5
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                "Fast and clear. I liked that the agent repeated everything back."
              </p>
            </div>
          </div>
        </section>

        {createdAgent ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Agent created
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-zinc-500">
                  Business
                </div>
                <p className="mt-1 text-sm text-zinc-800">
                  {createdAgent.business_name ?? "Not recorded"}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-zinc-500">
                  Agent name
                </div>
                <p className="mt-1 text-sm text-zinc-800">
                  {createdAgent.name ?? "Not recorded"}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-zinc-500">
                  Purpose
                </div>
                <p className="mt-1 text-sm text-zinc-800">
                  {formatPurpose(createdAgent.agent_purpose)}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-zinc-500">
                  Knowledge
                </div>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-800">
                  {createdAgent.business_knowledge ?? "No knowledge provided"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase text-zinc-500"
                htmlFor="created-agent-id"
              >
                AssemblyAI agent ID
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="created-agent-id"
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
                  readOnly
                  value={createdAgent.assemblyai_agent_id ?? ""}
                />
                <button
                  className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
                  onClick={copyAgentId}
                  type="button"
                >
                  Copy
                </button>
              </div>
              {copyStatus ? (
                <p className="text-sm text-zinc-500">{copyStatus}</p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                href={`/demo?agent_id=${encodeURIComponent(createdAgent.assemblyai_agent_id ?? "")}`}
              >
                Start test call
              </Link>
              <Link
                className="inline-flex w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
                href="/dashboard"
              >
                View dashboard
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
