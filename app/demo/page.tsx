"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

type TranscriptEntry = {
  id: string;
  role: "system" | "user" | "agent";
  text: string;
  partial?: boolean;
};

type VoiceTokenResponse = {
  token?: string;
  agent_id?: string;
  ws_url?: string;
  error?: string;
};

type CallStartResponse = {
  id?: string;
  error?: string;
  confirmation_call_enabled?: boolean;
  feedback_enabled?: boolean;
  session_prompt?: string;
  timezone?: string;
  uses_blueprint?: boolean;
};

type VoiceAgentMessage = {
  type: string;
  session_id?: string;
  data?: string;
  item_id?: string;
  reply_id?: string;
  text?: string;
  delta?: string;
  status?: string;
  message?: string;
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

const CALL_INACTIVITY_TIMEOUT_MS = 20_000;
const AUTO_END_AFTER_REPLY_BUFFER_MS = 350;

function normalizeIntentText(text: string) {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasConversationEndingIntent(text: string) {
  const normalized = normalizeIntentText(text);

  if (!normalized) return false;

  return (
    /(?:^|\s)(?:that'?s|that is)\s+all(?:\s+for\s+(?:today|now))?$/.test(
      normalized,
    ) ||
    /(?:^|\s)(?:goodbye|bye bye|bye)$/.test(normalized) ||
    /(?:^|\s)test\s+is\s+complete$/.test(normalized)
  );
}

function hasAgentClosingReply(text: string) {
  const normalized = normalizeIntentText(text);

  if (!normalized) return false;

  return (
    /(?:^|\s)(?:goodbye|bye bye|bye)$/.test(normalized) ||
    /\bhave\s+a\s+(?:wonderful|great|good|nice)\s+day$/.test(normalized) ||
    /\bthank\s+you\s+for\s+calling$/.test(normalized)
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcm16(base64: string): Int16Array {
  const binary = atob(base64);
  const pcm16 = new Int16Array(binary.length / 2);
  for (let i = 0; i < pcm16.length; i += 1) {
    const low = binary.charCodeAt(i * 2);
    const high = binary.charCodeAt(i * 2 + 1);
    const sample = low | (high << 8);
    pcm16[i] = sample >= 0x8000 ? sample - 0x10000 : sample;
  }
  return pcm16;
}

function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i += 1) {
    float32[i] = pcm16[i] / 32768;
  }
  return float32;
}

function DemoPageContent() {
  const searchParams = useSearchParams();
  const queryAgentId = searchParams.get("agent_id")?.trim() ?? "";
  const hasQueryAgentId = queryAgentId.length > 0;
  const [agentId, setAgentId] = useState(queryAgentId);
  const [status, setStatus] = useState("Not tested");
  const [isCalling, setIsCalling] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceRef = useRef<GainNode | null>(null);
  const playbackTimeRef = useRef(0);
  const readyRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dbCallIdRef = useRef<string | null>(null);
  const transcriptTextRef = useRef<string>("");
  const pendingToolResultsRef = useRef<{ call_id: string; result: string }[]>([]);
  const toolResultWindowOpenRef = useRef(false);
  const handledToolCallsRef = useRef(new Set<string>());
  const toolTurnVersionRef = useRef(0);
  const hasEndedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const shouldAutoEndAfterReplyRef = useRef(false);
  const sessionPromptRef = useRef<string | null>(null);
  const blueprintModeRef = useRef(false);

  function addTranscript(entry: TranscriptEntry) {
    setTranscript((current) => [...current, entry]);
  }

  function appendTranscriptText(role: string, text: string) {
    if (!text) return;
    transcriptTextRef.current += `${role}: ${text}\n`;
  }

  function upsertTranscript(entry: TranscriptEntry) {
    setTranscript((current) => {
      const index = current.findIndex((item) => item.id === entry.id);
      if (index === -1) {
        return [...current, entry];
      }
      return current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...entry } : item,
      );
    });
  }

  function playAudioChunk(base64Audio: string) {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const pcm16 = base64ToPcm16(base64Audio);
    const float32 = pcm16ToFloat32(pcm16);
    const buffer = audioContext.createBuffer(1, float32.length, 24000);
    const source = audioContext.createBufferSource();

    buffer.getChannelData(0).set(float32);
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const now = audioContext.currentTime;
    playbackTimeRef.current = Math.max(playbackTimeRef.current, now);
    source.start(playbackTimeRef.current);
    playbackTimeRef.current += buffer.duration;
  }

  async function endCallOnServer() {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    const dbCallId = dbCallIdRef.current;
    if (!dbCallId) return;

    try {
      await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: dbCallId,
          transcript: transcriptTextRef.current.trim(),
        }),
      });
    } catch {
      // Best-effort — don't block cleanup on this.
    } finally {
      dbCallIdRef.current = null;
    }
  }

  function clearInactivityTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function clearAutoEndTimer() {
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }
  }

  function resetInactivityTimer() {
    clearInactivityTimer();

    if (!readyRef.current) return;

    inactivityTimerRef.current = setTimeout(() => {
      endCallForInactivity();
    }, CALL_INACTIVITY_TIMEOUT_MS);
  }

  function requestStopCall(nextStatus = "Ending call...") {
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    clearInactivityTimer();
    clearAutoEndTimer();
    setStatus(nextStatus);

    const ws = wsRef.current;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session.end" }));
    } else {
      void endCallOnServer().finally(cleanup);
    }
  }

  function scheduleAutoEndAfterReply() {
    if (!shouldAutoEndAfterReplyRef.current) return;

    shouldAutoEndAfterReplyRef.current = false;
    clearAutoEndTimer();

    const audioContext = audioContextRef.current;
    const remainingPlaybackMs = audioContext
      ? Math.max(0, playbackTimeRef.current - audioContext.currentTime) * 1000
      : 0;

    autoEndTimerRef.current = setTimeout(() => {
      autoEndTimerRef.current = null;
      requestStopCall("Ending call after goodbye...");
    }, remainingPlaybackMs + AUTO_END_AFTER_REPLY_BUFFER_MS);
  }

  function cleanup(nextStatus = "Idle") {
    clearInactivityTimer();
    clearAutoEndTimer();
    readyRef.current = false;
    workletRef.current?.disconnect();
    silenceRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();

    wsRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    workletRef.current = null;
    sourceRef.current = null;
    silenceRef.current = null;
    playbackTimeRef.current = 0;
    pendingToolResultsRef.current = [];
    toolResultWindowOpenRef.current = false;
    handledToolCallsRef.current.clear();
    toolTurnVersionRef.current += 1;
    stopRequestedRef.current = false;
    shouldAutoEndAfterReplyRef.current = false;
    sessionPromptRef.current = null;
    blueprintModeRef.current = false;
    setIsCalling(false);
    setStatus(nextStatus);
  }

  function endCallForInactivity() {
    if (stopRequestedRef.current) return;

    addTranscript({
      id: `system-inactivity-${Date.now()}`,
      role: "system",
      text: "No voice activity for 20 seconds. Call ended automatically.",
    });
    const ws = wsRef.current;
    requestStopCall("No voice activity for 20 seconds. Ending call...");

    if (ws?.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        if (wsRef.current === ws) {
          ws.close();
          void endCallOnServer().finally(() => cleanup());
        }
      }, 1500);
    } else {
      void endCallOnServer().finally(() => cleanup());
    }
  }

  async function handleToolCall(message: VoiceAgentMessage) {
    const usesBlueprint = blueprintModeRef.current;
    const supportedToolNames = new Set([
      "capture_lead",
      "escalate_to_human",
      "check_availability",
      "book_slot",
    ]);

    if (!message.name || (!usesBlueprint && !supportedToolNames.has(message.name))) return;
    const isEscalation = message.name === "escalate_to_human";
    const isAvailabilityCheck = message.name === "check_availability";
    const isSlotBooking = message.name === "book_slot";

    const ws = wsRef.current;
    if (!message.call_id || !ws || stopRequestedRef.current) return;
    if (handledToolCallsRef.current.has(message.call_id)) return;
    handledToolCallsRef.current.add(message.call_id);
    const toolTurnVersion = toolTurnVersionRef.current;
    const args = (message.arguments ?? {}) as Record<string, unknown>;
    const dbCallId = dbCallIdRef.current;

    let resultPayload: Record<string, unknown>;

    if (!dbCallId) {
      resultPayload = { success: false, error: "No active call on record." };
    } else {
      try {
        const endpoint = usesBlueprint
          ? "/api/agents/tools/execute"
          : isEscalation
          ? "/api/leads/escalate"
          : isAvailabilityCheck
            ? "/api/availability/check"
            : isSlotBooking
              ? "/api/availability/book"
              : "/api/leads";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(usesBlueprint ? { call_id: dbCallId, tool_id: message.name, arguments: args } : {
            call_id: dbCallId,
            ...(isAvailabilityCheck
              ? { requested_date: args.requested_date }
              : {
                  customer_name: args.customer_name,
                  phone_number: args.phone_number,
                }),
            ...(isEscalation ? { reason: args.reason } : {}),
            ...(isSlotBooking
              ? { slot_date: args.slot_date, slot_time: args.slot_time }
              : {}),
            ...(!isEscalation && !isAvailabilityCheck && !isSlotBooking
              ? {
                  requested_service: args.requested_service,
                  preferred_datetime: args.preferred_datetime,
                }
              : {}),
            ...(isSlotBooking
              ? { requested_service: args.requested_service }
              : {}),
            notes: args.notes,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          resultPayload = { success: false, error: data.error ?? "Tool request failed." };
        } else {
          resultPayload = usesBlueprint
            ? data
            : isAvailabilityCheck
            ? { success: true, available_times: data.available_times ?? [] }
            : { success: true, lead_id: data.id, booking_id: data.booking_id };

          if (usesBlueprint) {
            addTranscript({ id: `system-tool-${Date.now()}`, role: "system", text: `${message.name} completed.${data.outcome ? ` Outcome: ${data.outcome}.` : ""}` });
          } else if (!isAvailabilityCheck) {
            addTranscript({
              id: `system-lead-${Date.now()}`,
              role: "system",
              text: isEscalation
                ? "Escalated to human team."
                : isSlotBooking
                  ? "Slot booked."
                  : "Lead captured and saved.",
            });
          }
        }
      } catch (err) {
        resultPayload = {
          success: false,
          error: err instanceof Error ? err.message : "Failed to save lead.",
        };
      }
    }

    if (
      wsRef.current === ws &&
      !stopRequestedRef.current &&
      toolTurnVersionRef.current === toolTurnVersion
    ) {
      pendingToolResultsRef.current.push({
        call_id: message.call_id,
        result: JSON.stringify(resultPayload),
      });
      flushPendingToolResults();
    }
  }

  function flushPendingToolResults() {
    const ws = wsRef.current;
    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      stopRequestedRef.current ||
      !toolResultWindowOpenRef.current
    ) {
      return;
    }

    while (pendingToolResultsRef.current.length > 0) {
      const pending = pendingToolResultsRef.current.shift();
      if (!pending) continue;
      ws.send(
        JSON.stringify({
          type: "tool.result",
          call_id: pending.call_id,
          result: pending.result,
        }),
      );
    }
  }

  async function startCall() {
    const trimmedAgentId = agentId.trim();
    if (!trimmedAgentId) {
      setStatus("Enter an AssemblyAI agent ID first.");
      return;
    }

    setStatus("Requesting voice token...");
    setTranscript([]);
    transcriptTextRef.current = "";
    hasEndedRef.current = false;
    stopRequestedRef.current = false;
    shouldAutoEndAfterReplyRef.current = false;
    clearAutoEndTimer();

    try {
      const tokenResponse = await fetch(
        `/api/voice-token?agent_id=${encodeURIComponent(trimmedAgentId)}`,
      );
      const tokenData = (await tokenResponse.json()) as VoiceTokenResponse;

      if (!tokenResponse.ok || !tokenData.token) {
        throw new Error(tokenData.error ?? "Failed to mint voice token.");
      }

      setStatus("Starting call record...");

      const callStartResponse = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assemblyai_agent_id: trimmedAgentId }),
      });
      const callStartData = (await callStartResponse.json()) as CallStartResponse;

      if (!callStartResponse.ok || !callStartData.id) {
        throw new Error(callStartData.error ?? "Failed to start call record.");
      }

      dbCallIdRef.current = callStartData.id;
      sessionPromptRef.current = callStartData.session_prompt ?? null;
      blueprintModeRef.current = callStartData.uses_blueprint === true;

      setStatus("Requesting microphone...");

      const audioContext = new AudioContext({ sampleRate: 24000 });
      await audioContext.resume();
      await audioContext.audioWorklet.addModule("/assemblyai-pcm-worklet.js");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          sampleRate: 24000,
        },
      });
      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, "assemblyai-pcm-processor", {
        processorOptions: {
          inputSampleRate: audioContext.sampleRate,
          targetSampleRate: 24000,
        },
      });
      const silence = audioContext.createGain();
      silence.gain.value = 0;

      const wsUrl = new URL(tokenData.ws_url ?? "wss://agents.assemblyai.com/v1/ws");
      wsUrl.searchParams.set("token", tokenData.token);
      const ws = new WebSocket(wsUrl);

      audioContextRef.current = audioContext;
      streamRef.current = stream;
      sourceRef.current = source;
      workletRef.current = worklet;
      silenceRef.current = silence;
      wsRef.current = ws;
      playbackTimeRef.current = audioContext.currentTime;

      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (readyRef.current && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "input.audio",
              audio: arrayBufferToBase64(event.data),
            }),
          );
        }
      };

      source.connect(worklet).connect(silence).connect(audioContext.destination);
      setIsCalling(true);
      setStatus("Connecting to AssemblyAI...");

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              agent_id: tokenData.agent_id ?? trimmedAgentId,
            },
          }),
        );
      });

      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as VoiceAgentMessage;

        if (message.type === "session.ready") {
          // agent_id cannot be combined with overrides in one session.update.
          // Apply the runtime prompt after initialization, before streaming audio.
          if (sessionPromptRef.current) {
            ws.send(
              JSON.stringify({
                type: "session.update",
                session: { system_prompt: sessionPromptRef.current },
              }),
            );
          }
          readyRef.current = true;
          resetInactivityTimer();
          setStatus("Connected");
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: "Session ready. Start speaking.",
          });
        } else if (message.type === "reply.audio" && message.data) {
          resetInactivityTimer();
          playAudioChunk(message.data);
        } else if (message.type === "reply.started" || message.type === "input.speech.started") {
          toolResultWindowOpenRef.current = false;
        } else if (message.type === "transcript.user.delta") {
          resetInactivityTimer();
          upsertTranscript({
            id: message.item_id ?? "user-partial",
            role: "user",
            text: message.text ?? "",
            partial: true,
          });
        } else if (message.type === "transcript.user") {
          resetInactivityTimer();
          upsertTranscript({
            id: message.item_id ?? `user-${Date.now()}`,
            role: "user",
            text: message.text ?? "",
            partial: false,
          });
          appendTranscriptText("user", message.text ?? "");
          if (hasConversationEndingIntent(message.text ?? "")) {
            shouldAutoEndAfterReplyRef.current = true;
          }
        } else if (message.type === "transcript.agent.delta") {
          resetInactivityTimer();
          const id = message.item_id ?? message.reply_id ?? "agent-partial";
          setTranscript((current) => {
            const index = current.findIndex((item) => item.id === id);
            if (index === -1) {
              return [...current, { id, role: "agent", text: message.delta ?? "", partial: true }];
            }
            return current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    text: `${item.text}${message.delta ? ` ${message.delta}` : ""}`.trim(),
                    partial: true,
                  }
                : item,
            );
          });
        } else if (message.type === "transcript.agent") {
          resetInactivityTimer();
          upsertTranscript({
            id: message.item_id ?? message.reply_id ?? `agent-${Date.now()}`,
            role: "agent",
            text: message.text ?? "",
            partial: false,
          });
          appendTranscriptText("agent", message.text ?? "");
          if (hasAgentClosingReply(message.text ?? "")) {
            shouldAutoEndAfterReplyRef.current = true;
          }
        } else if (message.type === "tool.call") {
          resetInactivityTimer();
          void handleToolCall(message);
        } else if (message.type === "reply.done") {
          resetInactivityTimer();
          toolResultWindowOpenRef.current = message.status !== "interrupted";
          if (message.status === "interrupted") {
            pendingToolResultsRef.current = [];
            toolTurnVersionRef.current += 1;
            playbackTimeRef.current = audioContext.currentTime;
            shouldAutoEndAfterReplyRef.current = false;
          } else {
            scheduleAutoEndAfterReply();
          }
          flushPendingToolResults();
        } else if (message.type === "session.ended") {
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: "Session ended.",
          });
          void endCallOnServer().finally(cleanup);
        } else if (message.type === "session.error" || message.type === "error") {
          setStatus(message.message ?? "AssemblyAI session error.");
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: message.message ?? "AssemblyAI session error.",
          });
        }
      });

      ws.addEventListener("close", () => {
        void endCallOnServer().finally(cleanup);
      });

      ws.addEventListener("error", () => {
        setStatus("External service unavailable. The voice connection could not be established. Try again when AssemblyAI is reachable.");
      });
    } catch (error) {
      await endCallOnServer();
      cleanup();
      setStatus(error instanceof Error ? error.message : "Failed to start call.");
    }
  }

  function stopCall() {
    requestStopCall();
  }

  useEffect(() => {
    function endOnPageHide() {
      if (
        !stopRequestedRef.current &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        stopRequestedRef.current = true;
        wsRef.current.send(JSON.stringify({ type: "session.end" }));
      }
    }

    window.addEventListener("pagehide", endOnPageHide);

    return () => {
      window.removeEventListener("pagehide", endOnPageHide);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
      readyRef.current = false;
      workletRef.current?.disconnect();
      silenceRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-4 py-8 text-[#17191D]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <Link className="assembler-secondary-button mb-5" href="/dashboard">Back to Agent Studio</Link><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#1769FF]">Assembler · Built on AssemblyAI</p><h1 className="text-3xl font-semibold">Test your voice agent</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Paste an AssemblyAI agent ID, start a browser call, and speak through your
            microphone. Review captured records and tool activity in Agent Studio after the call.
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <label className="text-sm font-medium" htmlFor="agent-id">
            AssemblyAI agent ID
          </label>
          <input
            id="agent-id"
            className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900"
            placeholder="5c7cf111-fef8-46f9-bef8-541b13aadd2c"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            disabled={isCalling}
            readOnly={hasQueryAgentId}
          />
          {hasQueryAgentId ? (
            <p className="text-sm text-zinc-600">
              Not this agent?{" "}
              <Link className="font-medium text-[#1769FF] underline" href="/dashboard">
                Select another agent in Agent Studio.
              </Link>
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              className="assembler-primary-button"
              type="button"
              onClick={startCall}
              disabled={isCalling}
            >
              Start Call
            </button>
            <button
              className="assembler-secondary-button"
              type="button"
              onClick={stopCall}
              disabled={!isCalling}
            >
              Stop Call
            </button>
          </div>
          <p role="status" className="rounded-lg bg-[#F0F5FF] p-3 text-sm text-[#414957]">Status: {status}</p>
        </section>

        <section className="min-h-72 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Live transcript
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {transcript.length === 0 ? (
              <p className="text-sm text-zinc-500">Not tested. Start a call to see the conversation here. A working AssemblyAI connection and microphone permission are required.</p>
            ) : (
              transcript.map((entry) => (
                <div key={entry.id} className="rounded-md bg-zinc-50 p-3">
                  <div className="text-xs font-semibold uppercase text-zinc-500">
                    {entry.role}
                    {entry.partial ? " partial" : ""}
                  </div>
                  <p className="mt-1 text-sm">{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DemoPage() {
  return (
    <Suspense fallback={null}>
      <DemoPageContent />
    </Suspense>
  );
}
