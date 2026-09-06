"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import {
  DEFAULT_FOLLOW_UP_PREFERENCES,
  type FollowUpPreferences,
} from "@/lib/follow-up-preferences";

type CreationMode = "simple" | "advanced";

type CreatedAgent = {
  confirmation_call_enabled?: boolean;
  feedback_enabled?: boolean;
  business_name?: string | null;
  agent_purpose?: string | null;
  business_knowledge?: string | null;
  name?: string | null;
  assemblyai_agent_id?: string | null;
};

type AgentConfig = {
  follow_up_preferences: FollowUpPreferences;
  business_name: string;
  industry: string;
  name: string;
  agent_purpose: string;
  business_knowledge: string;
  business_hours_start: string;
  business_hours_end: string;
  timezone: string;
};

type AgentResponse = CreatedAgent & {
  error?: string;
};

type AgentConfigResponse = AgentConfig & {
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

const BUSINESS_DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

const DEFAULT_BUSINESS_DAYS = BUSINESS_DAY_OPTIONS.map((day) => day.value);
const DEFAULT_BUSINESS_HOURS_START = "09:00";
const DEFAULT_BUSINESS_HOURS_END = "18:00";
const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60;

const WORKFLOW_STEPS = ["Call", "Lead", "Confirm", "Book", "Feedback"];

const DASHBOARD_PREVIEW = [
  {
    label: "Lead captured",
    value: "Maya Khan · Dental checkup · Friday afternoon",
  },
  {
    label: "Confirmation pending",
    value: "Follow-up confirmation flow handles booking details",
  },
  {
    label: "Booking confirmed",
    value: "BK-8274 · Sep 5 · 2:30 PM",
  },
  {
    label: "Feedback",
    value: "5/5 · Clear, fast confirmation",
  },
];

function formatPurpose(value?: string | null): string {
  const option = AGENT_PURPOSE_OPTIONS.find((purpose) => purpose.value === value);

  return option?.label ?? "General receptionist";
}

export default function Home() {
  const simpleModeRef = useRef<HTMLButtonElement>(null);
  const advancedModeRef = useRef<HTMLButtonElement>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>("simple");
  const [businessDescription, setBusinessDescription] = useState("");
  const [followUpPreferences, setFollowUpPreferences] = useState<FollowUpPreferences>(
    DEFAULT_FOLLOW_UP_PREFERENCES,
  );
  const [businessHoursStart, setBusinessHoursStart] = useState(
    DEFAULT_BUSINESS_HOURS_START,
  );
  const [businessHoursEnd, setBusinessHoursEnd] = useState(
    DEFAULT_BUSINESS_HOURS_END,
  );
  const [appointmentDurationMinutes, setAppointmentDurationMinutes] = useState(
    DEFAULT_APPOINTMENT_DURATION_MINUTES,
  );
  const [businessDays, setBusinessDays] = useState<string[]>(
    DEFAULT_BUSINESS_DAYS,
  );
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [hasGeneratedConfig, setHasGeneratedConfig] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("general_receptionist");
  const [businessKnowledge, setBusinessKnowledge] = useState("");
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function submitAgent(payload: {
    business_name: string;
    industry: string;
    name: string;
    agent_purpose: string;
    business_knowledge: string;
    business_hours_start?: string;
    business_hours_end?: string;
    appointment_duration_minutes?: number;
    business_days?: string;
    timezone?: string;
  }, preferences?: FollowUpPreferences) {
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        follow_up_preferences: preferences ?? DEFAULT_FOLLOW_UP_PREFERENCES,
        confirmation_call_enabled: preferences?.confirm_appointments_by_phone ?? true,
        feedback_enabled: preferences
          ? preferences.confirm_appointments_by_phone && preferences.collect_feedback_after_confirmation
          : true,
      }),
    });
    const data = (await response.json()) as AgentResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Failed to create agent.");
    }

    setCreatedAgent(data);
    setFollowUpPreferences(DEFAULT_FOLLOW_UP_PREFERENCES);
    setBusinessName("");
    setIndustry("");
    setAgentName("");
    setAgentPurpose("general_receptionist");
    setBusinessKnowledge("");
    setBusinessHoursStart(DEFAULT_BUSINESS_HOURS_START);
    setBusinessHoursEnd(DEFAULT_BUSINESS_HOURS_END);
    setAppointmentDurationMinutes(DEFAULT_APPOINTMENT_DURATION_MINUTES);
    setBusinessDays(DEFAULT_BUSINESS_DAYS);
    setTimezone("Asia/Karachi");
    setHasGeneratedConfig(false);
    setBusinessDescription("");
  }

  function getSimpleBusinessKnowledge(): string {
    return [
      businessKnowledge.trim(),
      businessHoursStart.trim() || businessHoursEnd.trim()
        ? `Business hours: ${businessHoursStart.trim() || "Not specified"} to ${
            businessHoursEnd.trim() || "Not specified"
          }.`
        : null,
      timezone.trim() ? `Timezone: ${timezone.trim()}.` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function getBusinessDaysValue(): string {
    return BUSINESS_DAY_OPTIONS.filter((day) => businessDays.includes(day.value))
      .map((day) => day.value)
      .join(",");
  }

  function toggleBusinessDay(day: string, checked: boolean) {
    setBusinessDays((currentDays) => {
      if (checked) {
        return BUSINESS_DAY_OPTIONS.map((option) => option.value).filter(
          (value) => value === day || currentDays.includes(value),
        );
      }

      return currentDays.filter((value) => value !== day);
    });
  }

  function renderSchedulingFields(idPrefix: string) {
    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium"
              htmlFor={`${idPrefix}-business-hours-start`}
            >
              Opens
            </label>
            <input
              id={`${idPrefix}-business-hours-start`}
              className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
              type="time"
              value={businessHoursStart}
              onChange={(event) => setBusinessHoursStart(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium"
              htmlFor={`${idPrefix}-business-hours-end`}
            >
              Closes
            </label>
            <input
              id={`${idPrefix}-business-hours-end`}
              className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
              type="time"
              value={businessHoursEnd}
              onChange={(event) => setBusinessHoursEnd(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium"
              htmlFor={`${idPrefix}-appointment-duration`}
            >
              Appointment length
            </label>
            <input
              id={`${idPrefix}-appointment-duration`}
              className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
              min={1}
              max={480}
              step={15}
              type="number"
              value={appointmentDurationMinutes}
              onChange={(event) =>
                setAppointmentDurationMinutes(Number(event.target.value))
              }
            />
          </div>
        </div>

        <fieldset className="rounded-md border border-[#E2D8DE] p-3">
          <legend className="px-1 text-sm font-medium">Business days</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {BUSINESS_DAY_OPTIONS.map((day) => (
              <label
                className="inline-flex items-center gap-2 rounded-md border border-[#E2D8DE] bg-white px-3 py-2 text-sm text-[#1C1A1E]"
                key={day.value}
              >
                <input
                  checked={businessDays.includes(day.value)}
                  className="h-4 w-4 accent-[#7B4764]"
                  type="checkbox"
                  value={day.value}
                  onChange={(event) =>
                    toggleBusinessDay(day.value, event.target.checked)
                  }
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  async function handleConfigureAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfigurationError(null);
    setError(null);
    setCreatedAgent(null);
    setCopyStatus(null);

    const trimmedDescription = businessDescription.trim();

    if (!trimmedDescription) {
      setConfigurationError("Tell us about your business first.");
      return;
    }

    setIsConfiguring(true);

    try {
      const response = await fetch("/api/agents/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmedDescription,
          follow_up_preferences: followUpPreferences,
        }),
      });
      const data = (await response.json()) as AgentConfigResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to configure agent.");
      }

      setBusinessName(data.business_name);
      setIndustry(data.industry);
      setAgentName(data.name);
      setAgentPurpose(data.agent_purpose);
      setBusinessKnowledge(data.business_knowledge);
      setBusinessHoursStart(data.business_hours_start);
      setBusinessHoursEnd(data.business_hours_end);
      setTimezone(data.timezone);
      setFollowUpPreferences(data.follow_up_preferences);
      setHasGeneratedConfig(true);
    } catch (err) {
      setConfigurationError(
        err instanceof Error ? err.message : "Failed to configure agent.",
      );
    } finally {
      setIsConfiguring(false);
    }
  }

  async function handleSimpleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfigurationError(null);
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
      await submitAgent({
        business_name: trimmedBusinessName,
        industry: trimmedIndustry,
        name: trimmedAgentName,
        agent_purpose: agentPurpose,
        business_knowledge: getSimpleBusinessKnowledge(),
        business_hours_start:
          businessHoursStart.trim() || DEFAULT_BUSINESS_HOURS_START,
        business_hours_end: businessHoursEnd.trim() || DEFAULT_BUSINESS_HOURS_END,
        appointment_duration_minutes: appointmentDurationMinutes,
        business_days: getBusinessDaysValue(),
        timezone: timezone.trim(),
      }, followUpPreferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
      await submitAgent({
        business_name: trimmedBusinessName,
        industry: trimmedIndustry,
        name: trimmedAgentName,
        agent_purpose: agentPurpose,
        business_knowledge: trimmedBusinessKnowledge,
        business_hours_start:
          businessHoursStart.trim() || DEFAULT_BUSINESS_HOURS_START,
        business_hours_end: businessHoursEnd.trim() || DEFAULT_BUSINESS_HOURS_END,
        appointment_duration_minutes: appointmentDurationMinutes,
        business_days: getBusinessDaysValue(),
        timezone: timezone.trim(),
      });
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

  function selectCreationMode(mode: CreationMode, shouldFocus = false) {
    setCreationMode(mode);

    if (shouldFocus) {
      requestAnimationFrame(() => {
        const selectedRef =
          mode === "simple" ? simpleModeRef : advancedModeRef;

        selectedRef.current?.focus();
      });
    }
  }

  function handleCreationModeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectCreationMode(
        creationMode === "simple" ? "advanced" : "simple",
        true,
      );
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectCreationMode(
        creationMode === "simple" ? "advanced" : "simple",
        true,
      );
    }

    if (event.key === "Home") {
      event.preventDefault();
      selectCreationMode("simple", true);
    }

    if (event.key === "End") {
      event.preventDefault();
      selectCreationMode("advanced", true);
    }
  }

  return (
    <main className="min-h-screen bg-[#F5EFF2] text-[#1C1A1E]">
      <section className="bg-[#F5EFF2]">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-8">
          <nav className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link className="text-lg font-semibold text-[#1C1A1E]" href="/">
              AI Front Desk
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex rounded-md px-4 py-2 text-sm font-medium text-[#655568] hover:bg-[#F5EAF0] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2"
                href="/dashboard"
              >
                Dashboard
              </Link>
              <Link
                className="inline-flex rounded-md bg-[#241F24] px-4 py-2 text-sm font-medium text-white hover:bg-[#332A32] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2"
                href="/demo"
              >
                Start voice demo
              </Link>
            </div>
          </nav>

          <div className="grid gap-10 py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(30rem,1fr)] lg:items-center lg:py-20">
            <div className="max-w-xl">
              <p className="text-sm font-medium text-[#7B4764]">
                AssemblyAI powers the real-time voice layer
              </p>
              <h1 className="mt-5 max-w-[16ch] text-5xl font-semibold leading-[1.04] text-[#1C1A1E] sm:max-w-[17ch] sm:text-[3.5rem]">
                Turn missed calls into booked customers.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#655568]">
                AI Front Desk answers calls, captures the lead, runs the
                confirmation path for bookings, and keeps the outcome visible in
                your dashboard.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  className="inline-flex w-fit rounded-md bg-[#7B4764] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,71,100,0.22)] hover:bg-[#6D3E58] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2"
                  href="#create-agent"
                >
                  Describe your business
                </a>
                <Link
                  className="inline-flex w-fit rounded-md px-5 py-3 text-sm font-medium text-[#655568] hover:bg-[#F5EAF0] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2"
                  href="/dashboard"
                >
                  View dashboard
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-4 top-8 hidden h-24 w-px bg-[#D7B9C9] lg:block" />
              <div className="bg-white p-4 shadow-[0_24px_70px_rgba(28,26,30,0.12)] ring-1 ring-[#E2D8DE] sm:p-5">
                <div className="flex items-center justify-between border-b border-[#E2D8DE] pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#655568]">
                      Live call outcome
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1C1A1E]">
                      Customer conversation becomes a booking record
                    </p>
                  </div>
                  <span className="rounded-md bg-[#EDF5EF] px-2.5 py-1 text-xs font-semibold text-[#416B4A] ring-1 ring-[#C7DBC9]">
                    Saved
                  </span>
                </div>

                <div className="grid gap-5 py-5 md:grid-cols-[1fr_0.92fr]">
                  <div className="space-y-3 border-b border-[#E2D8DE] pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-5">
                    <p className="text-xs font-semibold uppercase text-[#655568]">
                      Conversation
                    </p>
                    <div className="max-w-[17rem] rounded-md rounded-bl-sm bg-[#F5EFF2] px-3.5 py-2.5 text-sm leading-6 text-[#655568]">
                      Do you have a dental checkup slot this Friday afternoon?
                    </div>
                    <div className="ml-auto max-w-[17rem] rounded-md rounded-br-sm bg-[#241F24] px-3.5 py-2.5 text-sm leading-6 text-white shadow-[0_10px_24px_rgba(28,26,30,0.20)]">
                      Yes. I can take your details and pass this into booking
                      confirmation.
                    </div>
                    <div className="max-w-[17rem] rounded-md rounded-bl-sm bg-[#F5EFF2] px-3.5 py-2.5 text-sm leading-6 text-[#655568]">
                      Maya Khan, 0300-555-0142. Friday after lunch works.
                    </div>
                  </div>

                  <div className="bg-[#F5EFF2] p-4 ring-1 ring-[#E2D8DE]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-[#655568]">
                        Captured lead
                      </p>
                      <span className="text-xs font-semibold text-[#416B4A]">
                        Structured
                      </span>
                    </div>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["Customer", "Maya Khan"],
                        ["Phone", "0300-555-0142"],
                        ["Request", "Dental checkup"],
                        ["Preferred time", "Friday afternoon"],
                      ].map(([label, value]) => (
                        <div
                          className="flex items-start justify-between gap-4 border-b border-[#E2D8DE] pb-2.5 last:border-0 last:pb-0"
                          key={label}
                        >
                          <dt className="text-[#655568]">{label}</dt>
                          <dd className="text-right font-medium text-[#1C1A1E]">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                <div className="grid gap-3 border-t border-[#E2D8DE] pt-4 sm:grid-cols-3">
                  <div className="px-3 py-2.5 ring-1 ring-[#E8D2A7]">
                    <p className="text-xs font-semibold uppercase text-[#655568]">
                      Confirmation
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#8A5A18]">
                      Pending follow-up
                    </p>
                  </div>
                  <div className="bg-[#EDF5EF] px-3 py-2.5 ring-1 ring-[#C7DBC9]">
                    <p className="text-xs font-semibold uppercase text-[#655568]">
                      Booking
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#416B4A]">
                      Confirmed · BK-8274
                    </p>
                  </div>
                  <div className="px-3 py-2.5 ring-1 ring-[#E2D8DE]">
                    <p className="text-xs font-semibold uppercase text-[#655568]">
                      Feedback
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1C1A1E]">
                      Waiting after visit
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-y border-[#E2D8DE] py-5">
            <ol className="grid gap-3 text-sm font-semibold text-[#1C1A1E] sm:grid-cols-5 sm:gap-0">
              {WORKFLOW_STEPS.map((step, index) => (
                <li className="flex items-center gap-3 sm:gap-0" key={step}>
                  <span className="flex items-center gap-3 sm:flex-1">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                        index === 0
                          ? "bg-[#7B4764] text-white"
                          : "bg-[#F5EAF0] text-[#7B4764] ring-1 ring-[#E2D8DE]"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </span>
                  {index < WORKFLOW_STEPS.length - 1 ? (
                    <span className="hidden h-px flex-1 bg-[#E2D8DE] sm:block" />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:px-8 lg:py-20"
        id="create-agent"
      >
        <div>
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase text-[#655568]">
              Create the voice agent
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#1C1A1E] sm:text-4xl">
              Start with a business description.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#655568]">
              Owners can describe services, hours, and booking rules in plain
              language. Advanced setup stays available for manual configuration.
            </p>
          </div>

          <div
            aria-label="Agent creation mode"
            className="mt-8 grid gap-2 bg-white p-1.5 shadow-[0_12px_34px_rgba(28,26,30,0.06)] ring-1 ring-[#E2D8DE] sm:grid-cols-2"
            onKeyDown={handleCreationModeKeyDown}
            role="radiogroup"
          >
            <button
              aria-checked={creationMode === "simple"}
              className={`rounded-md p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2 ${
                creationMode === "simple"
                  ? "bg-[#7B4764] text-white shadow-[0_10px_26px_rgba(123,71,100,0.22)]"
                  : "bg-transparent text-[#1C1A1E] hover:bg-[#F5EAF0]"
              }`}
              onClick={() => selectCreationMode("simple")}
              ref={simpleModeRef}
              role="radio"
              tabIndex={creationMode === "simple" ? 0 : -1}
              type="button"
            >
              <span
                className={`text-xs font-semibold uppercase ${
                  creationMode === "simple" ? "text-[#F5EAF0]" : "text-[#7B4764]"
                }`}
              >
                Recommended
              </span>
              <span className="mt-3 block text-xl font-semibold">
                Simple
              </span>
              <span
                className={`mt-2 block text-sm leading-6 ${
                  creationMode === "simple" ? "text-[#F5EAF0]" : "text-[#655568]"
                }`}
              >
                Describe the business first, then review the generated setup.
              </span>
            </button>

            <button
              aria-checked={creationMode === "advanced"}
              className={`rounded-md p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2 ${
                creationMode === "advanced"
                  ? "bg-[#7B4764] text-white shadow-[0_10px_26px_rgba(123,71,100,0.22)]"
                  : "bg-transparent text-[#1C1A1E] hover:bg-[#F5EAF0]"
              }`}
              onClick={() => selectCreationMode("advanced")}
              ref={advancedModeRef}
              role="radio"
              tabIndex={creationMode === "advanced" ? 0 : -1}
              type="button"
            >
              <span
                className={`text-xs font-semibold uppercase ${
                  creationMode === "advanced" ? "text-[#F5EAF0]" : "text-[#655568]"
                }`}
              >
                Manual control
              </span>
              <span className="mt-3 block text-xl font-semibold">
                Advanced
              </span>
              <span
                className={`mt-2 block text-sm leading-6 ${
                  creationMode === "advanced" ? "text-[#F5EAF0]" : "text-[#655568]"
                }`}
              >
                Fill in the agent name, purpose, and knowledge yourself.
              </span>
            </button>
          </div>

          {creationMode === "simple" ? (
            <div className="mt-8 flex flex-col gap-6">
              <form
                className="bg-white p-6 shadow-[0_16px_45px_rgba(28,26,30,0.08)] ring-1 ring-[#E2D8DE]"
                onSubmit={handleConfigureAgent}
              >
                <label
                  className="text-sm font-medium text-[#1C1A1E]"
                  htmlFor="business-description"
                >
                  Tell us about your business
                </label>
                <textarea
                  id="business-description"
                  className="mt-3 min-h-44 w-full resize-y rounded-md border border-[#E2D8DE] bg-white px-3 py-3 text-sm leading-6 text-[#1C1A1E] outline-none placeholder:text-[#655568] focus:border-[#7B4764]"
                  placeholder="I run a dental clinic in Karachi. We are open from 9 AM to 6 PM. I want the receptionist to answer common questions, capture appointment requests, explain our clinic hours, and make sure patient details are confirmed before booking."
                  value={businessDescription}
                  onChange={(event) => setBusinessDescription(event.target.value)}
                />
                <fieldset className="mt-5 border-t border-[#E2D8DE] pt-4" disabled={isConfiguring || isSubmitting}>
                  <legend className="float-left w-full text-sm font-semibold text-[#1C1A1E]">
                    Follow-up preferences
                  </legend>
                  <p className="clear-both pt-1 text-sm text-[#655568]">
                    Choose what should happen after a customer’s first call.
                  </p>
                  <div className="mt-3 divide-y divide-[#E2D8DE]">
                    {[
                      {
                        key: "confirm_appointments_by_phone" as const,
                        label: "Confirm appointments by phone",
                        description: "Place a short follow-up call to confirm the booking details.",
                        disabled: false,
                      },
                      {
                        key: "collect_feedback_after_confirmation" as const,
                        label: "Collect feedback after confirmation",
                        description: "Ask the customer for a quick rating before ending the follow-up call.",
                        disabled: !followUpPreferences.confirm_appointments_by_phone,
                      },
                    ].map((preference) => (
                      <label
                        key={preference.key}
                        className={`flex min-h-16 items-center justify-between gap-4 py-3 ${preference.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <span className="min-w-0">
                          <span id={`${preference.key}-label`} className="block text-sm font-medium text-[#1C1A1E]">
                            {preference.label}
                          </span>
                          <span id={`${preference.key}-description`} className="mt-1 block text-xs leading-5 text-[#655568]">
                            {preference.description}
                          </span>
                        </span>
                        <span className="relative shrink-0">
                          <input
                            type="checkbox"
                            role="switch"
                            className="peer sr-only"
                            aria-labelledby={`${preference.key}-label`}
                            aria-describedby={`${preference.key}-description`}
                            checked={followUpPreferences[preference.key]}
                            disabled={preference.disabled}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setFollowUpPreferences((current) => preference.key === "confirm_appointments_by_phone"
                                ? {
                                    confirm_appointments_by_phone: checked,
                                    collect_feedback_after_confirmation: checked && current.collect_feedback_after_confirmation,
                                  }
                                : { ...current, collect_feedback_after_confirmation: current.confirm_appointments_by_phone && checked });
                            }}
                          />
                          <span aria-hidden="true" className="block h-6 w-11 rounded-full bg-[#B9ADB5] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#7B4764] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#7B4764] peer-focus-visible:ring-offset-2" />
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xl text-sm leading-6 text-[#655568]">
                    The app creates an editable configuration first. The live
                    voice agent is created only after review.
                  </p>
                  <button
                    className="inline-flex w-fit whitespace-nowrap rounded-md bg-[#7B4764] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,71,100,0.20)] hover:bg-[#6D3E58] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#B9ADB5] disabled:shadow-none"
                    disabled={isConfiguring}
                    type="submit"
                  >
                    {isConfiguring ? "Configuring..." : "Configure agent"}
                  </button>
                </div>
                {configurationError ? (
                  <div className="mt-4 rounded-md border border-[#E7C2C2] bg-[#FDF0F0] p-3 text-sm text-[#9F3A3A]">
                    {configurationError}
                  </div>
                ) : null}
              </form>

              {hasGeneratedConfig ? (
                <form
                  className="bg-white p-6 shadow-[0_16px_45px_rgba(28,26,30,0.08)] ring-1 ring-[#E2D8DE]"
                  onSubmit={handleSimpleSubmit}
                >
                  <div>
                    <h3 className="text-base font-semibold">
                      Review generated configuration
                    </h3>
                    <p className="mt-1 text-sm text-[#655568]">
                      Edit anything before creating the live voice agent.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="simple-business-name"
                      >
                        Business name
                      </label>
                      <input
                        id="simple-business-name"
                        className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
                        required
                        type="text"
                        value={businessName}
                        onChange={(event) => setBusinessName(event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="simple-industry"
                      >
                        Industry
                      </label>
                      <input
                        id="simple-industry"
                        className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
                        type="text"
                        value={industry}
                        onChange={(event) => setIndustry(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="simple-agent-name"
                      >
                        Agent name
                      </label>
                      <input
                        id="simple-agent-name"
                        className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
                        required
                        type="text"
                        value={agentName}
                        onChange={(event) => setAgentName(event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="simple-agent-purpose"
                      >
                        Agent purpose
                      </label>
                      <select
                        id="simple-agent-purpose"
                        className="rounded-md border border-[#E2D8DE] bg-white px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
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
                  </div>

                  {renderSchedulingFields("simple")}

                  <div className="mt-4 flex flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="timezone">
                      Timezone
                    </label>
                    <input
                      id="timezone"
                      className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
                      type="text"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="simple-business-knowledge"
                    >
                      Business knowledge
                    </label>
                    <textarea
                      id="simple-business-knowledge"
                      className="min-h-36 resize-y rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
                      value={businessKnowledge}
                      onChange={(event) =>
                        setBusinessKnowledge(event.target.value)
                      }
                    />
                  </div>

                  {error ? (
                    <div className="mt-4 rounded-md border border-[#E7C2C2] bg-[#FDF0F0] p-3 text-sm text-[#9F3A3A]">
                      {error}
                    </div>
                  ) : null}

                  <button
                    className="mt-5 w-fit rounded-md bg-[#7B4764] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,71,100,0.20)] hover:bg-[#6D3E58] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#B9ADB5] disabled:shadow-none"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "Creating..." : "Create agent"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <form
              className="mt-8 bg-white p-6 shadow-[0_16px_45px_rgba(28,26,30,0.08)] ring-1 ring-[#E2D8DE]"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="business-name">
                    Business name
                  </label>
                  <input
                    id="business-name"
                    className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
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
                    className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none placeholder:text-[#655568] focus:border-[#7B4764]"
                    placeholder="e.g. salon, dental, restaurant, general"
                    type="text"
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="agent-name">
                    Agent name
                  </label>
                  <input
                    id="agent-name"
                    className="rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none placeholder:text-[#655568] focus:border-[#7B4764]"
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
                    className="rounded-md border border-[#E2D8DE] bg-white px-3 py-2 text-sm text-[#1C1A1E] outline-none focus:border-[#7B4764]"
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
              </div>

              {renderSchedulingFields("advanced")}

              <div className="mt-4 flex flex-col gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="business-knowledge"
                >
                  Business knowledge
                </label>
                <textarea
                  id="business-knowledge"
                  className="min-h-36 resize-y rounded-md border border-[#E2D8DE] px-3 py-2 text-sm text-[#1C1A1E] outline-none placeholder:text-[#655568] focus:border-[#7B4764]"
                  placeholder="Products, services, FAQs, policies, pricing notes, support steps, or anything the agent should know."
                  value={businessKnowledge}
                  onChange={(event) => setBusinessKnowledge(event.target.value)}
                />
              </div>

              {error ? (
                <div className="mt-4 rounded-md border border-[#E7C2C2] bg-[#FDF0F0] p-3 text-sm text-[#9F3A3A]">
                  {error}
                </div>
              ) : null}

              <button
                className="mt-5 w-fit rounded-md bg-[#7B4764] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,71,100,0.20)] hover:bg-[#6D3E58] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#B9ADB5] disabled:shadow-none"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Creating..." : "Create agent"}
              </button>
            </form>
          )}
        </div>

        <aside className="lg:pt-24">
          <div className="sticky top-8 bg-white p-6 shadow-[0_18px_55px_rgba(28,26,30,0.10)] ring-1 ring-[#E2D8DE]">
            <div className="h-1 w-16 bg-[#7B4764]" />
            <p className="mt-5 text-xs font-semibold uppercase text-[#655568]">
              Product proof
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#1C1A1E]">
              One saved lifecycle, not a voice demo.
            </h2>
            <div className="mt-6 space-y-4">
              {DASHBOARD_PREVIEW.map((item, index) => (
                <div className="flex gap-4" key={item.label}>
                  <div className="flex flex-col items-center">
                    <span
                      className={`h-3 w-3 rounded-full ${
                        index === 1 ? "bg-[#D6A354]" : "bg-[#6E9475]"
                      }`}
                    />
                    {index < DASHBOARD_PREVIEW.length - 1 ? (
                      <span className="mt-2 h-full w-px bg-[#E2D8DE]" />
                    ) : null}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-semibold text-[#1C1A1E]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#655568]">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              className="mt-6 inline-flex w-fit rounded-md border border-[#E2D8DE] bg-white px-4 py-2 text-sm font-medium text-[#1C1A1E] hover:bg-[#F5EAF0] focus:outline-none focus:ring-2 focus:ring-[#7B4764] focus:ring-offset-2"
              href="/dashboard"
            >
              Open dashboard
            </Link>
          </div>
        </aside>

        {createdAgent ? (
          <section className="bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#655568]">
              Agent created
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-[#655568]">
                  Business
                </div>
                <p className="mt-1 text-sm text-[#1C1A1E]">
                  {createdAgent.business_name ?? "Not recorded"}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-[#655568]">
                  Agent name
                </div>
                <p className="mt-1 text-sm text-[#1C1A1E]">
                  {createdAgent.name ?? "Not recorded"}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-[#655568]">
                  Purpose
                </div>
                <p className="mt-1 text-sm text-[#1C1A1E]">
                  {formatPurpose(createdAgent.agent_purpose)}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-[#655568]">
                  Knowledge
                </div>
                <p className="mt-1 line-clamp-3 text-sm text-[#1C1A1E]">
                  {createdAgent.business_knowledge ?? "No knowledge provided"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase text-[#655568]"
                htmlFor="created-agent-id"
              >
                AssemblyAI agent ID
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="created-agent-id"
                  className="min-w-0 flex-1 rounded-md border border-[#E2D8DE] px-3 py-2 font-mono text-sm text-[#1C1A1E]"
                  readOnly
                  value={createdAgent.assemblyai_agent_id ?? ""}
                />
                <button
                  className="w-fit rounded-md border border-[#E2D8DE] px-4 py-2 text-sm font-medium text-[#1C1A1E]"
                  onClick={copyAgentId}
                  type="button"
                >
                  Copy
                </button>
              </div>
              {copyStatus ? (
                <p className="text-sm text-[#655568]">{copyStatus}</p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex w-fit rounded-md bg-[#7B4764] px-4 py-2 text-sm font-medium text-white"
                href={`/demo?agent_id=${encodeURIComponent(createdAgent.assemblyai_agent_id ?? "")}`}
              >
                Start test call
              </Link>
              <Link
                className="inline-flex w-fit rounded-md border border-[#E2D8DE] px-4 py-2 text-sm font-medium text-[#1C1A1E]"
                href="/dashboard"
              >
                View dashboard
              </Link>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
