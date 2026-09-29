"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ASSEMBLYAI_VOICES, type VoiceId } from "@/lib/assemblyai/voices";
import { startVoicePreview, type PreviewState } from "@/lib/assemblyai/preview";

export function VoicePicker({ value, onChange, disabled = false }: { value: VoiceId; onChange: (voice: VoiceId) => void; disabled?: boolean }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ phase: "idle" });
  const stopRef = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const stop = () => stopRef.current?.();
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      stop();
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => { if (disabled) stopRef.current?.(); }, [disabled]);

  const selected = ASSEMBLYAI_VOICES.find(voice => voice.id === value)!;
  const active = preview.phase === "loading" || preview.phase === "playing";
  const filtered = ASSEMBLYAI_VOICES.filter(voice => (!language || voice.language === language) && `${voice.name} ${voice.language} ${voice.accent ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  function play(voice: VoiceId) {
    if (active && preview.voice === voice) { stopRef.current?.(); return; }
    stopRef.current = startVoicePreview(voice, state => { if (mounted.current) setPreview(state); });
  }
  return <section className="my-6 overflow-hidden rounded-2xl border border-[#DDE2EA] bg-white shadow-sm" aria-labelledby={`${id}-title`}>
    <div className="border-b border-[#E6E9EE] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-base font-semibold">Voice library</h3>
        <span className="rounded-full bg-[#F1F4F8] px-3 py-1 text-xs font-medium text-[#536075]">16 AssemblyAI voices</span>
      </div>
      <p id={`${id}-help`} className="mt-2 text-sm leading-6 text-[#586477]">Listen to a short, live preview. Your choice applies to future calls; calls already in progress keep their voice.</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#EDF3FF] px-3 py-2">
        <p className="text-sm text-[#234876]"><span className="font-semibold">Selected: {selected.name}</span> &middot; {selected.language}{selected.accent ? ` / ${selected.accent}` : ""}</p>
        <button type="button" disabled={disabled} onClick={() => play(value)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[#175CC5] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">{active && preview.voice === value ? "Stop preview" : "Preview selected"}</button>
      </div>
    </div>
    <fieldset disabled={disabled} className="p-4 sm:p-5" aria-describedby={`${id}-help`}>
      <legend className="sr-only">Choose an agent voice</legend>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="min-w-0"><span className="sr-only">Search voices</span><input type="search" className="assembler-input w-full" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, language or accent" /></label>
        <label><span className="sr-only">Filter by language</span><select className="assembler-input w-full bg-white" value={language} onChange={event => setLanguage(event.target.value)}><option value="">All languages</option>{Array.from(new Set(ASSEMBLYAI_VOICES.map(voice => voice.language))).map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="grid max-h-96 gap-2 overflow-y-auto p-1 sm:grid-cols-2" role="group" aria-label="Available voices">
        {filtered.map((voice) => <div key={voice.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 transition-colors ${value === voice.id ? "border-[#3977D5] bg-[#F3F7FF]" : "border-[#E2E6EC] hover:border-[#AAB9CC]"}`}>
          <label className="flex min-h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1">
            <input type="radio" name={`${id}-voice`} value={voice.id} checked={value === voice.id} onChange={() => { stopRef.current?.(); onChange(voice.id); }} className="h-4 w-4 shrink-0 accent-[#1769FF]" />
            <span className="min-w-0"><span className="block text-sm font-semibold text-[#1D2736]">{voice.name}</span><span className="mt-1 block text-xs text-[#586477]">{voice.language}{voice.accent ? ` / ${voice.accent}` : ""}</span></span>
          </label>
          <button type="button" className="min-h-11 shrink-0 rounded-lg border border-[#D5DEEA] bg-white px-3 text-xs font-semibold text-[#344762] hover:bg-[#EAF1FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" aria-label={`${active && preview.voice === voice.id ? "Stop preview of" : "Preview"} ${voice.name}`} onClick={() => play(voice.id)}>{active && preview.voice === voice.id ? "Stop" : "Preview"}</button>
        </div>)}
      </div>
      {!filtered.length && <p className="py-5 text-center text-sm text-[#586477]">No voices match. Try another name or language.</p>}
    </fieldset>
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-[#E6E9EE] bg-[#FAFBFD] px-5 py-3">
      <p role={preview.phase === "error" ? "alert" : "status"} className={`text-xs ${preview.phase === "error" ? "text-red-700" : "text-[#586477]"}`}>
        {preview.phase === "loading" ? `Loading ${preview.voice} preview...` : preview.phase === "playing" ? `Playing ${preview.voice}` : preview.phase === "error" ? preview.message : "Real voice preview. No microphone needed."}
      </p>
      {active && <button type="button" onClick={() => stopRef.current?.()} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-[#175CC5] focus-visible:outline-2 focus-visible:outline-blue-600">Stop preview</button>}
    </div>
  </section>;
}
