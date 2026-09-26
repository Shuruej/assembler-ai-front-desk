"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";
import type { AgentFollowUpPreferences } from "@/lib/follow-up-preferences";

type Agent = {
  confirmation_call_enabled?: boolean | null;
  feedback_enabled?: boolean | null;
  google_calendar_connected?: boolean | null;
  id: string;
  business_name: string | null;
  industry: string | null;
  name: string | null;
  agent_purpose: string | null;
  business_knowledge: string | null;
  business_hours_start?: string | null;
  business_hours_end?: string | null;
  business_days?: string | null;
  timezone?: string | null;
  appointment_duration_minutes?: number | null;
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
  needs_human: boolean;
  escalation_reason: string | null;
};

type SmsLog = {
  id: string;
  agent_id: string;
  lead_id: string | null;
  to_number: string | null;
  purpose: string;
  message: string;
  created_at: string | null;
};

type LifecycleStageState = "completed" | "active" | "pending" | "failed" | "off";

type LifecycleStage = {
  label: string;
  state: LifecycleStageState;
  statusText: string;
};

const lifecycleStateClasses: Record<LifecycleStageState, string> = {
  off: "border-zinc-200 bg-zinc-100 text-zinc-500",
  completed: "border-emerald-600 bg-emerald-600 text-white",
  active: "border-amber-500 bg-amber-50 text-amber-700",
  pending: "border-zinc-300 bg-white text-zinc-400",
  failed: "border-red-500 bg-red-50 text-red-700",
};

const lifecycleLineClasses: Record<LifecycleStageState, string> = {
  off: "bg-zinc-200",
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

function formatSmsPurpose(value: string | null): string {
  return displayValue(value).replaceAll("_", " ");
}

function formatKnowledgePreview(value: string | null): string {
  if (!value || value.trim().length === 0) {
    return "No business knowledge provided.";
  }

  const compact = value.trim().replace(/\s+/g, " ");

  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

const BUSINESS_DAY_NAMES: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function formatBusinessDays(value?: string | null): string {
  if (!value) return "Not recorded";

  const days = value
    .split(",")
    .map((day) => BUSINESS_DAY_NAMES[day.trim().toLowerCase()])
    .filter(Boolean);

  return days.length > 0 ? days.join(", ") : "Not recorded";
}

function formatBusinessHours(agent: Agent): string {
  if (!agent.business_hours_start || !agent.business_hours_end) {
    return "Not recorded";
  }

  return `${agent.business_hours_start}–${agent.business_hours_end}`;
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

function normalizeDashboardFollowUpPreferences(
  value: Pick<Agent, "confirmation_call_enabled" | "feedback_enabled"> | null,
): AgentFollowUpPreferences {
  const confirmation = value?.confirmation_call_enabled !== false;

  return {
    confirmation_call_enabled: confirmation,
    feedback_enabled: confirmation && value?.feedback_enabled !== false,
  };
}

function getLifecycleStages(lead: Lead, preferences: AgentFollowUpPreferences): LifecycleStage[] {
  if (!preferences.confirmation_call_enabled) {
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
        label: "Booking Confirmed",
        state: hasValue(lead.booking_id) ? "completed" : "off",
        statusText: hasValue(lead.booking_id) ? "Completed" : "Not applicable",
      },
      {
        label: "Feedback",
        state: hasNumericRating(lead.feedback_rating) ? "completed" : "off",
        statusText: hasNumericRating(lead.feedback_rating)
          ? "Completed"
          : "Not applicable",
      },
    ];
  }

  const confirmationStatus = lead.confirmation_status;
  const confirmationAttempted =
    confirmationStatus === "confirmed" ||
    confirmationStatus === "declined" ||
    confirmationStatus === "no_answer";
  const bookingFailed =
    confirmationStatus === "declined" || confirmationStatus === "no_answer";

  const stages: LifecycleStage[] = [
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
  return stages.map((stage) => {
    if (stage.state === "completed") return stage;
    if (stage.label === "Feedback" && !preferences.feedback_enabled) {
      return { ...stage, state: "off", statusText: "Not applicable" };
    }
    return stage;
  });
}

function LeadLifecycle({ lead, preferences }: { lead: Lead; preferences: AgentFollowUpPreferences }) {
  const stages = getLifecycleStages(lead, preferences);

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
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeSection, setActiveSection] = useState<"overview" | "calls">(
    "overview",
  );
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const followUpPreferences = normalizeDashboardFollowUpPreferences(selectedAgent);

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
      followUpPreferences.confirmation_call_enabled
        ? {
            label: "Confirmed Bookings",
            value: validLeads
              .filter((lead) => lead.confirmation_status === "confirmed")
              .length.toString(),
            suffix: null,
            supportingText: "Successfully confirmed",
          }
        : {
            label: "Follow-up",
            value: "Off",
            suffix: null,
            supportingText: "Confirmation disabled",
          },
      {
        label: "Average Rating",
        value: !followUpPreferences.feedback_enabled
          ? "Off"
          : averageRating === null
            ? "\u2014"
            : averageRating.toFixed(1),
        suffix: !followUpPreferences.feedback_enabled || averageRating === null
          ? null
          : "/ 5",
        supportingText: followUpPreferences.feedback_enabled
          ? "Customer feedback"
          : "Feedback disabled",
      },
    ];
  }, [calls, leads, followUpPreferences.confirmation_call_enabled, followUpPreferences.feedback_enabled]);

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
        const [callsData, leadsData, smsLogsData, agentsData] = await Promise.all([
          fetchJson<Call[]>(`/api/agents/${selectedAgentId}/calls`),
          fetchJson<Lead[]>(`/api/agents/${selectedAgentId}/leads`),
          fetchJson<SmsLog[]>(`/api/agents/${selectedAgentId}/sms-logs`),
          fetchJson<Agent[]>("/api/agents"),
        ]);

        if (!ignore) {
          setCalls(callsData);
          setLeads(leadsData);
          setSmsLogs(smsLogsData);
          setAgents(agentsData);
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
    <main className="assembler-studio min-h-screen bg-[#F7F8FA] text-[#17191D]">
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-b border-[#DDE1E8] bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col px-4 py-4 lg:px-5 lg:py-5">
            <Link
              className="w-fit rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769FF] focus-visible:ring-offset-4"
              href="/"
            >
              <AssemblerLogo subtitle="Agent Studio" />
            </Link>

            <nav aria-label="Studio navigation" className="mt-6 grid gap-1 sm:grid-cols-5 lg:grid-cols-1">
              <a
                className={`studio-nav-item ${
                  activeSection === "overview" ? "studio-nav-item-active" : ""
                }`}
                href="#overview"
                onClick={() => setActiveSection("overview")}
              >
                Overview
              </a>
              <a
                className={`studio-nav-item ${
                  activeSection === "calls" ? "studio-nav-item-active" : ""
                }`}
                href="#calls-leads"
                onClick={() => setActiveSection("calls")}
              >
                Calls &amp; Leads
              </a>
              <Link
                className="studio-nav-item"
                href={
                  selectedAgent?.assemblyai_agent_id
                    ? getDemoHref(selectedAgent.assemblyai_agent_id)
                    : "/demo"
                }
              >
                Test Agent
              </Link>
              {selectedAgent ? (
                <Link className="studio-nav-item" href={`/agents/${selectedAgent.id}/edit`}>
                  Edit Agent
                </Link>
              ) : (
                <span className="studio-nav-item cursor-not-allowed opacity-45">
                  Edit Agent
                </span>
              )}
              <Link className="studio-nav-item" href="/#create-agent">
                Create Agent
              </Link>
            </nav>

            <div className="mt-6 min-h-0 border-t border-[#E1E4E9] pt-5 lg:flex-1 lg:overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A8290]">
                  Your agents
                </h2>
                <span className="font-mono text-[11px] text-[#8B93A1]">
                  {agents.length}
                </span>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                {isLoadingAgents ? (
                  <p className="text-sm text-[#687080]">Loading agents...</p>
                ) : agents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#C8CED8] p-4">
                    <p className="text-sm font-medium">No agents yet.</p>
                    <Link className="mt-3 inline-flex text-sm font-semibold text-[#0B4ED0]" href="/#create-agent">
                      Create your first agent
                    </Link>
                  </div>
                ) : (
                  agents.map((agent) => {
                    const isSelected = agent.id === selectedAgentId;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`min-w-52 rounded-xl border p-3 text-left transition lg:min-w-0 ${
                          isSelected
                            ? "border-[#1769FF] bg-[#F0F5FF] shadow-[0_4px_14px_rgba(23,105,255,0.08)]"
                            : "border-[#DDE1E8] bg-white hover:border-[#AEB7C5] hover:bg-[#FAFBFC]"
                        }`}
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        type="button"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${isSelected ? "bg-[#1769FF]" : "bg-[#C8CED8]"}`}
                          />
                          <span className="truncate text-sm font-semibold">
                            {displayValue(agent.name)}
                          </span>
                        </span>
                        <span className="mt-1 block truncate pl-4 text-xs text-[#687080]">
                          {displayValue(agent.business_name)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <Link className="assembler-primary-button mt-4 hidden w-full lg:inline-flex" href="/#create-agent">
              Create agent
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-[#DDE1E8] bg-white px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[90rem] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">
                  {selectedAgent ? displayValue(selectedAgent.business_name) : "Assembler Studio"}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  {selectedAgent ? displayValue(selectedAgent.name) : "Agent Studio"}
                </h1>
                <p className="mt-1 text-sm text-[#687080]">
                  {selectedAgent
                    ? `${formatPurpose(selectedAgent.agent_purpose)} · ${displayValue(selectedAgent.industry)}`
                    : "Select an agent to inspect its operation, calls, and customer outcomes."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAgent ? (
                  <Link className="assembler-secondary-button" href={`/agents/${selectedAgent.id}/edit`}>
                    Edit agent
                  </Link>
                ) : null}
                <Link
                  className="assembler-primary-button"
                  href={
                    selectedAgent?.assemblyai_agent_id
                      ? getDemoHref(selectedAgent.assemblyai_agent_id)
                      : "/demo"
                  }
                >
                  Test agent
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto flex max-w-[90rem] min-w-0 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {error ? (
              <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {error}
              </section>
            ) : null}

            {!selectedAgent ? (
              <section className="assembler-panel rounded-2xl p-8 text-center sm:p-12">
                <span className="assembler-step-number mx-auto">01</span>
                <h2 className="mt-4 text-xl font-semibold">
                  {agents.length === 0 ? "No agents yet" : "Select an agent"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#687080]">
                  {agents.length === 0
                    ? "Create an agent from a business workflow to begin testing calls and capturing customer outcomes."
                    : "Choose an agent in the sidebar to open its overview, calls, leads, and configuration."}
                </p>
                {agents.length === 0 ? (
                  <Link className="assembler-primary-button mt-5" href="/#create-agent">
                    Create agent
                  </Link>
                ) : null}
              </section>
            ) : (
              <>
                <section className="assembler-panel min-w-0 rounded-2xl p-5 sm:p-6" id="overview">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#687080]">
                        Configuration
                      </p>
                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">
                        How this agent operates
                      </h2>
                    </div>
                    {selectedAgent.google_calendar_connected ? (
                      <span className="inline-flex w-fit rounded-lg border border-[#B7E2DA] bg-[#ECF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#287C70]">
                        Google Calendar connected
                      </span>
                    ) : (
                      <a
                        className="assembler-secondary-button w-fit"
                        href={`/api/agents/${selectedAgent.id}/google-calendar/connect`}
                      >
                        Connect Google Calendar
                      </a>
                    )}
                  </div>

                  <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-[#DDE1E8] bg-[#DDE1E8] sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Purpose", formatPurpose(selectedAgent.agent_purpose)],
                      ["Business hours", formatBusinessHours(selectedAgent)],
                      ["Business days", formatBusinessDays(selectedAgent.business_days)],
                      ["Timezone", selectedAgent.timezone ?? "Not recorded"],
                      [
                        "Appointment length",
                        selectedAgent.appointment_duration_minutes
                          ? `${selectedAgent.appointment_duration_minutes} minutes`
                          : "Not recorded",
                      ],
                      [
                        "Confirmation calls",
                        followUpPreferences.confirmation_call_enabled ? "Enabled" : "Disabled",
                      ],
                      [
                        "Feedback collection",
                        followUpPreferences.feedback_enabled ? "Enabled" : "Disabled",
                      ],
                      [
                        "Availability source",
                        selectedAgent.google_calendar_connected
                          ? "Google Calendar"
                          : "Internal schedule",
                      ],
                    ].map(([label, value]) => (
                      <div className="bg-[#FAFBFC] p-3.5" key={label}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7A8290]">
                          {label}
                        </dt>
                        <dd className="mt-1.5 text-sm font-medium capitalize text-[#282C34]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 rounded-xl border border-[#DDE1E8] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7A8290]">
                      Business knowledge
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#5F6877]">
                      {formatKnowledgePreview(selectedAgent.business_knowledge)}
                    </p>
                  </div>
                </section>

                <section aria-label="Agent analytics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {analyticsStats.map((stat) => (
                    <div
                      className="rounded-xl border border-[#DDE1E8] bg-white p-4 shadow-[0_5px_18px_rgba(30,41,59,0.04)]"
                      key={stat.label}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.11em] text-[#7A8290]">
                        {stat.label}
                      </div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tracking-[-0.035em] text-[#17191D]">
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

                <section className="assembler-panel min-w-0 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-[#282C34]">
                        Notification log
                      </h2>
                      <p className="mt-1 text-xs text-[#687080]">
                        Simulated SMS events generated by this agent
                      </p>
                    </div>
                    {isLoadingDetails ? (
                      <span className="text-sm text-zinc-500">Loading...</span>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    {smsLogs.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No simulated notifications logged for this agent yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#E8EBEF] rounded-xl border border-[#DDE1E8]">
                        {smsLogs.map((smsLog) => (
                          <div className="p-3" key={smsLog.id}>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-sm font-semibold capitalize text-zinc-900">
                                  {formatSmsPurpose(smsLog.purpose)}
                                </div>
                                <p className="mt-1 text-xs text-zinc-500">
                                  To: {smsLog.to_number ?? "Internal"}
                                </p>
                              </div>
                              <div className="text-xs text-zinc-500">
                                {formatDate(smsLog.created_at)}
                              </div>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
                              {smsLog.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="assembler-panel min-w-0 scroll-mt-6 rounded-2xl p-5" id="calls-leads">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#1769FF]">
                        Calls &amp; Leads
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">Call history</h2>
                    </div>
                    <div className="flex items-center gap-3">
                      {isLoadingDetails ? (
                        <span className="text-sm text-zinc-500">Loading...</span>
                      ) : null}
                      <button
                        className="assembler-secondary-button min-h-0 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
                      <div className="rounded-xl border border-dashed border-[#C8CED8] bg-[#FAFBFC] p-6 text-center">
                        <p className="text-sm font-medium text-[#282C34]">No calls yet</p>
                        <p className="mt-1 text-sm text-[#687080]">
                          Test this agent to create its first recorded conversation.
                        </p>
                        {selectedAgent.assemblyai_agent_id ? (
                          <Link className="assembler-secondary-button mt-4" href={getDemoHref(selectedAgent.assemblyai_agent_id)}>
                            Test agent
                          </Link>
                        ) : null}
                      </div>
                    ) : (
                      <table className="w-full min-w-[52rem] text-left text-sm">
                        <thead className="border-b border-[#DDE1E8] text-[11px] uppercase tracking-[0.08em] text-[#7A8290]">
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
                                      className="mt-2 text-sm font-semibold text-[#0B4ED0] underline decoration-[#B6CDFB] underline-offset-4"
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

                <section className="assembler-panel min-w-0 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[#282C34]">
                        Leads and outcomes
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-[#687080]">
                        Customer details, follow-up state, bookings, feedback, and escalations.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isLoadingDetails ? (
                        <span className="text-sm text-zinc-500">Loading...</span>
                      ) : null}
                      <button
                        className="assembler-secondary-button min-h-0 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
                      <div className="rounded-xl border border-dashed border-[#C8CED8] bg-[#FAFBFC] p-6 text-center">
                        <p className="text-sm font-medium text-[#282C34]">No leads captured yet</p>
                        <p className="mt-1 text-sm text-[#687080]">
                          Captured customer requests and their follow-up lifecycle will appear here.
                        </p>
                      </div>
                    ) : (
                      <table className="w-full min-w-[86rem] text-left text-sm">
                        <thead className="border-b border-[#DDE1E8] text-[11px] uppercase tracking-[0.08em] text-[#7A8290]">
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
                                {lead.needs_human ? (
                                  <div className="mt-1">
                                    <span
                                      className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800"
                                      title={lead.escalation_reason ?? undefined}
                                    >
                                      Needs Human
                                    </span>
                                    {lead.escalation_reason ? (
                                      <p className="mt-1 max-w-60 text-xs text-orange-800">
                                        {lead.escalation_reason}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
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
                                <Badge value={followUpPreferences.confirmation_call_enabled
                                  ? lead.confirmation_status : "follow_up_off"} />
                              </td>
                              <td className="py-3 pr-4 font-mono text-xs text-zinc-700">
                                {!followUpPreferences.confirmation_call_enabled &&
                                !hasValue(lead.booking_id)
                                  ? "Not applicable"
                                  : displayValue(lead.booking_id)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {!followUpPreferences.confirmation_call_enabled &&
                                !hasValue(lead.confirmed_date)
                                  ? "Not applicable"
                                  : formatPlainDate(lead.confirmed_date)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {!followUpPreferences.confirmation_call_enabled &&
                                !hasValue(lead.confirmed_time)
                                  ? "Not applicable"
                                  : displayValue(lead.confirmed_time)}
                              </td>
                              <td className="py-3 pr-4 text-zinc-700">
                                {!followUpPreferences.feedback_enabled && !hasNumericRating(lead.feedback_rating)
                                  ? "Not applicable" : formatRating(lead.feedback_rating)}
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
                                {!followUpPreferences.confirmation_call_enabled ? (
                                  <span className="text-xs text-zinc-500">Follow-up off</span>
                                ) : lead.confirmation_status === "pending" ? (
                                  <Link
                                      className="inline-flex rounded-lg border border-[#C8CED8] bg-white px-3 py-1.5 text-xs font-semibold text-[#282C34] hover:bg-[#F0F5FF] hover:text-[#0B4ED0]"
                                    href={`/confirm/${lead.id}`}
                                  >
                                    Confirm
                                  </Link>
                                ) : lead.confirmation_status === "confirmed" ? (
                                  <Link
                                    className="inline-flex rounded-lg border border-[#B7E2DA] bg-[#ECF9F6] px-3 py-1.5 text-xs font-semibold text-[#287C70] hover:bg-[#DFF4EF]"
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
                                  <LeadLifecycle lead={lead} preferences={followUpPreferences} />
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
