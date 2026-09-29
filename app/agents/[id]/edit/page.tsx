"use client";

import { VoicePicker } from "@/components/assembler/VoicePicker";
import { savedVoiceId, type VoiceId } from "@/lib/assemblyai/voices";
import Link from "next/link";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

type Agent = {
  voice_id?: VoiceId;
  blueprint?: { voice_id?: VoiceId } | null;
  id: string;
  business_name: string | null;
  industry: string | null;
  name: string | null;
  agent_purpose: string | null;
  business_knowledge: string | null;
  business_hours_start: string | null;
  business_hours_end: string | null;
  business_days: string | null;
  appointment_duration_minutes: number | null;
};

type AgentResponse = Agent & {
  error?: string;
};

function parseBusinessDays(value?: string | null): string[] {
  const days = (value ?? "")
    .split(",")
    .map((day) => day.trim().toLowerCase())
    .filter(Boolean);

  const validDays = BUSINESS_DAY_OPTIONS.map((day) => day.value).filter((day) =>
    days.includes(day),
  );

  return validDays.length > 0 ? validDays : DEFAULT_BUSINESS_DAYS;
}

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const agentId = useMemo(() => params.id, [params.id]);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [voiceId, setVoiceId] = useState<VoiceId>("alba");
  const [agentName, setAgentName] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("general_receptionist");
  const [businessKnowledge, setBusinessKnowledge] = useState("");
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadAgent() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
        const data = (await response.json()) as AgentResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load agent.");
        }

        if (!isActive) return;

        setBusinessName(data.business_name ?? "");
        setIndustry(data.industry ?? "");
        setAgentName(data.name ?? "");
        setVoiceId(savedVoiceId(data));
        setAgentPurpose(data.agent_purpose ?? "general_receptionist");
        setBusinessKnowledge(data.business_knowledge ?? "");
        setBusinessHoursStart(
          data.business_hours_start ?? DEFAULT_BUSINESS_HOURS_START,
        );
        setBusinessHoursEnd(data.business_hours_end ?? DEFAULT_BUSINESS_HOURS_END);
        setAppointmentDurationMinutes(
          data.appointment_duration_minutes ??
            DEFAULT_APPOINTMENT_DURATION_MINUTES,
        );
        setBusinessDays(parseBusinessDays(data.business_days));
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Failed to load agent.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    if (agentId) {
      loadAgent();
    }

    return () => {
      isActive = false;
    };
  }, [agentId]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmedBusinessName = businessName.trim();
    const trimmedAgentName = agentName.trim();

    if (!trimmedBusinessName || !trimmedAgentName) {
      setError("Business name and agent name are required.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          business_name: trimmedBusinessName,
          industry: industry.trim(),
          name: trimmedAgentName,
          agent_purpose: agentPurpose,
          business_knowledge: businessKnowledge.trim(),
          business_hours_start:
            businessHoursStart.trim() || DEFAULT_BUSINESS_HOURS_START,
          business_hours_end: businessHoursEnd.trim() || DEFAULT_BUSINESS_HOURS_END,
          appointment_duration_minutes: appointmentDurationMinutes,
          business_days: getBusinessDaysValue(),
        }),
      });
      const data = (await response.json()) as AgentResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update agent.");
      }

      setBusinessName(data.business_name ?? "");
      setIndustry(data.industry ?? "");
      setAgentName(data.name ?? "");
        setVoiceId(savedVoiceId(data));
      setAgentPurpose(data.agent_purpose ?? "general_receptionist");
      setBusinessKnowledge(data.business_knowledge ?? "");
      setBusinessHoursStart(data.business_hours_start ?? DEFAULT_BUSINESS_HOURS_START);
      setBusinessHoursEnd(data.business_hours_end ?? DEFAULT_BUSINESS_HOURS_END);
      setAppointmentDurationMinutes(
        data.appointment_duration_minutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES,
      );
      setBusinessDays(parseBusinessDays(data.business_days));
      setSuccessMessage("Agent updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-5 py-8 text-[#17191D] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <nav className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-lg font-semibold text-[#17191D]" href="/">
            <AssemblerLogo subtitle="Agent Studio" />
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              className="assembler-nav-link"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="assembler-secondary-button"
              href="/"
            >
              Create agent
            </Link>
          </div>
        </nav>

        <section className="assembler-panel mt-8 p-6 sm:p-8">
          <div>
            <p className="text-sm font-medium uppercase text-[#687080]">
              Edit voice agent
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-[#17191D] sm:text-4xl">
              Edit agent settings
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#687080]">
              Saving updates the AssemblyAI agent and its stored business settings. An available AssemblyAI connection is required.
            </p>
          </div>

          {isLoading ? (
            <div className="mt-8 rounded-md border border-[#DDE1E8] bg-[#F0F5FF] p-4 text-sm text-[#687080]">
              Loading agent...
            </div>
          ) : (
            <form className="mt-8" onSubmit={handleSubmit}>
              <VoicePicker value={voiceId} onChange={setVoiceId} disabled={isSaving} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="business-name">
                    Business name
                  </label>
                  <input
                    id="business-name"
                    className="assembler-input"
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
                    className="assembler-input"
                    placeholder="e.g. retail, property management, IT support"
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
                    className="assembler-input"
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
                    className="assembler-input"
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

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="business-hours-start"
                  >
                    Opens
                  </label>
                  <input
                    id="business-hours-start"
                    className="assembler-input"
                    type="time"
                    value={businessHoursStart}
                    onChange={(event) => setBusinessHoursStart(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="business-hours-end"
                  >
                    Closes
                  </label>
                  <input
                    id="business-hours-end"
                    className="assembler-input"
                    type="time"
                    value={businessHoursEnd}
                    onChange={(event) => setBusinessHoursEnd(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="appointment-duration"
                  >
                    Appointment length
                  </label>
                  <input
                    id="appointment-duration"
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
                </div>
              </div>

              <fieldset className="mt-4 rounded-md border border-[#DDE1E8] p-3">
                <legend className="px-1 text-sm font-medium">Business days</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUSINESS_DAY_OPTIONS.map((day) => (
                    <label
                      className="inline-flex items-center gap-2 rounded-md border border-[#DDE1E8] bg-white px-3 py-2 text-sm text-[#17191D]"
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

              <div className="mt-4 flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="business-knowledge">
                  Business knowledge
                </label>
                <textarea
                  id="business-knowledge"
                  className="min-h-40 resize-y rounded-md border border-[#DDE1E8] px-3 py-2 text-sm text-[#17191D] outline-none placeholder:text-[#687080] focus:border-[#1769FF]"
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

              {successMessage ? (
                <div className="mt-4 rounded-md border border-[#C7DBC9] bg-[#EDF5EF] p-3 text-sm text-[#416B4A]">
                  {successMessage}
                </div>
              ) : null}

              <button
                className="assembler-primary-button mt-5"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
