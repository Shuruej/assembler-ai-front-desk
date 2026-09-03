"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Agent = {
  id: string;
  business_name: string | null;
  industry: string | null;
  name: string | null;
  agent_purpose: string | null;
  business_knowledge: string | null;
  assemblyai_agent_id: string | null;
  created_at: string | null;
};

type Call = {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  status: string | null;
  call_type: string | null;
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
  confirmation_status: string | null;
  booking_id: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  feedback_rating: number | null;
  feedback_notes: string | null;
  is_spam: boolean | null;
};

type LifecycleStageState = "completed" | "active" | "pending" | "failed";

type LifecycleStage = {
  label: string;
  state: LifecycleStageState;
  statusText: string;
};

const lifecycleStateClasses: Record<LifecycleStageState, string> = {
  completed: "border-emerald-600 bg-emerald-600 text-white",
  active: "border-amber-500 bg-amber-50 text-amber-700",
  pending: "border-zinc-300 bg-white text-zinc-400",
  failed: "border-red-500 bg-red-50 text-red-700",
};

const lifecycleLineClasses: Record<LifecycleStageState, string> = {
  completed: "bg-emerald-200",
  active: "bg-amber-200",
  pending: "bg-zinc-200",
  failed: "bg-red-200",
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

function formatPlainDate(value: string | null): string {
  if (!value) return "Not recorded";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function formatStatusLabel(value: string | null): string {
  return displayValue(value).replaceAll("_", " ");
}

function formatPurpose(value: string | null): string {
  return displayValue(value).replaceAll("_", " ");
}

function formatKnowledgePreview(value: string | null): string {
  if (!value || value.trim().length === 0) {
    return "No business knowledge provided.";
  }

  const compact = value.trim().replace(/\s+/g, " ");

  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

function getBadgeClass(value: string | null): string {
  if (value === "confirmation" || value === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (value === "inbound") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function Badge({ value }: { value: string | null }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getBadgeClass(
        value,
      )}`}
    >
      {formatStatusLabel(value)}
    </span>
  );
}

function formatRating(value: number | null): string {
  return value === null ? "Not recorded" : `${value}/5`;
}

function hasValue(value: string | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

function hasNumericRating(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function getLifecycleStages(lead: Lead): LifecycleStage[] {
  const confirmationStatus = lead.confirmation_status;
  const confirmationAttempted =
    confirmationStatus === "confirmed" ||
    confirmationStatus === "declined" ||
    confirmationStatus === "no_answer";
  const bookingFailed =
    confirmationStatus === "declined" || confirmationStatus === "no_answer";

  return [
    {
      label: "Inbound Call",
      state: hasValue(lead.call_id) ? "completed" : "pending",
      statusText: hasValue(lead.call_id) ? "Completed" : "Pending",
    },
    {
      label: "Lead Captured",
      state: "completed",
      statusText: "Completed",
    },
    {
      label: "Confirmation Call",
      state:
        confirmationStatus === "pending"
          ? "active"
          : confirmationAttempted
            ? "completed"
            : "pending",
      statusText:
        confirmationStatus === "pending"
          ? "In progress"
          : confirmationAttempted
            ? "Completed"
            : "Pending",
    },
    {
      label: "Booking Confirmed",
      state:
        confirmationStatus === "confirmed"
          ? "completed"
          : bookingFailed
            ? "failed"
            : "pending",
      statusText:
        confirmationStatus === "confirmed"
          ? "Completed"
          : confirmationStatus === "declined"
            ? "Declined"
            : confirmationStatus === "no_answer"
              ? "No answer"
              : "Pending",
    },
    {
      label: "Feedback",
      state: hasNumericRating(lead.feedback_rating) ? "completed" : "pending",
      statusText: hasNumericRating(lead.feedback_rating)
        ? "Completed"
        : "Pending",
    },
  ];
}

function LeadLifecycle({ lead }: { lead: Lead }) {
  const stages = getLifecycleStages(lead);

  return (
    <div
      aria-label="Lead lifecycle"
      className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-5">
        {stages.map((stage, index) => (
          <div className="relative min-w-0" key={stage.label}>
            {index > 0 ? (
              <div
                aria-hidden="true"
                className={`absolute left-[-50%] right-[50%] top-3 hidden h-px sm:block ${
                  lifecycleLineClasses[stages[index - 1].state]
                }`}
              />
            ) : null}
            <div className="relative flex items-start gap-2 sm:flex-col sm:items-center sm:text-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${lifecycleStateClasses[stage.state]}`}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-800">
                  {stage.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {stage.statusText}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const analyticsStats = useMemo(() => {
    const validLeads = leads.filter((lead) => lead.is_spam !== true);
    const ratings = validLeads
      .map((lead) => lead.feedback_rating)
      .filter(
        (rating): rating is number =>
          typeof rating === "number" && Number.isFinite(rating),
      );
    const averageRating =
      ratings.length > 0
        ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
        : null;

    return [
      {
        label: "Total Calls",
        value: calls.length.toString(),
        suffix: null,
        supportingText: "All recorded conversations",
      },
      {
        label: "Leads Captured",
        value: validLeads.length.toString(),
        suffix: null,
        supportingText: "Valid customer inquiries",
      },
      {
        label: "Confirmed Bookings",
        value: validLeads
          .filter((lead) => lead.confirmation_status === "confirmed")
          .length.toString(),
        suffix: null,
        supportingText: "Successfully confirmed",
      },
      {
        label: "Average Rating",
        value: averageRating === null ? "\u2014" : averageRating.toFixed(1),
        suffix: averageRating === null ? null : "/ 5",
        supportingText: "Customer feedback",
      },
    ];
  }, [calls, leads]);

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
  }, [selectedAgentId, detailsRefreshKey]);

  useEffect(() => {
    if (!selectedAgentId) return;

    function refreshAgentDetails() {
      setDetailsRefreshKey((current) => current + 1);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshAgentDetails();
      }
    }

    window.addEventListener("focus", refreshAgentDetails);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshAgentDetails);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [selectedAgentId]);

  function refreshSelectedAgentDetails() {
    if (!selectedAgentId) return;

    setDetailsRefreshKey((current) => current + 1);
  }

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
              Review captured calls, leads, and optional booking workflows for
              each purpose-driven voice agent.
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

        <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
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
                        <div className="mt-1 text-xs font-medium capitalize text-zinc-600">
                          {formatPurpose(agent.agent_purpose)}
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

          <div className="flex min-w-0 flex-col gap-6">
            {!selectedAgent ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
                <h2 className="text-lg font-semibold">Select an agent</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Choose an agent from the list to view captured calls and leads.
                </p>
              </section>
            ) : (
              <>
                <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {displayValue(selectedAgent.business_name)}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        {displayValue(selectedAgent.name)} -{" "}
                        {displayValue(selectedAgent.industry)}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold uppercase text-zinc-500">
                            Purpose
                          </div>
                          <p className="mt-1 text-sm capitalize text-zinc-800">
                            {formatPurpose(selectedAgent.agent_purpose)}
                          </p>
                        </div>
                        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold uppercase text-zinc-500">
                            Knowledge preview
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm text-zinc-700">
                            {formatKnowledgePreview(
                              selectedAgent.business_knowledge,
                            )}
                          </p>
                        </div>
                      </div>
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

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {analyticsStats.map((stat) => (
                    <div
                      className="rounded-lg border border-zinc-200 bg-white p-4"
                      key={stat.label}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {stat.label}
                      </div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tracking-tight text-zinc-950">
                          {stat.value}
                        </span>
                        {stat.suffix ? (
                          <span className="text-sm font-medium text-zinc-500">
                            {stat.suffix}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-zinc-500">
                        {stat.supportingText}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                      Calls
                    </h2>
                    <div className="flex items-center gap-3">
                      {isLoadingDetails ? (
                        <span className="text-sm text-zinc-500">Loading...</span>
                      ) : null}
                      <button
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                        disabled={isLoadingDetails}
                        onClick={refreshSelectedAgentDetails}
                        type="button"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {calls.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No calls captured for this agent yet.
                      </p>
                    ) : (
                      <table className="w-full min-w-[52rem] text-left text-sm">
                        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="py-2 pr-4 font-semibold">Started</th>
                            <th className="py-2 pr-4 font-semibold">Type</th>
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
                                  <Badge value={call.call_type} />
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

                <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                        Leads and follow-ups
                      </h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        Booking and confirmation columns are optional workflow
                        fields; non-booking agents can use leads for follow-up,
                        support, product inquiries, qualification, or feedback.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isLoadingDetails ? (
                        <span className="text-sm text-zinc-500">Loading...</span>
                      ) : null}
                      <button
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                        disabled={isLoadingDetails}
                        onClick={refreshSelectedAgentDetails}
                        type="button"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {leads.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No leads captured for this agent yet.
                      </p>
                    ) : (
                      <table className="w-full min-w-[86rem] text-left text-sm">
                        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="py-2 pr-4 font-semibold">Customer</th>
                            <th className="py-2 pr-4 font-semibold">Phone</th>
                            <th className="py-2 pr-4 font-semibold">Request</th>
                            <th className="py-2 pr-4 font-semibold">Preferred time</th>
                            <th className="py-2 pr-4 font-semibold">Status</th>
                            <th className="py-2 pr-4 font-semibold">
                              Optional confirmation
                            </th>
                            <th className="py-2 pr-4 font-semibold">
                              Optional booking
                            </th>
                            <th className="py-2 pr-4 font-semibold">
                              Optional confirmed date
                            </th>
                            <th className="py-2 pr-4 font-semibold">
                              Optional confirmed time
                            </th>
                            <th className="py-2 pr-4 font-semibold">Rating</th>
                            <th className="py-2 pr-4 font-semibold">Feedback</th>
                            <th className="py-2 pr-4 font-semibold">Notes</th>
                            <th className="py-2 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {leads.flatMap((lead) => [
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
                              <td className="py-3 pr-4 text-zinc-700">
                                <Badge value={lead.confirmation_status} />
                              </td>
                              <td className="py-3 pr-4 font-mono text-xs text-zinc-700">
                                {displayValue(lead.booking_id)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {formatPlainDate(lead.confirmed_date)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {displayValue(lead.confirmed_time)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {formatRating(lead.feedback_rating)}
                              </td>
                              <td className="max-w-60 py-3 pr-4 text-zinc-700">
                                <p className="line-clamp-3">
                                  {displayValue(lead.feedback_notes)}
                                </p>
                              </td>
                              <td className="max-w-60 py-3 pr-4 text-zinc-700">
                                <p className="line-clamp-3">
                                  {displayValue(lead.notes)}
                                </p>
                              </td>
                              <td className="py-3">
                                {lead.confirmation_status === "pending" ? (
                                  <Link
                                    className="inline-flex rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                                    href={`/confirm/${lead.id}`}
                                  >
                                    Confirm
                                  </Link>
                                ) : lead.confirmation_status === "confirmed" ? (
                                  <Link
                                    className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                    href={`/confirm/${lead.id}`}
                                  >
                                    View
                                  </Link>
                                ) : null}
                              </td>
                            </tr>,
                            lead.is_spam !== true ? (
                              <tr key={`${lead.id}-lifecycle`}>
                                <td className="pb-4 pr-4 pt-0" colSpan={13}>
                                  <LeadLifecycle lead={lead} />
                                </td>
                              </tr>
                            ) : null,
                          ])}
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
