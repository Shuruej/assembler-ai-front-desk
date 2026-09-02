"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Agent = {
  id: string;
  business_name: string | null;
  industry: string | null;
  name: string | null;
  assemblyai_agent_id: string | null;
  created_at: string | null;
};

type Call = {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  status: string | null;
  transcript: string | null;
};

type Lead = {
  id: string;
  call_id: string;
  customer_name: string | null;
  phone_number: string | null;
  requested_service: string | null;
  preferred_datetime: string | null;
  status: string | null;
  notes: string | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Not recorded";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function displayValue(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Not recorded";
}

function getDemoHref(assemblyAIAgentId: string): string {
  return `/demo?agent_id=${encodeURIComponent(assemblyAIAgentId)}`;
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      setIsLoadingAgents(true);
      setError(null);

      try {
        const data = await fetchJson<Agent[]>("/api/agents");
        if (!ignore) {
          setAgents(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load agents.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingAgents(false);
        }
      }
    }

    void loadAgents();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedAgentId) {
      setCalls([]);
      setLeads([]);
      setExpandedCallIds(new Set());
      return;
    }

    let ignore = false;

    async function loadAgentDetails() {
      setIsLoadingDetails(true);
      setError(null);
      setExpandedCallIds(new Set());

      try {
        const [callsData, leadsData] = await Promise.all([
          fetchJson<Call[]>(`/api/agents/${selectedAgentId}/calls`),
          fetchJson<Lead[]>(`/api/agents/${selectedAgentId}/leads`),
        ]);

        if (!ignore) {
          setCalls(callsData);
          setLeads(leadsData);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Failed to load agent details.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingDetails(false);
        }
      }
    }

    void loadAgentDetails();

    return () => {
      ignore = true;
    };
  }, [selectedAgentId]);

  function toggleTranscript(callId: string) {
    setExpandedCallIds((current) => {
      const next = new Set(current);

      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }

      return next;
    });
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">AI Front Desk Dashboard</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Review captured calls and leads for each voice agent.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            href="/demo"
          >
            Start test call
          </Link>
        </header>

        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Agents
            </h2>

            <div className="mt-4 flex flex-col gap-2">
              {isLoadingAgents ? (
                <p className="text-sm text-zinc-500">Loading agents...</p>
              ) : agents.length === 0 ? (
                <p className="text-sm text-zinc-500">No agents found.</p>
              ) : (
                agents.map((agent) => {
                  const isSelected = agent.id === selectedAgentId;

                  return (
                    <div
                      className={`flex items-start gap-3 rounded-md border p-3 ${
                        isSelected
                          ? "border-zinc-950 bg-zinc-100"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      }`}
                      key={agent.id}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedAgentId(agent.id)}
                        type="button"
                      >
                        <div className="text-sm font-semibold">
                          {displayValue(agent.business_name)}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {displayValue(agent.industry)}
                        </div>
                        <div className="mt-1 text-sm text-zinc-700">
                          {displayValue(agent.name)}
                        </div>
                      </button>
                      {agent.assemblyai_agent_id ? (
                        <Link
                          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                          href={getDemoHref(agent.assemblyai_agent_id)}
                        >
                          Test
                        </Link>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <div className="flex flex-col gap-6">
            {!selectedAgent ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
                <h2 className="text-lg font-semibold">Select an agent</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Choose an agent from the list to view captured calls and leads.
                </p>
              </section>
            ) : (
              <>
                <section className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {displayValue(selectedAgent.business_name)}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        {displayValue(selectedAgent.name)} -{" "}
                        {displayValue(selectedAgent.industry)}
                      </p>
                    </div>
                    {selectedAgent.assemblyai_agent_id ? (
                      <Link
                        className="inline-flex w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
                        href={getDemoHref(selectedAgent.assemblyai_agent_id)}
                      >
                        Test this agent
                      </Link>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                      Calls
                    </h2>
                    {isLoadingDetails ? (
                      <span className="text-sm text-zinc-500">Loading...</span>
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {calls.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No calls captured for this agent yet.
                      </p>
                    ) : (
                      <table className="w-full min-w-[44rem] text-left text-sm">
                        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="py-2 pr-4 font-semibold">Started</th>
                            <th className="py-2 pr-4 font-semibold">Duration</th>
                            <th className="py-2 pr-4 font-semibold">Status</th>
                            <th className="py-2 font-semibold">Transcript</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {calls.map((call) => {
                            const transcript = displayValue(call.transcript);
                            const isLong = transcript.length > 180;
                            const isExpanded = expandedCallIds.has(call.id);
                            const shownTranscript =
                              isLong && !isExpanded
                                ? `${transcript.slice(0, 180)}...`
                                : transcript;

                            return (
                              <tr key={call.id} className="align-top">
                                <td className="py-3 pr-4 text-zinc-700">
                                  {formatDate(call.started_at)}
                                </td>
                                <td className="py-3 pr-4 text-zinc-700">
                                  {formatDuration(call.duration_seconds)}
                                </td>
                                <td className="py-3 pr-4 text-zinc-700">
                                  {displayValue(call.status)}
                                </td>
                                <td className="py-3">
                                  <p className="whitespace-pre-wrap text-zinc-700">
                                    {shownTranscript}
                                  </p>
                                  {isLong ? (
                                    <button
                                      className="mt-2 text-sm font-medium text-zinc-950 underline"
                                      onClick={() => toggleTranscript(call.id)}
                                      type="button"
                                    >
                                      {isExpanded ? "Show less" : "Show more"}
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                      Leads
                    </h2>
                    {isLoadingDetails ? (
                      <span className="text-sm text-zinc-500">Loading...</span>
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {leads.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No leads captured for this agent yet.
                      </p>
                    ) : (
                      <table className="w-full min-w-[56rem] text-left text-sm">
                        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="py-2 pr-4 font-semibold">Customer</th>
                            <th className="py-2 pr-4 font-semibold">Phone</th>
                            <th className="py-2 pr-4 font-semibold">Request</th>
                            <th className="py-2 pr-4 font-semibold">Preferred time</th>
                            <th className="py-2 pr-4 font-semibold">Status</th>
                            <th className="py-2 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {leads.map((lead) => (
                            <tr key={lead.id} className="align-top">
                              <td className="py-3 pr-4 text-zinc-700">
                                {displayValue(lead.customer_name)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {displayValue(lead.phone_number)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {displayValue(lead.requested_service)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {formatDate(lead.preferred_datetime)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {displayValue(lead.status)}
                              </td>
                              <td className="py-3 text-zinc-700">
                                {displayValue(lead.notes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
