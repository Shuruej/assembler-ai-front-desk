"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";
import type { AgentBlueprint } from "@/lib/assembler/blueprint";

type Agent = { id: string; name: string; business_name: string; assemblyai_agent_id: string; google_calendar_connected: boolean; blueprint: AgentBlueprint | null };
type Connection = { id: string; connection_key: string; name: string; kind: "http" | "webhook"; config: { url: string; method: string }; status: string };
type RecordRow = { id: string; record_type: string; payload: Record<string, unknown>; status: string; created_at: string };
type ToolLog = { id: string; tool_id: string; tool_kind: string; started_at: string; success: boolean; error_code: string | null; duration_ms: number };
type Call = { id: string; started_at: string; outcome_key: string | null; status: string };

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export default function BlueprintStudioPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [draft, setDraft] = useState<AgentBlueprint | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [connectionInputs, setConnectionInputs] = useState<Record<string, { url: string; method: string; secret: string }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextAgent, nextConnections, nextRecords, nextLogs, nextCalls] = await Promise.all([
          readJson<Agent>(`/api/agents/${id}`),
          readJson<Connection[]>(`/api/agents/${id}/connections`),
          readJson<RecordRow[]>(`/api/agents/${id}/records`),
          readJson<ToolLog[]>(`/api/agents/${id}/tool-logs`),
          readJson<Call[]>(`/api/agents/${id}/calls`),
        ]);
        if (cancelled) return;
        setAgent(nextAgent); setDraft(nextAgent.blueprint); setConnections(nextConnections); setRecords(nextRecords); setLogs(nextLogs); setCalls(nextCalls);
        setConnectionInputs(Object.fromEntries(nextConnections.map((connection) => [connection.connection_key, { url: connection.config.url, method: connection.config.method, secret: "" }])));
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load Studio."); }
    }
    void load();
    return () => { cancelled = true; };
  }, [id]);

  function editField(index: number, patch: Partial<AgentBlueprint["dataFields"][number]>) {
    setDraft((current) => current && ({ ...current, dataFields: current.dataFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) }));
    setMessage(null);
  }

  async function saveBlueprint() {
    if (!draft) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await readJson<{ blueprint: AgentBlueprint }>(`/api/agents/${id}/blueprint`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ blueprint: draft }) });
      setDraft(result.blueprint); setAgent((current) => current && { ...current, blueprint: result.blueprint }); setMessage("Blueprint saved and AssemblyAI agent updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save blueprint."); }
    finally { setBusy(false); }
  }

  async function saveConnection(connectionId: string) {
    const values = connectionInputs[connectionId];
    if (!values) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await readJson<Connection>(`/api/agents/${id}/connections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connection_key: connectionId, config: { url: values.url, method: values.method }, ...(values.secret ? { secret: values.secret } : {}) }) });
      setConnections((current) => [...current.filter((item) => item.connection_key !== connectionId), saved]);
      setConnectionInputs((current) => ({ ...current, [connectionId]: { ...values, secret: "" } }));
      setMessage(`${saved.name} saved. Its secret is stored encrypted and is not shown again.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save connection."); }
    finally { setBusy(false); }
  }

  if (!agent || !draft) return <main className="min-h-screen bg-[#F7F8FA] p-8 text-[#17191D]"><Link href="/dashboard"><AssemblerLogo subtitle="Agent Studio" /></Link><section className="assembler-panel mx-auto mt-8 max-w-2xl p-6"><h1 className="text-xl font-semibold">{error ? "Blueprint unavailable" : agent ? "No blueprint saved" : "Loading blueprint"}</h1><p className="mt-3 text-sm text-[#687080]">{error ? "The saved blueprint could not be retrieved. Please try again when the data connection is available." : agent ? "This agent was created with manual settings. Create an agent from a workflow to review its blueprint." : "Retrieving this agent’s configuration."}</p><Link className="assembler-secondary-button mt-5" href="/dashboard">Back to Agent Studio</Link></section></main>;
  const configuredIds = new Set(connections.filter((connection) => connection.status === "configured").map((connection) => connection.connection_key));
  const demoHref = `/demo?agent_id=${encodeURIComponent(agent.assemblyai_agent_id)}`;

  return <main className="min-h-screen bg-[#F7F8FA] text-[#17191D]">
    <header className="border-b border-[#DDE1E8] bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"><Link href="/dashboard"><AssemblerLogo subtitle="Agent Studio" /></Link><div className="flex gap-2"><Link className="assembler-secondary-button" href="/dashboard">Dashboard</Link><Link className="assembler-primary-button" href={demoHref}>Test voice</Link></div></div></header>
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Blueprint configuration</p><h1 className="mt-2 text-3xl font-semibold">{agent.name}</h1><p className="mt-2 text-sm text-[#687080]">{agent.business_name} · {draft.objective}</p></div>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p> : null}
      <nav aria-label="Blueprint sections" className="flex flex-wrap gap-2 text-sm"><a className="assembler-secondary-button" href="#data">Data</a><a className="assembler-secondary-button" href="#tools">Tools</a><a className="assembler-secondary-button" href="#connections">Connections</a><a className="assembler-secondary-button" href="#rules">Rules</a><a className="assembler-secondary-button" href="#outcomes">Outcomes</a><a className="assembler-secondary-button" href="#activity">Activity</a></nav>
      <section className="assembler-panel rounded-xl p-5" id="data"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Data model</h2><p className="mt-1 text-sm text-[#687080]">Information this agent collects and saves.</p></div><button className="assembler-primary-button" disabled={busy} onClick={saveBlueprint} type="button">{busy ? "Saving..." : "Save fields"}</button></div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">{draft.dataFields.map((field, index) => <div className="rounded-xl border border-[#DDE1E8] bg-white p-4" key={field.key}><p className="font-mono text-xs text-[#687080]">{field.key} · {field.type}</p><label className="assembler-field mt-3"><span>Label</span><input className="assembler-input" value={field.label} onChange={(event) => editField(index, { label: event.target.value })} /></label><label className="assembler-field mt-3"><span>Description</span><input className="assembler-input" value={field.description} onChange={(event) => editField(index, { description: event.target.value })} /></label>{field.type === "enum" ? <label className="assembler-field mt-3"><span>Options (comma separated)</span><input className="assembler-input" value={field.options.join(", ")} onChange={(event) => editField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label> : null}<label className="mt-3 flex items-center gap-2 text-sm"><input checked={field.required} onChange={(event) => editField(index, { required: event.target.checked })} type="checkbox" />Required</label></div>)}</div>
        {draft.dataFields.length === 0 ? <p className="mt-4 text-sm text-[#687080]">This agent has no structured data fields.</p> : null}
      </section>
      <section className="assembler-panel rounded-xl p-5" id="tools"><h2 className="text-xl font-semibold">Tools</h2><p className="mt-1 text-sm text-[#687080]">Only approved blueprint actions are exposed to the voice agent.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{draft.tools.map((tool) => { const ready = !tool.connectionId || tool.kind === "calendar" || configuredIds.has(tool.connectionId); return <div className="rounded-xl border border-[#DDE1E8] bg-white p-4" key={tool.id}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{tool.name}</h3><span className={`rounded px-2 py-1 text-xs font-medium ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ready ? "Configuration ready" : "Connection required"}</span></div><p className="mt-2 text-sm text-[#687080]">{tool.description}</p><p className="mt-2 font-mono text-xs text-[#687080]">{tool.kind} / {tool.operation}</p><p className="mt-2 text-xs text-[#687080]">Inputs: {tool.inputs.map((input) => input.key).join(", ") || "none"}</p></div>; })}</div>{draft.tools.length === 0 ? <p className="mt-4 text-sm text-[#687080]">No tools in this blueprint. Review the workflow description if business actions are needed.</p> : null}</section>
      <section className="assembler-panel rounded-xl p-5" id="connections"><h2 className="text-xl font-semibold">Connections</h2><p className="mt-1 text-sm text-[#687080]">Configure only the external systems this blueprint requires.</p><div className="mt-4 space-y-3">{draft.connections.map((requirement) => { const saved = connections.find((item) => item.connection_key === requirement.id); const values = connectionInputs[requirement.id] ?? { url: "", method: requirement.kind === "webhook" ? "POST" : "GET", secret: "" }; return <div className="rounded-xl border border-[#DDE1E8] bg-white p-4" key={requirement.id}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{requirement.name}</h3><span className="text-xs text-[#687080]">{requirement.kind === "calendar" ? (agent.google_calendar_connected ? "Google Calendar connected" : "Internal slots fallback available") : saved?.status === "configured" ? "Configuration ready" : "Connection required"}</span></div><p className="mt-1 text-sm text-[#687080]">{requirement.reason}</p>{requirement.kind === "calendar" ? <Link className="assembler-secondary-button mt-3" href={`/api/agents/${id}/google-calendar/connect`}>Connect Google Calendar</Link> : <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="assembler-field"><span>HTTPS endpoint</span><input className="assembler-input" placeholder="https://api.example.com/endpoint" value={values.url} onChange={(event) => setConnectionInputs((current) => ({ ...current, [requirement.id]: { ...values, url: event.target.value } }))} /></label><label className="assembler-field"><span>Method</span><select className="assembler-input" value={values.method} onChange={(event) => setConnectionInputs((current) => ({ ...current, [requirement.id]: { ...values, method: event.target.value } }))}>{(requirement.kind === "webhook" ? ["POST"] : ["GET", "POST", "PUT", "PATCH"]).map((method) => <option key={method}>{method}</option>)}</select></label><label className="assembler-field md:col-span-2"><span>Authorization header (optional; encrypted at rest)</span><input className="assembler-input" type="password" autoComplete="off" value={values.secret} onChange={(event) => setConnectionInputs((current) => ({ ...current, [requirement.id]: { ...values, secret: event.target.value } }))} /></label><button className="assembler-primary-button w-fit" disabled={busy} onClick={() => void saveConnection(requirement.id)} type="button">Save connection</button></div>}</div>; })}{draft.connections.length === 0 ? <p className="text-sm text-[#687080]">No external connections required.</p> : null}</div></section>
      <section className="assembler-panel rounded-xl p-5" id="rules"><h2 className="text-xl font-semibold">Rules and workflow</h2><div className="mt-4 grid gap-5 md:grid-cols-2"><div><h3 className="font-semibold">Business rules</h3><ul className="mt-3 space-y-2">{draft.rules.map((rule) => <li className="rounded-lg bg-[#F5F7FA] p-3 text-sm" key={rule.id}>{rule.description}<details className="mt-2 text-xs text-[#687080]"><summary className="cursor-pointer">Rule details</summary><p className="mt-1 font-mono">{rule.source} {rule.operator} {rule.value === null ? "" : String(rule.value)} → {rule.action}{rule.target ? ` ${rule.target}` : ""}</p></details></li>)}</ul>{draft.rules.length === 0 ? <p className="mt-3 text-sm text-[#687080]">No explicit business rules defined.</p> : null}</div><div><h3 className="font-semibold">Workflow preview</h3><ol className="mt-3 space-y-2 border-l-2 border-[#DDE7FF] pl-4">{draft.workflow.map((step, index) => <li className="rounded-lg bg-[#F5F7FA] p-3 text-sm" key={step.id}><span className="font-mono text-xs text-[#1769FF]">{index + 1} · {step.type}</span><p className="font-medium">{step.label}</p><p className="text-[#687080]">{step.description}</p></li>)}</ol>{draft.workflow.length === 0 ? <p className="mt-3 text-sm text-[#687080]">No workflow steps defined.</p> : null}</div></div></section>
      <section className="assembler-panel rounded-xl p-5" id="outcomes"><h2 className="text-xl font-semibold">Outcomes</h2><p className="mt-1 text-sm text-[#687080]">Goals defined by this blueprint. Recorded results appear in call activity.</p><ul className="mt-4 grid gap-3 sm:grid-cols-2">{draft.outcomes.map((outcome) => <li className="rounded-lg bg-[#F5F7FA] p-3 text-sm" key={outcome.id}><strong>{outcome.label}</strong><p className="mt-1 text-[#687080]">{outcome.description}</p></li>)}</ul>{draft.outcomes.length === 0 ? <p className="mt-3 text-sm text-[#687080]">No outcomes defined in this blueprint.</p> : null}</section>
      <section className="assembler-panel rounded-xl p-5" id="activity"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Test and activity</h2><Link className="assembler-primary-button" href={demoHref}>Start browser voice test</Link></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><div><h3 className="font-semibold">Recent records</h3><ul className="mt-2 space-y-2 text-sm">{records.slice(0, 10).map((record) => <li className="rounded-lg bg-[#F5F7FA] p-3" key={record.id}><strong>{record.record_type}</strong><p className="mt-1 text-[#687080]">{Object.entries(record.payload).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</p></li>)}{records.length === 0 ? <li className="text-[#687080]">No records yet. Complete an intake during a voice test to see saved information here.</li> : null}</ul></div><div><h3 className="font-semibold">Tool activity</h3><ul className="mt-2 space-y-2 text-sm">{logs.slice(0, 10).map((log) => <li className="rounded-lg bg-[#F5F7FA] p-3" key={log.id}><strong>{log.tool_id}</strong> · {log.success ? "Succeeded" : log.error_code ?? "Failed"}<p className="text-xs text-[#687080]">{new Date(log.started_at).toLocaleString()} · {log.duration_ms} ms</p></li>)}{logs.length === 0 ? <li className="text-[#687080]">No tool calls yet. Results appear after an action is requested during a call.</li> : null}</ul></div><div><h3 className="font-semibold">Call outcomes</h3><ul className="mt-2 space-y-2 text-sm">{calls.slice(0, 10).map((call) => <li className="rounded-lg bg-[#F5F7FA] p-3" key={call.id}><strong>{call.outcome_key ?? "No outcome set"}</strong><p className="text-xs text-[#687080]">{new Date(call.started_at).toLocaleString()} · {call.status}</p></li>)}{calls.length === 0 ? <li className="text-[#687080]">Not tested. Start a browser voice test when your AssemblyAI connection is available.</li> : null}</ul></div></div></section>
    </div>
  </main>;
}
