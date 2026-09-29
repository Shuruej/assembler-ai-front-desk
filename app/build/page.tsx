"use client";

import { VoicePicker } from "@/components/assembler/VoicePicker";
import { savedVoiceId, type VoiceId } from "@/lib/assemblyai/voices";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";
import type { AgentBlueprint } from "@/lib/assembler/blueprint";
import { STARTER_WORKFLOWS, type StarterId } from "@/lib/assembler/compiler";
import {
  DEFAULT_FOLLOW_UP_PREFERENCES,
  type FollowUpPreferences,
} from "@/lib/follow-up-preferences";

type CreationMode = "simple" | "advanced";

type CreatedAgent = {
  id?: string;
  blueprint?: AgentBlueprint | null;
  confirmation_call_enabled?: boolean;
  feedback_enabled?: boolean;
  business_name?: string | null;
  agent_purpose?: string | null;
  business_knowledge?: string | null;
  name?: string | null;
  assemblyai_agent_id?: string | null;
};

type AgentResponse = CreatedAgent & { error?: string };
type BlueprintResponse = { blueprint?: AgentBlueprint; error?: string };

const STARTER_ICONS: Record<StarterId, string> = {
  auto_repair: "/assembler/icons/starters/auto-repair.png",
  ecommerce: "/assembler/icons/starters/ecommerce-support.png",
  real_estate: "/assembler/icons/starters/real-estate.png",
  restaurant: "/assembler/icons/starters/restaurant.png",
  it_helpdesk: "/assembler/icons/starters/it-helpdesk.png",
  property_management: "/assembler/icons/starters/property-management.png",
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

const BUILD_STEPS = [
  {
    number: "01",
    title: "Describe",
    detail: "Explain the workflow in the language your team already uses.",
  },
  {
    number: "02",
    title: "Review",
    detail: "Check the blueprint's identity, data, tools, rules, and workflow.",
  },
  {
    number: "03",
    title: "Test",
    detail: "Run a browser call, then inspect actions and outcomes in Agent Studio.",
  },
];

const FOLLOW_UP_OPTIONS = [
  {
    key: "confirm_appointments_by_phone" as const,
    label: "Confirm appointments by phone",
    description: "Place a short follow-up call to confirm booking details.",
  },
  {
    key: "collect_feedback_after_confirmation" as const,
    label: "Collect feedback after confirmation",
    description: "Ask for a quick rating before ending the follow-up call.",
  },
];

function formatPurpose(value?: string | null): string {
  return (
    AGENT_PURPOSE_OPTIONS.find((purpose) => purpose.value === value)?.label ??
    "General receptionist"
  );
}

export default function Home() {
  const simpleModeRef = useRef<HTMLButtonElement>(null);
  const advancedModeRef = useRef<HTMLButtonElement>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>("simple");
  const [businessDescription, setBusinessDescription] = useState("");
  const [selectedStarterId, setSelectedStarterId] = useState<StarterId | null>(null);
  const [followUpPreferences, setFollowUpPreferences] =
    useState<FollowUpPreferences>(DEFAULT_FOLLOW_UP_PREFERENCES);
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
  const [blueprint, setBlueprint] = useState<AgentBlueprint | null>(null);
  const [blueprintIntent, setBlueprintIntent] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [voiceId, setVoiceId] = useState<VoiceId>("alba");
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

  async function submitAgent(
    payload: {
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
    },
    preferences?: FollowUpPreferences,
  ) {
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        voice_id: voiceId,
        ...(creationMode === "simple" && blueprint && blueprintIntent === businessDescription.trim() ? { blueprint: { ...blueprint, voice_id: voiceId, identity: { ...blueprint.identity, name: payload.name } } } : {}),
        follow_up_preferences: preferences ?? DEFAULT_FOLLOW_UP_PREFERENCES,
        confirmation_call_enabled:
          preferences?.confirm_appointments_by_phone ?? true,
        feedback_enabled: preferences
          ? preferences.confirm_appointments_by_phone &&
            preferences.collect_feedback_after_confirmation
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
    setVoiceId("alba");
    setAgentPurpose("general_receptionist");
    setBusinessKnowledge("");
    setBusinessHoursStart(DEFAULT_BUSINESS_HOURS_START);
    setBusinessHoursEnd(DEFAULT_BUSINESS_HOURS_END);
    setAppointmentDurationMinutes(DEFAULT_APPOINTMENT_DURATION_MINUTES);
    setBusinessDays(DEFAULT_BUSINESS_DAYS);
    setTimezone("Asia/Karachi");
    setHasGeneratedConfig(false);
    setBlueprint(null);
    setBlueprintIntent("");
    setBusinessDescription("");
    setSelectedStarterId(null);
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
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="assembler-field" htmlFor={`${idPrefix}-business-hours-start`}>
            <span>Opens</span>
            <input
              id={`${idPrefix}-business-hours-start`}
              className="assembler-input"
              type="time"
              value={businessHoursStart}
              onChange={(event) => setBusinessHoursStart(event.target.value)}
            />
          </label>
          <label className="assembler-field" htmlFor={`${idPrefix}-business-hours-end`}>
            <span>Closes</span>
            <input
              id={`${idPrefix}-business-hours-end`}
              className="assembler-input"
              type="time"
              value={businessHoursEnd}
              onChange={(event) => setBusinessHoursEnd(event.target.value)}
            />
          </label>
          <label className="assembler-field" htmlFor={`${idPrefix}-appointment-duration`}>
            <span>Appointment length</span>
            <input
              id={`${idPrefix}-appointment-duration`}
              className="assembler-input"
              min={1}
              max={480}
              step={15}
              type="number"
              value={appointmentDurationMinutes}
              onChange={(event) =>
                setAppointmentDurationMinutes(Number(event.target.value))
              }
            />
          </label>
        </div>

        <fieldset className="rounded-xl border border-[#DDE1E8] bg-[#FAFBFC] p-3">
          <legend className="px-1 text-sm font-medium text-[#282C34]">
            Business days
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {BUSINESS_DAY_OPTIONS.map((day) => (
              <label
                className="inline-flex items-center gap-2 rounded-lg border border-[#DDE1E8] bg-white px-3 py-2 text-sm text-[#282C34] transition hover:border-[#AEB7C5]"
                key={day.value}
              >
                <input
                  checked={businessDays.includes(day.value)}
                  className="h-4 w-4 accent-[#1769FF]"
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
    if (trimmedDescription.length < 20 || trimmedDescription.length > 5000) {
      setConfigurationError("Describe the agent in 20 to 5,000 characters.");
      return;
    }

    setIsConfiguring(true);
    try {
      const response = await fetch("/api/agents/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: trimmedDescription, starterId: selectedStarterId }),
      });
      const data = (await response.json()) as BlueprintResponse;

      if (!response.ok || !data.blueprint) throw new Error(data.error ?? "Could not assemble the blueprint. Please retry.");
      setBlueprint(data.blueprint);
      setVoiceId(savedVoiceId({ blueprint: data.blueprint }));
      setBlueprintIntent(trimmedDescription);
      setHasGeneratedConfig(false);
    } catch (err) {
      setConfigurationError(
        err instanceof Error ? err.message : "Could not assemble the blueprint. Please retry.",
      );
    } finally {
      setIsConfiguring(false);
    }
  }

  function openCompatibleCreation() {
    if (!blueprint || blueprintIntent !== businessDescription.trim()) return;
    setAgentName(blueprint.identity.name);
    setIndustry(({ auto_repair: "Auto repair", ecommerce: "Ecommerce", real_estate: "Real estate", restaurant: "Restaurant", it_helpdesk: "IT support", property_management: "Property management" } as Record<string, string>)[selectedStarterId ?? ""] ?? "");
    setAgentPurpose(({ auto_repair: "appointment_booking", ecommerce: "customer_support", real_estate: "lead_qualification", restaurant: "appointment_booking", it_helpdesk: "customer_support", property_management: "customer_support" } as Record<string, string>)[selectedStarterId ?? ""] ?? "general_receptionist");
    setHasGeneratedConfig(true);
    setError(null);
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
      await submitAgent(
        {
          business_name: trimmedBusinessName,
          industry: trimmedIndustry,
          name: trimmedAgentName,
          agent_purpose: agentPurpose,
          business_knowledge: getSimpleBusinessKnowledge(),
          business_hours_start:
            businessHoursStart.trim() || DEFAULT_BUSINESS_HOURS_START,
          business_hours_end:
            businessHoursEnd.trim() || DEFAULT_BUSINESS_HOURS_END,
          appointment_duration_minutes: appointmentDurationMinutes,
          business_days: getBusinessDaysValue(),
          timezone: timezone.trim(),
        },
        followUpPreferences,
      );
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
        business_hours_end:
          businessHoursEnd.trim() || DEFAULT_BUSINESS_HOURS_END,
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
        (mode === "simple" ? simpleModeRef : advancedModeRef).current?.focus();
      });
    }
  }

  function handleCreationModeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp"
    ) {
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

  function renderCoreFields(prefix: "simple" | "advanced") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="assembler-field" htmlFor={`${prefix}-business-name`}>
            <span>Business name</span>
            <input
              id={`${prefix}-business-name`}
              className="assembler-input"
              required
              type="text"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </label>
          <label className="assembler-field" htmlFor={`${prefix}-industry`}>
            <span>Industry</span>
            <input
              id={`${prefix}-industry`}
              className="assembler-input"
              placeholder="e.g. retail, property management, IT support"
              type="text"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
            />
          </label>
          <label className="assembler-field" htmlFor={`${prefix}-agent-name`}>
            <span>Agent name</span>
            <input
              id={`${prefix}-agent-name`}
              className="assembler-input"
              placeholder="e.g. Ava"
              required
              type="text"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
            />
          </label>
          <label className="assembler-field" htmlFor={`${prefix}-agent-purpose`}>
            <span>Agent purpose</span>
            <select
              id={`${prefix}-agent-purpose`}
              className="assembler-input bg-white"
              value={agentPurpose}
              onChange={(event) => setAgentPurpose(event.target.value)}
            >
              {AGENT_PURPOSE_OPTIONS.map((purpose) => (
                <option key={purpose.value} value={purpose.value}>
                  {purpose.label}
                </option>
              ))}
            </select>
          </label>
        </div>
          <VoicePicker value={voiceId} onChange={setVoiceId} disabled={isSubmitting} />
        {renderSchedulingFields(prefix)}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#17191D]">
      <header className="border-b border-[#E1E4E9] bg-white/95">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769FF] focus-visible:ring-offset-4"
            href="/"
          >
            <AssemblerLogo subtitle="Voice agent studio" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link className="assembler-nav-link" href="/dashboard">
              Dashboard
            </Link>
            <Link className="assembler-secondary-button" href="/demo">
              Test an agent
            </Link>
          </div>
        </nav>
      </header>

      <section className="assembler-grid border-b border-[#E1E4E9]">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1769FF]">
                Built on AssemblyAI
              </p>
              <h1 className="mt-3 max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-[3.75rem]">
                From business intent to working voice agents.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#5F6877] sm:text-lg sm:leading-8">
                Assembler turns a business workflow into a voice agent designed
                to answer questions, collect relevant details, use connected
                actions, and involve a person when needed.
              </p>
            </div>
            <div className="border-l-2 border-[#1769FF] pl-5">
              <p className="text-sm font-semibold text-[#282C34]">
                Describe the workflow. Assemble the agent.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#687080]">
                Start in plain language, review the operating details, then test
                the real voice experience.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-10"
        id="create-agent"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-col gap-5 border-b border-[#DDE1E8] pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#687080]">
                  New agent
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  {creationMode === "simple"
                    ? "Describe your agent"
                    : "Configure your agent"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687080]">
                  {creationMode === "simple"
                    ? "Start with the workflow in plain language, then review the generated setup."
                    : "Set the agent identity, operating schedule, and business knowledge directly."}
                </p>
              </div>
              <div
                aria-label="Agent creation mode"
                className="inline-flex w-fit rounded-xl border border-[#DDE1E8] bg-white p-1"
                onKeyDown={handleCreationModeKeyDown}
                role="radiogroup"
              >
                <button
                  aria-checked={creationMode === "simple"}
                  className={`assembler-mode-button ${
                    creationMode === "simple" ? "assembler-mode-button-active" : ""
                  }`}
                  onClick={() => selectCreationMode("simple")}
                  ref={simpleModeRef}
                  role="radio"
                  tabIndex={creationMode === "simple" ? 0 : -1}
                  type="button"
                >
                  Guided
                </button>
                <button
                  aria-checked={creationMode === "advanced"}
                  className={`assembler-mode-button ${
                    creationMode === "advanced" ? "assembler-mode-button-active" : ""
                  }`}
                  onClick={() => selectCreationMode("advanced")}
                  ref={advancedModeRef}
                  role="radio"
                  tabIndex={creationMode === "advanced" ? 0 : -1}
                  type="button"
                >
                  Manual
                </button>
              </div>
            </div>

            {creationMode === "simple" ? (
              <div className="mt-6 space-y-6">
                <section aria-labelledby="starter-title">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="starter-title" className="font-semibold">Starter Workflows</h3><p className="mt-1 text-sm text-[#687080]">Curated fields and actions; edit the description before review.</p></div><button className="assembler-primary-button" type="button" disabled={isConfiguring || isSubmitting} onClick={() => { setBusinessDescription(""); setSelectedStarterId(null); setAgentName(""); setBlueprint(null); setHasGeneratedConfig(false); setConfigurationError(null); document.getElementById("business-description")?.focus(); }}>Start from scratch</button></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{STARTER_WORKFLOWS.map((starter) => <button key={starter.id} type="button" disabled={isConfiguring || isSubmitting} aria-pressed={selectedStarterId === starter.id} className="starter-workflow" onClick={() => { setSelectedStarterId(starter.id); setBusinessDescription(starter.intent); setAgentName(""); setBlueprint(null); setFollowUpPreferences(starter.id === "auto_repair" || starter.id === "restaurant" ? DEFAULT_FOLLOW_UP_PREFERENCES : { confirm_appointments_by_phone: false, collect_feedback_after_confirmation: false }); setHasGeneratedConfig(false); setConfigurationError(null); document.getElementById("business-description")?.focus(); }}><img aria-hidden="true" alt="" src={STARTER_ICONS[starter.id]} className="h-10 w-10 shrink-0 object-contain" /><span className="min-w-0"><span className="block text-sm font-semibold">{starter.title}</span><span className="mt-1 block text-xs leading-5 text-[#687080]">{starter.description}</span></span></button>)}</div>
                </section>
                <form className="assembler-panel p-5 sm:p-7" onSubmit={handleConfigureAgent}>
                  <div className="flex items-center gap-3">
                    <span className="assembler-step-number">01</span>
                    <div>
                      <h3 className="font-semibold">Business intent</h3>
                      <p className="text-sm text-[#687080]">
                        Include caller goals, information to collect, actions, policies, and escalation triggers.
                      </p>
                    </div>
                  </div>
                  <label className="sr-only" htmlFor="business-description">
                    Describe the voice agent workflow
                  </label>
                  <textarea
                    id="business-description"
                    className="mt-5 min-h-56 w-full resize-y rounded-xl border border-[#C8CED8] bg-white px-4 py-4 text-base leading-7 text-[#17191D] outline-none transition placeholder:text-[#8B93A1] focus:border-[#1769FF] focus:ring-4 focus:ring-[#1769FF]/10 sm:min-h-64"
                    placeholder="Describe the work this agent should handle, what information it needs, the actions it should take, and when a person should step in."
                    value={businessDescription}
                    onChange={(event) => {
                      setBusinessDescription(event.target.value);
                      setHasGeneratedConfig(false);
                    }}
                  />



                  <fieldset
                    className="mt-6 border-t border-[#E1E4E9] pt-5"
                    disabled={isConfiguring || isSubmitting}
                  >
                    <legend className="float-left w-full text-sm font-semibold">
                      Follow-up behavior
                    </legend>
                    <p className="clear-both pt-1 text-sm text-[#687080]">
                      Choose what happens after the first call.
                    </p>
                    <div className="mt-3 divide-y divide-[#E8EBEF]">
                      {FOLLOW_UP_OPTIONS.map((preference) => {
                        const disabled =
                          preference.key === "collect_feedback_after_confirmation" &&
                          !followUpPreferences.confirm_appointments_by_phone;
                        return (
                          <label
                            className={`flex min-h-16 items-center justify-between gap-4 py-3 ${
                              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                            }`}
                            key={preference.key}
                          >
                            <span className="min-w-0">
                              <span
                                className="block text-sm font-medium"
                                id={`${preference.key}-label`}
                              >
                                {preference.label}
                              </span>
                              <span
                                className="mt-1 block text-xs leading-5 text-[#687080]"
                                id={`${preference.key}-description`}
                              >
                                {preference.description}
                              </span>
                            </span>
                            <span className="relative shrink-0">
                              <input
                                aria-describedby={`${preference.key}-description`}
                                aria-labelledby={`${preference.key}-label`}
                                checked={followUpPreferences[preference.key]}
                                className="peer sr-only"
                                disabled={disabled}
                                role="switch"
                                type="checkbox"
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setFollowUpPreferences((current) =>
                                    preference.key === "confirm_appointments_by_phone"
                                      ? {
                                          confirm_appointments_by_phone: checked,
                                          collect_feedback_after_confirmation:
                                            checked &&
                                            current.collect_feedback_after_confirmation,
                                        }
                                      : {
                                          ...current,
                                          collect_feedback_after_confirmation:
                                            current.confirm_appointments_by_phone && checked,
                                        },
                                  );
                                }}
                              />
                              <span
                                aria-hidden="true"
                                className="block h-6 w-11 rounded-full bg-[#B7BEC9] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#1769FF] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#1769FF] peer-focus-visible:ring-offset-2"
                              />
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="mt-6 flex flex-col gap-4 border-t border-[#E1E4E9] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-lg text-sm leading-6 text-[#687080]">
                      First review a blueprint. Blueprint tools and connections are plans, not active capabilities.
                    </p>
                    <button
                      className="assembler-primary-button"
                      disabled={isConfiguring}
                      type="submit"
                    >
                      {isConfiguring ? "Assembling blueprint..." : blueprint ? "Rebuild blueprint" : "Build blueprint"}
                    </button>
                  </div>
                  {configurationError ? (
                    <p className="assembler-error" role="alert">
                      {configurationError}
                    </p>
                  ) : null}
                </form>

                {isConfiguring ? (
                  <div aria-live="polite" className="assembler-panel border-l-4 border-[#1769FF] p-5 sm:p-7">
                    <p className="font-semibold">Assembling your workflow</p>
                    <p className="mt-2 text-sm leading-6 text-[#687080]">Building a local blueprint from your description and the selected starter configuration. Review the proposed fields and actions before creation.</p>
                  </div>
                ) : null}

                {blueprint ? (
                  <section aria-label="Blueprint review" className="assembler-panel space-y-6 p-5 sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E1E4E9] pb-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Blueprint ready · Not tested</p>
                        <h3 className="mt-2 text-2xl font-semibold">{blueprint.identity.name}</h3>
                        <p className="mt-1 text-sm text-[#687080]">{blueprint.identity.role}</p>
                      </div>
                      <a className="assembler-secondary-button" href="#business-description">Edit description</a>
                    </div>
                    {blueprintIntent !== businessDescription.trim() ? (
                      <p className="rounded-lg border border-[#F2D6A7] bg-[#FFF8E8] p-3 text-sm text-[#805A17]">Description changed. Rebuild the blueprint before continuing.</p>
                    ) : null}
                    <div>
                      <h4 className="font-semibold">Agent</h4>
                      <p className="mt-2 text-sm leading-6 text-[#414957]">{blueprint.objective}</p>
                      <p className="mt-2 rounded-lg bg-[#F5F7FA] p-3 text-sm italic leading-6 text-[#414957]">“{blueprint.greeting}”</p>
                      {blueprint.behavior.instructions.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#414957]">{blueprint.behavior.instructions.map((instruction, i) => <li key={i}>{instruction}</li>)}</ul> : null}
                    </div>
                    <div>
                      <h4 className="font-semibold">Knowledge needed</h4>
                      {blueprint.knowledge.requirements.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#414957]">{blueprint.knowledge.requirements.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-[#687080]">No additional knowledge specified.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Data</h4>
                      {blueprint.dataFields.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{blueprint.dataFields.map((field) => <div className="rounded-lg border border-[#E1E4E9] p-3" key={field.key}><p className="text-sm font-medium">{field.label}</p><p className="mt-1 text-xs text-[#687080]">{field.type} · {field.required ? "Required" : "Optional"}</p><p className="mt-2 text-sm text-[#414957]">{field.description}</p></div>)}</div> : <p className="mt-2 text-sm text-[#687080]">No structured fields needed.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Tools</h4>
                      {blueprint.tools.length ? <div className="mt-3 space-y-2">{blueprint.tools.map((tool) => <div className="rounded-lg border border-[#E1E4E9] p-3" key={tool.id}><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{tool.name}</p><span className="rounded bg-[#F0F5FF] px-2 py-0.5 text-xs text-[#0B4ED0]">{tool.kind.replaceAll("_", " ")}</span><span className="text-xs text-[#687080]">{tool.connectionId ? "Connection required" : "Planned capability"}</span></div><p className="mt-2 text-sm text-[#414957]">{tool.description}</p></div>)}</div> : <p className="mt-2 text-sm text-[#687080]">No actions planned.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Connections</h4>
                      {blueprint.connections.length ? <div className="mt-3 space-y-2">{blueprint.connections.map((connection) => <div className="rounded-lg border border-[#E1E4E9] p-3" key={connection.id}><p className="text-sm font-medium">{connection.name} <span className="font-normal text-[#687080]">· {connection.kind} · {connection.required ? "Required" : "Optional"}</span></p><p className="mt-1 text-sm text-[#414957]">{connection.reason}</p></div>)}</div> : <p className="mt-2 text-sm text-[#687080]">No external connection identified.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Rules</h4>
                      {blueprint.rules.length ? <ul className="mt-2 space-y-2">{blueprint.rules.map((rule) => <li className="rounded-lg bg-[#F5F7FA] p-3 text-sm text-[#414957]" key={rule.id}>{rule.description}<details className="mt-2 text-xs text-[#687080]"><summary className="cursor-pointer">Rule details</summary><span>If {rule.source} {rule.operator.replaceAll("_", " ")}{rule.value === null ? "" : ` ${String(rule.value)}`}, {rule.action.replaceAll("_", " ")}{rule.target ? ` ${rule.target.replaceAll("_", " ")}` : ""}.</span></details></li>)}</ul> : <p className="mt-2 text-sm text-[#687080]">No explicit rules identified.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Outcomes</h4>
                      {blueprint.outcomes.length ? <ul className="mt-2 space-y-2">{blueprint.outcomes.map((outcome) => <li className="text-sm text-[#414957]" key={outcome.id}><strong>{outcome.label}</strong> — {outcome.description}</li>)}</ul> : <p className="mt-2 text-sm text-[#687080]">No outcomes specified.</p>}
                    </div>
                    <div>
                      <h4 className="font-semibold">Workflow</h4>
                      {blueprint.workflow.length ? <ol className="mt-3 space-y-2 border-l-2 border-[#DDE7FF] pl-4">{blueprint.workflow.map((step, i) => <li className="relative rounded-lg bg-[#F5F7FA] p-3" key={step.id}><span className="text-xs font-semibold text-[#1769FF]">{String(i + 1).padStart(2, "0")} · {step.type}</span><p className="mt-1 text-sm font-medium">{step.label}</p><p className="mt-1 text-sm text-[#687080]">{step.description}</p></li>)}</ol> : <p className="mt-2 text-sm text-[#687080]">No workflow steps specified.</p>}
                    </div>
                    <VoicePicker value={voiceId} onChange={(voice) => { setVoiceId(voice); setBlueprint({ ...blueprint, voice_id: voice }); }} disabled={isSubmitting} />
                    <details className="border-t border-[#E1E4E9] pt-4"><summary className="cursor-pointer text-sm font-medium text-[#1769FF]">Advanced: blueprint JSON</summary><pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#101724] p-4 text-xs text-white">{JSON.stringify(blueprint, null, 2)}</pre></details>
                    <div className="border-t border-[#E1E4E9] pt-5">
                      <p className="text-sm leading-6 text-[#687080]">This blueprint is a design until you create the agent. Creation installs its approved voice tool contracts; external actions still need real connections. Review the business details before continuing.</p>
                      <button className="assembler-primary-button mt-4" disabled={blueprintIntent !== businessDescription.trim()} onClick={openCompatibleCreation} type="button">Configure blueprint agent</button>
                    </div>
                  </section>
                ) : null}

                {hasGeneratedConfig ? (
                  <form className="assembler-panel p-5 sm:p-7" onSubmit={handleSimpleSubmit}>
                    <div className="flex items-center gap-3">
                      <span className="assembler-step-number">02</span>
                      <div>
                        <h3 className="font-semibold">Review blueprint agent setup</h3>
                        <p className="text-sm text-[#687080]">
                          Complete the business details. External connections can be configured in Agent Studio after creation.
                        </p>
                      </div>
                    </div>
                    <div className="mt-6">
                      {renderCoreFields("simple")}
                      <label className="assembler-field mt-4" htmlFor="timezone">
                        <span>Timezone</span>
                        <input
                          id="timezone"
                          className="assembler-input"
                          type="text"
                          value={timezone}
                          onChange={(event) => setTimezone(event.target.value)}
                        />
                      </label>
                      <label
                        className="assembler-field mt-4"
                        htmlFor="simple-business-knowledge"
                      >
                        <span>Business knowledge</span>
                        <textarea
                          id="simple-business-knowledge"
                          className="assembler-input min-h-40 resize-y leading-6"
                          value={businessKnowledge}
                          onChange={(event) => setBusinessKnowledge(event.target.value)}
                        />
                      </label>
                    </div>
                    {error ? <p className="assembler-error" role="alert">{error}</p> : null}
                    <button
                      className="assembler-primary-button mt-6"
                      disabled={isSubmitting}
                      type="submit"
                    >
                      {isSubmitting ? "Creating..." : "Create voice agent"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <form className="assembler-panel mt-6 p-5 sm:p-7" onSubmit={handleSubmit}>
                <div className="flex items-center gap-3">
                  <span className="assembler-step-number">01</span>
                  <div>
                    <h3 className="font-semibold">Manual configuration</h3>
                    <p className="text-sm text-[#687080]">
                      Define the identity, operating schedule, and knowledge directly.
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  {renderCoreFields("advanced")}
                  <label className="assembler-field mt-4" htmlFor="business-knowledge">
                    <span>Business knowledge</span>
                    <textarea
                      id="business-knowledge"
                      className="assembler-input min-h-44 resize-y leading-6"
                      placeholder="Products, services, FAQs, policies, pricing notes, support steps, or anything the agent should know."
                      value={businessKnowledge}
                      onChange={(event) => setBusinessKnowledge(event.target.value)}
                    />
                  </label>
                </div>
                {error ? <p className="assembler-error" role="alert">{error}</p> : null}
                <button
                  className="assembler-primary-button mt-6"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Creating..." : "Create voice agent"}
                </button>
              </form>
            )}
          </div>

          <aside className="lg:h-full">
            <div className="border-t-2 border-[#1769FF] bg-white p-5 shadow-[0_12px_34px_rgba(30,41,59,0.06)] ring-1 ring-[#DDE1E8] lg:sticky lg:top-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#687080]">
                Build sequence
              </p>
              <ol className="mt-5 space-y-5">
                {BUILD_STEPS.map((step) => (
                  <li className="grid grid-cols-[2rem_1fr] gap-3" key={step.number}>
                    <span className="font-mono text-xs font-semibold text-[#1769FF]">
                      {step.number}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#687080]">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t border-[#E1E4E9] pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#687080]">
                  {blueprint && creationMode === "simple" ? "Planned blueprint tools" : "Available voice actions"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(blueprint && creationMode === "simple" ? blueprint.tools.map((tool) => tool.name) : ["Lead capture", "Availability", "Booking", "Escalation"]).map(
                    (capability) => (
                      <span
                        className="rounded-md bg-[#F0F5FF] px-2.5 py-1.5 text-xs font-medium text-[#0B4ED0]"
                        key={capability}
                      >
                        {capability}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </aside>

          {createdAgent ? (
            <section
              aria-live="polite"
              className="overflow-hidden border border-[#B7E2DA] bg-white shadow-[0_14px_40px_rgba(17,94,89,0.08)] lg:col-span-2"
            >
              <div className="flex flex-col gap-4 bg-[#ECF9F6] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0E8E7C] text-white">
                    ✓
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#287C70]">
                      Assembly complete
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      {createdAgent.name ?? "Your agent"} was created
                    </h2>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="assembler-primary-button"
                    href={`/demo?agent_id=${encodeURIComponent(
                      createdAgent.assemblyai_agent_id ?? "",
                    )}`}
                  >
                    Start test call
                  </Link>
                  <Link className="assembler-secondary-button" href="/dashboard">
                    Open dashboard
                  </Link>
                  {createdAgent.blueprint && createdAgent.id ? <Link className="assembler-secondary-button" href={`/agents/${createdAgent.id}/blueprint`}>Configure connections</Link> : null}
                </div>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
                {[
                  ["Business", createdAgent.business_name ?? "Not recorded"],
                  ["Agent", createdAgent.name ?? "Not recorded"],
                  ["Purpose", formatPurpose(createdAgent.agent_purpose)],
                  ["Knowledge", createdAgent.business_knowledge ?? "No knowledge provided"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.11em] text-[#7A8290]">
                      {label}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#282C34]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#E1E4E9] px-5 py-4 sm:px-7">
                <label className="text-xs font-semibold text-[#687080]" htmlFor="created-agent-id">
                  AssemblyAI agent ID
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="created-agent-id"
                    className="assembler-input min-w-0 flex-1 font-mono"
                    readOnly
                    value={createdAgent.assemblyai_agent_id ?? ""}
                  />
                  <button
                    className="assembler-secondary-button w-fit"
                    onClick={copyAgentId}
                    type="button"
                  >
                    {copyStatus ?? "Copy ID"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <footer className="border-t border-[#E1E4E9] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-[#687080] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Assembler · From business intent to working voice agents.</p>
          <p>Built for real caller workflows.</p>
        </div>
      </footer>
    </main>
  );
}
