"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type CreatedAgent = {
  business_name?: string | null;
  name?: string | null;
  assemblyai_agent_id?: string | null;
};

type AgentResponse = CreatedAgent & {
  error?: string;
};

export default function Home() {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [agentName, setAgentName] = useState("");
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
              A voice AI that answers your business calls, books appointments, and
              captures leads - works for any type of business.
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
              How it works
            </h2>
            <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-sm text-zinc-700">
              <li>Create your agent.</li>
              <li>Test it with your voice.</li>
              <li>View captured leads on your dashboard.</li>
            </ol>
          </section>
        </div>

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
                href="/demo"
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
