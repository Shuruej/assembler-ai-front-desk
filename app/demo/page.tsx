"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AssemblerLogo } from "@/components/assembler/AssemblerLogo";

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

type AgentSummary = {
  name?: string | null;
  business_name?: string | null;
  assemblyai_agent_id?: string | null;
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
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  useEffect(() => {
    if (!queryAgentId) return;

    let cancelled = false;
    void fetch("/api/agents")
      .then(async (response) => (response.ok ? ((await response.json()) as AgentSummary[]) : []))
      .then((agents) => {
        if (cancelled) return;
        setSelectedAgent(
          agents.find((agent) => agent.assemblyai_agent_id === queryAgentId) ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setSelectedAgent(null);
      });

    return () => {
      cancelled = true;
    };
  }, [queryAgentId]);

  useEffect(() => {
    if (!isCalling) return;
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isCalling]);

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

  const sessionReady = transcript.some(
    (entry) => entry.role === "system" && entry.text.includes("Session ready"),
  );
  const hasUserSpeech = transcript.some((entry) => entry.role === "user" && !entry.partial);
  const hasAgentReply = transcript.some((entry) => entry.role === "agent" && !entry.partial);
  const toolEvents = transcript.filter(
    (entry) =>
      entry.role === "system" &&
      (entry.text.includes(" completed.") ||
        entry.text === "Escalated to human team." ||
        entry.text === "Slot booked." ||
        entry.text === "Lead captured and saved."),
  );
  const durationLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const displayAgentName = selectedAgent?.name?.trim() || "Voice Agent";
  const displayBusinessName = selectedAgent?.business_name?.trim() || "Assembler workspace";
  const isConnected = isCalling && status === "Connected";

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#17191D]">
      <div className="border-b border-[#E1E4E9] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1769FF]" href="/">
            <AssemblerLogo subtitle="Voice Lab" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-[#D8E5FF] bg-[#F3F7FF] px-3 py-1.5 text-xs font-semibold text-[#1769FF] sm:flex">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-[#9BA3B0]"}`} />
              LIVE VOICE
            </span>
            <Link className="assembler-secondary-button" href="/dashboard">Back to Studio</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1769FF]">Voice agent test</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{displayAgentName}</h1>
              <p className="mt-2 text-sm text-[#687080]">{displayBusinessName} · Real browser voice session powered by AssemblyAI</p>
            </div>
            <div className="rounded-full border border-[#DCE1E8] bg-white px-3 py-1.5 text-xs font-medium text-[#596273]">
              Session {durationLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_0.85fr]">
          <section className="overflow-hidden rounded-2xl border border-[#DCE1E8] bg-white shadow-[0_18px_50px_rgba(35,48,73,0.08)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#E8EBEF] px-5 py-4 sm:px-6">
              <div>
                <p className="text-sm font-semibold">Voice session</p>
                <p className="mt-0.5 text-xs text-[#77808F]">Speak naturally. Actions and outcomes appear below.</p>
              </div>
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                isConnected ? "bg-emerald-50 text-emerald-700" : isCalling ? "bg-blue-50 text-[#1769FF]" : "bg-[#F1F3F6] text-[#687080]"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : isCalling ? "bg-[#1769FF] animate-pulse" : "bg-[#AAB1BC]"}`} />
                {isConnected ? "Connected" : isCalling ? "Connecting" : "Ready"}
              </div>
            </div>

            <div className="flex min-h-[390px] flex-col items-center justify-center px-5 py-9 text-center sm:px-8">
              <div className="relative flex h-40 w-40 items-center justify-center">
                <div className={`absolute inset-0 rounded-full bg-[#1769FF]/10 ${isCalling ? "animate-ping" : ""}`} style={{ animationDuration: "2.4s" }} />
                <div className={`absolute inset-4 rounded-full border ${isConnected ? "border-[#42C7D5]/50 bg-[#EAFBFD]" : "border-[#D9E5FF] bg-[#F2F6FF]"}`} />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#1769FF] to-[#42C7D5] shadow-[0_12px_35px_rgba(23,105,255,0.28)]">
                  <svg aria-hidden="true" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a3.5 3.5 0 0 0-3.5 3.5v5a3.5 3.5 0 0 0 7 0v-5A3.5 3.5 0 0 0 12 3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
                  </svg>
                </div>
              </div>

              <h2 className="mt-5 text-xl font-semibold">{isConnected ? "Listening" : isCalling ? "Connecting to agent" : "Ready for a live test"}</h2>
              <p role="status" className="mt-2 max-w-md text-sm leading-6 text-[#687080]">{status}</p>

              <button
                className={`mt-7 min-w-48 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-4 ${
                  isCalling
                    ? "border border-[#E1E4E9] bg-white text-[#2B313B] hover:bg-[#F7F8FA] focus-visible:ring-zinc-200"
                    : "bg-[#1769FF] text-white hover:bg-[#0B5CE5] focus-visible:ring-[#1769FF]/20"
                }`}
                type="button"
                onClick={isCalling ? stopCall : startCall}
              >
                {isCalling ? "End voice call" : "Start voice call"}
              </button>

              {!hasQueryAgentId ? (
                <div className="mt-7 w-full max-w-xl text-left">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#77808F]" htmlFor="agent-id">AssemblyAI agent ID</label>
                  <input
                    id="agent-id"
                    className="mt-2 w-full rounded-xl border border-[#D8DDE5] px-3 py-2.5 font-mono text-xs outline-none focus:border-[#1769FF] focus:ring-4 focus:ring-[#1769FF]/10"
                    placeholder="agent_..."
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    disabled={isCalling}
                  />
                </div>
              ) : (
                <details className="mt-6 w-full max-w-xl rounded-xl border border-[#E5E8ED] bg-[#FAFBFC] px-4 py-3 text-left">
                  <summary className="cursor-pointer text-xs font-semibold text-[#687080]">Technical details</summary>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <code className="break-all text-[11px] text-[#596273]">{agentId}</code>
                    <Link className="text-xs font-semibold text-[#1769FF]" href="/dashboard">Change agent</Link>
                  </div>
                </details>
              )}
            </div>
          </section>

          <aside className="rounded-2xl border border-[#DCE1E8] bg-white p-5 shadow-[0_18px_50px_rgba(35,48,73,0.06)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#77808F]">Session activity</p>
            <h2 className="mt-2 text-lg font-semibold">Live verification</h2>
            <div className="mt-5 space-y-4">
              {[
                ["Voice connection", sessionReady],
                ["Caller speech captured", hasUserSpeech],
                ["Agent response received", hasAgentReply],
                ["Business action executed", toolEvents.length > 0],
              ].map(([label, complete]) => (
                <div className="flex items-center gap-3" key={String(label)}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    complete ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F3F6] text-[#9AA2AE]"
                  }`}>
                    {complete ? "✓" : "·"}
                  </span>
                  <span className={`text-sm ${complete ? "font-medium text-[#2B313B]" : "text-[#7B8492]"}`}>{String(label)}</span>
                </div>
              ))}
            </div>

            <div className="my-6 h-px bg-[#E8EBEF]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#77808F]">Latest action</p>
            {toolEvents.length > 0 ? (
              <div className="mt-3 rounded-xl border border-[#CFE0FF] bg-[#F3F7FF] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1769FF]">
                  <span>⚡</span>
                  Action executed
                </div>
                <p className="mt-2 text-sm font-medium leading-6 text-[#2B313B]">{toolEvents[toolEvents.length - 1].text}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[#7B8492]">Tool calls and workflow outcomes will appear here when the agent takes an action.</p>
            )}
            <p className="mt-6 rounded-xl bg-[#F7F8FA] p-3 text-xs leading-5 text-[#687080]">Only activity observed in this live session is marked complete.</p>
          </aside>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#DCE1E8] bg-white shadow-[0_18px_50px_rgba(35,48,73,0.06)]">
          <div className="flex items-center justify-between border-b border-[#E8EBEF] px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1769FF]">Live conversation</p>
              <h2 className="mt-1 text-lg font-semibold">Transcript & actions</h2>
            </div>
            <span className="text-xs text-[#7B8492]">{transcript.filter((entry) => entry.role !== "system").length} messages</span>
          </div>

          <div className="min-h-72 space-y-4 p-5 sm:p-6">
            {transcript.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0F5FF] text-[#1769FF]">•••</div>
                <p className="mt-4 text-sm font-medium">Conversation will appear here</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-[#7B8492]">Start a call and speak through your microphone. Voice replies, tool actions, and outcomes will be captured live.</p>
              </div>
            ) : (
              transcript.map((entry) => {
                const isToolEvent =
                  entry.role === "system" &&
                  (entry.text.includes(" completed.") ||
                    entry.text === "Escalated to human team." ||
                    entry.text === "Slot booked." ||
                    entry.text === "Lead captured and saved.");

                if (isToolEvent) {
                  return (
                    <div key={entry.id} className="mx-auto max-w-2xl rounded-xl border border-[#CFE0FF] bg-[#F3F7FF] px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1769FF]">
                        <span>⚡</span>
                        Workflow action
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-[#2B313B]">{entry.text}</p>
                    </div>
                  );
                }

                if (entry.role === "system") {
                  return (
                    <div className="flex justify-center" key={entry.id}>
                      <span className="rounded-full bg-[#F1F3F6] px-3 py-1.5 text-xs text-[#687080]">{entry.text}</span>
                    </div>
                  );
                }

                const isUser = entry.role === "user";
                return (
                  <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`} key={entry.id}>
                    {!isUser ? (
                      <img alt="" aria-hidden="true" className="mt-1 h-8 w-8 shrink-0 object-contain" src="/assembler/brand/assembler-mark.png" />
                    ) : null}
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? "rounded-br-md bg-[#1769FF] text-white"
                        : "rounded-bl-md border border-[#E5E8ED] bg-[#FAFBFC] text-[#2B313B]"
                    }`}>
                      <div className={`text-[10px] font-semibold uppercase tracking-wide ${isUser ? "text-white/70" : "text-[#7B8492]"}`}>
                        {isUser ? "You" : displayAgentName}{entry.partial ? " · live" : ""}
                      </div>
                      <p className="mt-1 text-sm leading-6">{entry.text}</p>
                    </div>
                  </div>
                );
              })
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
