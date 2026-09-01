"use client";

import { useEffect, useRef, useState } from "react";

type TranscriptEntry = {
  id: string;
  role: "system" | "user" | "agent";
  text: string;
  partial?: boolean;
};

type VoiceTokenResponse = {
  token?: string;
  agent_id?: string;
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
};

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

export default function DemoPage() {
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState("Idle");
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

  function addTranscript(entry: TranscriptEntry) {
    setTranscript((current) => [...current, entry]);
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

    if (!audioContext) {
      return;
    }

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

  function cleanup() {
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
    setIsCalling(false);
    setStatus("Idle");
  }

  async function startCall() {
    const trimmedAgentId = agentId.trim();

    if (!trimmedAgentId) {
      setStatus("Enter an AssemblyAI agent ID first.");
      return;
    }

    setStatus("Requesting voice token...");
    setTranscript([]);

    try {
      const tokenResponse = await fetch(
        `/api/voice-token?agent_id=${encodeURIComponent(trimmedAgentId)}`,
      );
      const tokenData = (await tokenResponse.json()) as VoiceTokenResponse;

      if (!tokenResponse.ok || !tokenData.token) {
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
      const worklet = new AudioWorkletNode(
        audioContext,
        "assemblyai-pcm-processor",
        {
          processorOptions: {
            inputSampleRate: audioContext.sampleRate,
            targetSampleRate: 24000,
          },
        },
      );
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
            session: { agent_id: tokenData.agent_id ?? trimmedAgentId },
          }),
        );
      });

      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as VoiceAgentMessage;

        if (message.type === "session.ready") {
          readyRef.current = true;
          setStatus(`Connected: ${message.session_id}`);
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: "Session ready. Start speaking.",
          });
        } else if (message.type === "reply.audio" && message.data) {
          playAudioChunk(message.data);
        } else if (message.type === "transcript.user.delta") {
          upsertTranscript({
            id: message.item_id ?? "user-partial",
            role: "user",
            text: message.text ?? "",
            partial: true,
          });
        } else if (message.type === "transcript.user") {
          upsertTranscript({
            id: message.item_id ?? `user-${Date.now()}`,
            role: "user",
            text: message.text ?? "",
            partial: false,
          });
        } else if (message.type === "transcript.agent.delta") {
          const id = message.item_id ?? message.reply_id ?? "agent-partial";
          setTranscript((current) => {
            const index = current.findIndex((item) => item.id === id);

            if (index === -1) {
              return [
                ...current,
                {
                  id,
                  role: "agent",
                  text: message.delta ?? "",
                  partial: true,
                },
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
          upsertTranscript({
            id: message.item_id ?? message.reply_id ?? `agent-${Date.now()}`,
            role: "agent",
            text: message.text ?? "",
            partial: false,
          });
        } else if (
          message.type === "reply.done" &&
          message.status === "interrupted"
        ) {
          playbackTimeRef.current = audioContext.currentTime;
        } else if (message.type === "session.ended") {
          addTranscript({
            id: `system-${Date.now()}`,
            role: "system",
            text: "Session ended.",
          });
          cleanup();
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
        cleanup();
      });

      ws.addEventListener("error", () => {
        setStatus("WebSocket error.");
      });
    } catch (error) {
      cleanup();
      setStatus(error instanceof Error ? error.message : "Failed to start call.");
    }
  }

  function stopCall() {
    const ws = wsRef.current;

    setStatus("Ending call...");

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session.end" }));
    } else {
      cleanup();
    }
  }

  useEffect(() => {
    function endOnPageHide() {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "session.end" }));
      }
    }

    window.addEventListener("pagehide", endOnPageHide);

    return () => {
      window.removeEventListener("pagehide", endOnPageHide);
      cleanup();
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold">AI Front Desk Voice Demo</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Paste an AssemblyAI agent ID, start a browser call, and speak through
            your microphone.
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
          />
          <div className="flex gap-3">
            <button
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              type="button"
              onClick={startCall}
              disabled={isCalling}
            >
              Start Call
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
