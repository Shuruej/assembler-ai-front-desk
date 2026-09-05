"use client";

import { use, useEffect, useRef, useState } from "react";
import { FOLLOW_UP_DISABLED_MESSAGE, normalizeAgentFollowUpPreferences } from "@/lib/follow-up-preferences";

type TranscriptEntry = {
  id: string;
  role: "system" | "user" | "agent";
  text: string;
  partial?: boolean;
};

type Lead = {
  id: string;
  call_id: string;
  customer_name: string | null;
  phone_number: string | null;
  requested_service: string | null;
  preferred_datetime: string | null;
  notes: string | null;
  status: string | null;
  confirmation_status: string | null;
  booking_id: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  feedback_rating: number | null;
  feedback_notes: string | null;
};

type ConfirmationContext = {
  confirmation_call_enabled?: boolean;
  feedback_enabled?: boolean;
  lead: Lead;
  business_name: string | null;
  industry: string | null;
  agent_name: string | null;
};

type VoiceTokenResponse = {
  token?: string;
  error?: string;
};

type CallStartResponse = {
  status?: string;
  message?: string;
  confirmation_call_enabled?: boolean;
  feedback_enabled?: boolean;
  id?: string;
  error?: string;
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data?.error === "string" ? data.error : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}

function displayValue(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Not recorded";
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

function formatRating(value: number | null): string {
  return value === null ? "Not recorded" : `${value}/5`;
}

function formatStatusLabel(value: string | null): string {
  return displayValue(value).replaceAll("_", " ");
}

function getStatusBadgeClass(value: string | null): string {
  if (value === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function StatusBadge({ value }: { value: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
        value,
      )}`}
    >
      {formatStatusLabel(value)}
    </span>
  );
}

function buildConfirmationPrompt(context: ConfirmationContext): string {
  const { feedback_enabled: feedbackEnabled } = normalizeAgentFollowUpPreferences(context);
  const businessName = displayValue(context.business_name);
  const industry = displayValue(context.industry);
  const customerName = displayValue(context.lead.customer_name);
  const requestedService = displayValue(context.lead.requested_service);
  const preferredDatetime = displayValue(context.lead.preferred_datetime);
  const phoneNumber = displayValue(context.lead.phone_number);

  return [
    `You are ${displayValue(context.agent_name)}, a professional outbound confirmation voice agent for ${businessName}.`,
    `The business category is ${industry}.`,
    `This is a confirmation call from ${businessName}, calling ${customerName} about their ${requestedService} request. Their preferred time is ${preferredDatetime}. Their recorded phone number is ${phoneNumber}.`,
    "You must complete this full call flow in order. Step 1: confirm the appointment details, including final date and time, with explicit yes/correct confirmation before calling assign_booking.",
    "Step 2: once the final appointment date and time are agreed, call the assign_booking tool with confirmed_date in YYYY-MM-DD format, confirmed_time as a clear human-readable time, and optional notes.",
    "Step 3: immediately after assign_booking's result comes back, verbally acknowledge success in one short sentence, such as: Great, you're all booked in. Do not pause silently after the booking tool result.",
    ...(feedbackEnabled ? [
    "Step 4: then ask a brief satisfaction question about the initial booking experience, asking for a rating from 1 to 5.",
    "Step 5: once the caller gives a rating, call the capture_feedback tool with that rating and any comment they gave.",
    "Step 6: after capture_feedback succeeds, thank the caller for their feedback and close naturally with Goodbye. Always speak this closing before the call ends.",
    ] : [
      "Step 4: immediately after acknowledging the successful booking, thank the customer and say Goodbye. Do not ask for a rating or feedback and never call capture_feedback. Feedback collection is disabled. Always speak the closing before the call ends.",
    ]),
    "Never invent or promise review links, SMS messages, emails, future follow-ups, or notifications unless explicitly supported by the current product data and available tools. This confirmation flow only saves bookings and feedback; it has no review-link or outbound messaging feature. After feedback, simply thank the caller and say goodbye without promising anything else.",
    "After every tool call, always speak a short natural follow-up in the same turn -- never end your turn in silence after a tool result.",
    "Mandatory confirmation protocol: never call assign_booking or capture_feedback until you have read the relevant details back to the caller and the caller has explicitly confirmed with an affirmative response such as yes, correct, or that's right. This confirmation step is required even if the caller gave every detail in a single turn. When reading a phone number, date, or time back, speak digits slowly and clearly, grouped in short pairs or triples with pauses. If the caller corrects any detail, repeat the corrected version back once more and wait for explicit confirmation again before calling any tool.",
    "Keep responses concise, natural, and suitable for a live voice conversation. Do not invent business-specific details that have not been provided.",
  ].join(" ");
}

export default function ConfirmLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = use(params);
  const [context, setContext] = useState<ConfirmationContext | null>(null);
  const [status, setStatus] = useState("Loading lead...");
  const [error, setError] = useState<string | null>(null);
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
  const feedbackEnabledRef = useRef(true);

  useEffect(() => {
    let ignore = false;

    async function loadContext() {
      try {
        const data = await fetchJson<ConfirmationContext>(
          `/api/leads/${leadId}/confirmation-context`,
        );
        if (!ignore) {
          setContext(data);
          setStatus(normalizeAgentFollowUpPreferences(data).confirmation_call_enabled
            ? "Ready" : FOLLOW_UP_DISABLED_MESSAGE);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Lead not found.");
          setStatus("Unable to load lead");
        }
      }
    }

    void loadContext();

    return () => {
      ignore = true;
    };
  }, [leadId]);

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
      // Best-effort cleanup should not keep the user stuck on the page.
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

  function cleanup(nextStatus = "Ready") {
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
    if (message.name === "capture_feedback" && !feedbackEnabledRef.current) return;
    if (message.name !== "assign_booking" && message.name !== "capture_feedback") {
      return;
    }

    const ws = wsRef.current;
    if (!message.call_id || !ws || stopRequestedRef.current) return;
    if (handledToolCallsRef.current.has(message.call_id)) return;
    handledToolCallsRef.current.add(message.call_id);
    const toolTurnVersion = toolTurnVersionRef.current;

    const args = (message.arguments ?? {}) as Record<string, unknown>;
    let resultPayload: Record<string, unknown>;

    try {
      if (message.name === "assign_booking") {
        const data = await fetchJson<Lead>(`/api/leads/${leadId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed_date: args.confirmed_date,
            confirmed_time: args.confirmed_time,
            notes: args.notes,
          }),
        });
        resultPayload = {
          success: true,
          booking_id: data.booking_id,
          confirmed_date: data.confirmed_date,
          confirmed_time: data.confirmed_time,
        };
        addTranscript({
          id: `system-booking-${Date.now()}`,
          role: "system",
          text: `Booking saved${data.booking_id ? `: ${data.booking_id}` : "."}`,
        });
        if (wsRef.current === ws && !stopRequestedRef.current) {
          setContext((current) => current ? { ...current, lead: data } : current);
          setStatus("Booking saved");
        }
      } else {
        const data = await fetchJson<Lead>(`/api/leads/${leadId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback_rating: args.feedback_rating,
            feedback_notes: args.feedback_notes,
          }),
        });
        resultPayload = {
          success: true,
          feedback_rating: data.feedback_rating,
          feedback_notes: data.feedback_notes,
        };
        addTranscript({
          id: `system-feedback-${Date.now()}`,
          role: "system",
          text: "Feedback saved.",
        });
        if (wsRef.current === ws && !stopRequestedRef.current) {
          setContext((current) => current ? { ...current, lead: data } : current);
          setStatus("Feedback saved");
        }
      }
    } catch (err) {
      resultPayload = {
        success: false,
        error: err instanceof Error ? err.message : "Tool request failed.",
      };
    }

    // A stopped session or interrupted turn must not inject a stale result.
    if (wsRef.current === ws && !stopRequestedRef.current &&
        toolTurnVersionRef.current === toolTurnVersion) {
      pendingToolResultsRef.current.push({
        call_id: message.call_id,
        result: JSON.stringify(resultPayload),
      });
      flushPendingToolResults();
    }
  }

  function flushPendingToolResults() {
    const ws = wsRef.current;
    // Either the API or reply.done can finish first. Flush from both paths,
    // but only between replies, so the continuation includes spoken audio.
    if (!ws || ws.readyState !== WebSocket.OPEN ||
        stopRequestedRef.current || !toolResultWindowOpenRef.current) return;

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
    if (!context) {
      setStatus("Lead context is still loading.");
      return;
    }

    setStatus("Checking follow-up preferences...");
    setTranscript([]);
    transcriptTextRef.current = "";
    hasEndedRef.current = false;
    stopRequestedRef.current = false;
    shouldAutoEndAfterReplyRef.current = false;
    clearAutoEndTimer();

    try {
      const freshContext = await fetchJson<ConfirmationContext>(
        `/api/leads/${leadId}/confirmation-context`,
      );
      setContext(freshContext);
      if (!normalizeAgentFollowUpPreferences(freshContext).confirmation_call_enabled) {
        setStatus(FOLLOW_UP_DISABLED_MESSAGE);
        return;
      }

      setStatus("Starting confirmation call record...");

      const callStartData = await fetchJson<CallStartResponse>(
        "/api/calls/confirmation/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: leadId }),
        },
      );

      if (callStartData.status === "disabled") {
        setContext({ ...freshContext, ...normalizeAgentFollowUpPreferences(callStartData) });
        setStatus(FOLLOW_UP_DISABLED_MESSAGE);
        return;
      }
      if (!callStartData.id) {
        throw new Error(callStartData.error ?? "Failed to start call record.");
      }

      dbCallIdRef.current = callStartData.id;
      const sessionContext = { ...freshContext, ...normalizeAgentFollowUpPreferences(callStartData) };
      setContext(sessionContext);
      feedbackEnabledRef.current = sessionContext.feedback_enabled;

      const tokenData = await fetchJson<VoiceTokenResponse>("/api/voice-token");
      if (!tokenData.token) {
        throw new Error(tokenData.error ?? "Failed to mint voice token.");
      }

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

      const wsUrl = new URL("wss://agents.assemblyai.com/v1/ws");
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
              system_prompt: buildConfirmationPrompt(sessionContext),
              greeting: `Hi, this is a quick call from ${displayValue(
                context.business_name,
              )} to confirm your ${displayValue(
                context.lead.requested_service,
              )} appointment.`,
              input: {
                format: { encoding: "audio/pcm" },
              },
              output: {
                voice: "alba",
                format: { encoding: "audio/pcm" },
              },
              tools: [
                {
                  type: "function",
                  name: "assign_booking",
                  description:
                    "Assign a booking ID and save the final agreed appointment date and time after explicit caller confirmation.",
                  parameters: {
                    type: "object",
                    properties: {
                      confirmed_date: {
                        type: "string",
                        description: "The confirmed appointment date in YYYY-MM-DD format.",
                      },
                      confirmed_time: {
                        type: "string",
                        description: "The confirmed appointment time.",
                      },
                      notes: {
                        type: "string",
                        description:
                          "Optional notes about schedule preferences, corrections, or constraints.",
                      },
                    },
                    required: ["confirmed_date", "confirmed_time"],
                  },
                },
                {
                  type: "function",
                  name: "capture_feedback",
                  description:
                    "Save the caller's 1-5 satisfaction rating and optional feedback notes after explicit confirmation.",
                  parameters: {
                    type: "object",
                    properties: {
                      feedback_rating: {
                        type: "integer",
                        description:
                          "Caller satisfaction rating for the initial booking experience, from 1 to 5.",
                        minimum: 1,
                        maximum: 5,
                      },
                      feedback_notes: {
                        type: "string",
                        description: "Optional feedback notes from the caller.",
                      },
                    },
                    required: ["feedback_rating"],
                  },
                },
              ].filter((tool) => tool.name !== "capture_feedback" || sessionContext.feedback_enabled),
            },
          }),
        );
      });

      ws.addEventListener("message", (event) => {
        if (wsRef.current !== ws) return;
        const message = JSON.parse(event.data as string) as VoiceAgentMessage;
        if (stopRequestedRef.current && message.type !== "session.ended") return;

        if (message.type === "session.ready") {
          readyRef.current = true;
          resetInactivityTimer();
          setStatus(`Connected: ${message.session_id}`);
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: "Session ready. Start speaking.",
          });
        } else if (message.type === "reply.started" || message.type === "input.speech.started") {
          toolResultWindowOpenRef.current = false;
        } else if (message.type === "reply.audio" && message.data) {
          resetInactivityTimer();
          playAudioChunk(message.data);
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
              return [
                ...current,
                { id, role: "agent", text: message.delta ?? "", partial: true },
              ];
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
        setStatus("WebSocket error.");
      });
    } catch (err) {
      await endCallOnServer();
      cleanup();
      setStatus(err instanceof Error ? err.message : "Failed to start call.");
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
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold">Confirmation Call</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {normalizeAgentFollowUpPreferences(context).feedback_enabled
              ? "Confirm the appointment, assign a booking ID, and collect quick feedback."
              : "Confirm the appointment details and assign a booking ID."}
          </p>
        </div>

        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Lead summary
          </h2>

          {!context && !error ? (
            <p className="mt-4 text-sm text-zinc-500">Loading lead...</p>
          ) : context ? (
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Business
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {displayValue(context.business_name)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Customer
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {displayValue(context.lead.customer_name)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Request
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {displayValue(context.lead.requested_service)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Preferred time
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {formatDate(context.lead.preferred_datetime)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Phone
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {displayValue(context.lead.phone_number)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Confirmation
                </dt>
                <dd className="mt-1 text-sm text-zinc-800">
                  {normalizeAgentFollowUpPreferences(context).confirmation_call_enabled
                    ? displayValue(context.lead.confirmation_status) : "Follow-up off"}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        {context ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                After-call results
              </h2>
              <StatusBadge value={normalizeAgentFollowUpPreferences(context).confirmation_call_enabled
                ? context.lead.confirmation_status : "follow_up_off"} />
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Booking ID
                </dt>
                <dd className="mt-1 font-mono text-sm text-zinc-900">
                  {displayValue(context.lead.booking_id)}
                </dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Confirmed date
                </dt>
                <dd className="mt-1 text-sm text-zinc-900">
                  {formatPlainDate(context.lead.confirmed_date)}
                </dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Confirmed time
                </dt>
                <dd className="mt-1 text-sm text-zinc-900">
                  {displayValue(context.lead.confirmed_time)}
                </dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Feedback rating
                </dt>
                <dd className="mt-1 text-sm text-zinc-900">
                  {formatRating(context.lead.feedback_rating)}
                </dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase text-zinc-500">
                  Feedback notes
                </dt>
                <dd className="mt-1 text-sm text-zinc-900">
                  {displayValue(context.lead.feedback_notes)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex gap-3">
            <button
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              type="button"
              onClick={startCall}
              disabled={isCalling || !context || Boolean(error) || !normalizeAgentFollowUpPreferences(context).confirmation_call_enabled}
            >
              Start Confirmation Call
            </button>
            <button
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-zinc-400"
              type="button"
              onClick={stopCall}
              disabled={!isCalling}
            >
              Stop Call
            </button>
          </div>
          <p className="text-sm text-zinc-600">Status: {status}</p>
        </section>

        <section className="min-h-72 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Live transcript
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {transcript.length === 0 ? (
              <p className="text-sm text-zinc-500">No transcript yet.</p>
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
