"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";

type ConnectionState = {
  authorized: boolean;
  status: string;
  config: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    sheetName: string;
  } | null;
};

type Metadata = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: string[];
};

type Agent = { name: string; business_name: string };

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
export default function GoogleSheetsSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [spreadsheet, setSpreadsheet] = useState("");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSheetName, setNewSheetName] = useState("Assembler Records");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      json<ConnectionState>(`/api/agents/${id}/google-sheets`),
      json<Agent>(`/api/agents/${id}`),
    ]).then(([nextConnection, nextAgent]) => {
      if (cancelled) return;
      setConnection(nextConnection);
      setAgent(nextAgent);
      if (nextConnection.config) {
        setSpreadsheet(nextConnection.config.spreadsheetId);
        setSheetName(nextConnection.config.sheetName);
      }
      setNewTitle(`${nextAgent.business_name || nextAgent.name} - Assembler Records`);
      const callbackError = new URLSearchParams(window.location.search).get("error");
      if (callbackError) setError(callbackError);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load Google Sheets setup.");
    });
    return () => { cancelled = true; };
  }, [id]);
  async function run(action: "test" | "save" | "create") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "test") {
        const result = await json<Metadata>(`/api/agents/${id}/google-sheets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, spreadsheet }),
        });
        setMetadata(result);
        setSheetName((current) => result.sheets.includes(current) ? current : result.sheets[0] ?? "");
        setMessage("Connection works. Choose the tab Assembler should append records to.");
      } else if (action === "save") {
        const result = await json<ConnectionState>(`/api/agents/${id}/google-sheets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, spreadsheet, sheet_name: sheetName }),
        });
        setConnection(result);
        setMessage("Google Sheets connected. New captured records will sync to this tab.");
      } else {
        const result = await json<ConnectionState>(`/api/agents/${id}/google-sheets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, title: newTitle, sheet_name: newSheetName }),
        });
        setConnection(result);
        setSpreadsheet(result.config?.spreadsheetId ?? "");
        setSheetName(result.config?.sheetName ?? "");
        setMetadata(null);
        setMessage("New Google Sheet created and connected.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Sheets setup failed.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await json<{ disconnected: boolean }>(`/api/agents/${id}/google-sheets`, { method: "DELETE" });
      setConnection({ authorized: false, status: "not_connected", config: null });
      setMetadata(null);
      setSpreadsheet("");
      setSheetName("");
      setMessage("Google Sheets disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Google Sheets.");
    } finally {
      setBusy(false);
    }
  }

  const configured = connection?.status === "configured" && connection.config;
  const spreadsheetUrl = configured
    ? `https://docs.google.com/spreadsheets/d/${configured.spreadsheetId}/edit`
    : null;

  return (
    <main className="min-h-screen bg-[#F6F8FC] text-[#17191D]">
      <header className="border-b border-[#DDE1E8] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/dashboard"><AssemblerLogo subtitle="Connections" /></Link>
          <Link className="assembler-secondary-button" href={`/agents/${id}/blueprint#connections`}>Back to Blueprint</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Google Sheets</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Connect your own spreadsheet</h1>
          <p className="mt-3 text-sm leading-6 text-[#687080]">
            {agent ? `${agent.name} can copy captured records into a Google Sheet you control.` : "Authorize Google, then choose or create a spreadsheet."}
            {" "}Supabase remains the primary record store; Sheets is an optional live copy for your team.
          </p>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}

        {!connection ? (
          <section className="assembler-panel mt-6 rounded-2xl p-6"><p className="text-sm text-[#687080]">Loading connection...</p></section>
        ) : !connection.authorized ? (
          <section className="assembler-panel mt-6 rounded-2xl p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">1. Authorize Google</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687080]">Assembler requests Google Sheets access so it can validate your spreadsheet and append captured records. Your refresh token stays encrypted server-side.</p>
              </div>
              <a className="assembler-primary-button shrink-0" href={`/api/agents/${id}/google-sheets/connect`}>Connect Google account</a>
            </div>
          </section>
        ) : (
          <div className="mt-6 space-y-5">
            {configured ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Connected</div>
                    <h2 className="mt-2 text-xl font-semibold">{configured.spreadsheetTitle}</h2>
                    <p className="mt-1 text-sm text-[#5F6877]">Tab: <strong>{configured.sheetName}</strong> · New structured records append automatically.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {spreadsheetUrl ? <a className="assembler-secondary-button" href={spreadsheetUrl} target="_blank" rel="noreferrer">Open Sheet</a> : null}
                    <a className="assembler-secondary-button" href={`/api/agents/${id}/google-sheets/connect`}>Reconnect Google</a>
                    <button className="assembler-secondary-button" disabled={busy} onClick={() => void disconnect()} type="button">Disconnect</button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-[#CFE0FF] bg-[#F3F7FF] p-5">
                <p className="text-sm font-semibold text-[#1769FF]">Google account authorized ✓</p>
                <p className="mt-1 text-sm text-[#687080]">Now choose an existing spreadsheet or let Assembler create one for you.</p>
              </section>
            )}

            <section className="assembler-panel rounded-2xl p-6">
              <div className="flex gap-2 rounded-xl bg-[#F1F4F8] p-1">
                <button className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "existing" ? "bg-white text-[#1769FF] shadow-sm" : "text-[#687080]"}`} onClick={() => setMode("existing")} type="button">Connect existing</button>
                <button className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "create" ? "bg-white text-[#1769FF] shadow-sm" : "text-[#687080]"}`} onClick={() => setMode("create")} type="button">Create new</button>
              </div>
              {mode === "existing" ? (
                <div className="mt-6 space-y-4">
                  <label className="assembler-field">
                    <span>Google Sheets URL or spreadsheet ID</span>
                    <input className="assembler-input" placeholder="https://docs.google.com/spreadsheets/d/..." value={spreadsheet} onChange={(event) => { setSpreadsheet(event.target.value); setMetadata(null); }} />
                  </label>
                  <button className="assembler-secondary-button" disabled={busy || !spreadsheet.trim()} onClick={() => void run("test")} type="button">{busy ? "Testing..." : "Test & load tabs"}</button>
                  {metadata ? (
                    <div className="rounded-xl border border-[#DDE1E8] bg-[#FAFBFC] p-4">
                      <p className="text-sm font-semibold">{metadata.spreadsheetTitle}</p>
                      <label className="assembler-field mt-3">
                        <span>Sheet tab</span>
                        <select className="assembler-input" value={sheetName} onChange={(event) => setSheetName(event.target.value)}>
                          {metadata.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}
                        </select>
                      </label>
                      <p className="mt-3 text-xs leading-5 text-[#687080]">Use an empty tab when possible. Assembler creates a header row on the first synced record.</p>
                      <button className="assembler-primary-button mt-4" disabled={busy || !sheetName} onClick={() => void run("save")} type="button">Save connection</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <label className="assembler-field"><span>Spreadsheet name</span><input className="assembler-input" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
                  <label className="assembler-field"><span>First sheet tab</span><input className="assembler-input" value={newSheetName} onChange={(event) => setNewSheetName(event.target.value)} /></label>
                  <p className="text-xs leading-5 text-[#687080]">Assembler will create the spreadsheet in the connected Google account and use this tab for captured records.</p>
                  <button className="assembler-primary-button" disabled={busy || !newTitle.trim() || !newSheetName.trim()} onClick={() => void run("create")} type="button">{busy ? "Creating..." : "Create & connect"}</button>
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-[#DDE1E8] bg-white p-5">
              <h2 className="text-sm font-semibold">What gets written?</h2>
              <p className="mt-2 text-sm leading-6 text-[#687080]">When an approved Blueprint record tool succeeds, Assembler writes the capture time, record type, call ID, and the Blueprint data fields to your selected tab. Failed Sheets sync never destroys the primary saved record.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
