"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";

type State = {
  ready: boolean;
  service_account_email: string | null;
  status: string;
  config: { calendarId: string; calendarTitle: string; timeZone: string } | null;
};

type Agent = { name: string; business_name: string };

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export default function GoogleCalendarSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [connection, setConnection] = useState<State | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [calendarId, setCalendarId] = useState("");
  const [tested, setTested] = useState<State["config"]>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      json<State>(`/api/agents/${id}/google-calendar`),
      json<Agent>(`/api/agents/${id}`),
    ]).then(([state, nextAgent]) => {
      setConnection(state);
      setAgent(nextAgent);
      if (state.config) setCalendarId(state.config.calendarId);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load Calendar setup."));
  }, [id]);

  async function run(action: "test" | "save") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // The endpoint returns a tested calendar config for `test` and connection state for `save`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await json<any>(`/api/agents/${id}/google-calendar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, calendar_id: calendarId }),
      });
      if (action === "test") {
        setTested(result);
        setMessage("Calendar access works. Assembler can read availability and create events.");
      } else {
        setConnection(result);
        setTested(result.config);
        setMessage("Google Calendar connected.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Calendar setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await json(`/api/agents/${id}/google-calendar`, { method: "DELETE" });
      setConnection((current) => current ? { ...current, status: "not_connected", config: null } : current);
      setTested(null);
      setMessage("Google Calendar disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Calendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F8FC] text-[#17191D]">
      <header className="border-b border-[#DDE1E8] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/dashboard"><AssemblerLogo subtitle="Connections" /></Link>
          <Link className="assembler-secondary-button" href={`/agents/${id}/blueprint#connections`}>Back to Blueprint</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Google Calendar</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Connect a real booking calendar</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#687080]">
          {agent ? `${agent.name} can check live availability and create confirmed bookings in a Calendar you control.` : "Connect a Calendar you control."}
        </p>

        {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}

        {!connection ? <section className="assembler-panel mt-6 rounded-2xl p-6">Loading...</section> : !connection.ready ? (
          <section className="assembler-panel mt-6 rounded-2xl p-6">
            <h2 className="text-xl font-semibold">Calendar connector unavailable</h2>
            <p className="mt-2 text-sm text-[#687080]">The shared Google service identity is not configured on this server.</p>
          </section>
        ) : (
          <div className="mt-6 space-y-5">
            <section className="rounded-2xl border border-[#CFE0FF] bg-[#F3F7FF] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1769FF]">No Google sign-in required</p>
              <h2 className="mt-2 text-lg font-semibold">Share your Calendar with Assembler</h2>
              <p className="mt-2 text-sm leading-6 text-[#687080]">
                Google Calendar → Settings → your calendar → Share with specific people → add this email with <strong>Make changes to events</strong>. Then copy the Calendar ID from <strong>Integrate calendar</strong>.
              </p>
              <div className="mt-3 break-all rounded-lg border border-[#D7E3FA] bg-white px-3 py-2 font-mono text-sm">{connection.service_account_email}</div>
            </section>

            {connection.config ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Connected</p>
                    <h2 className="mt-1 text-xl font-semibold">{connection.config.calendarTitle}</h2>
                    <p className="mt-1 text-sm text-[#687080]">{connection.config.timeZone}</p>
                  </div>
                  <button className="assembler-secondary-button" disabled={busy} onClick={() => void disconnect()} type="button">Disconnect</button>
                </div>
              </section>
            ) : null}

            <section className="assembler-panel rounded-2xl p-6">
              <label className="assembler-field">
                <span>Google Calendar ID</span>
                <input className="assembler-input" placeholder="yourname@gmail.com or ...@group.calendar.google.com" value={calendarId} onChange={(event) => { setCalendarId(event.target.value); setTested(null); }} />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="assembler-secondary-button" disabled={busy || !calendarId.trim()} onClick={() => void run("test")} type="button">{busy ? "Testing..." : "Test access"}</button>
                {tested ? <button className="assembler-primary-button" disabled={busy} onClick={() => void run("save")} type="button">Save connection</button> : null}
              </div>
              {tested ? <div className="mt-4 rounded-xl border border-[#DDE1E8] bg-[#FAFBFC] p-4 text-sm"><strong>{tested.calendarTitle}</strong><div className="mt-1 text-[#687080]">Timezone: {tested.timeZone}</div></div> : null}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
