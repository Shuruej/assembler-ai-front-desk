import { voicePreviewSession, type VoiceId } from "./voices";

export type PreviewState = { phase: "idle" | "loading" | "playing" | "error"; voice?: VoiceId; message?: string };
let stopCurrent: (() => void) | undefined;

/** One real, microphone-free preview per page, even across multiple pickers. */
export function startVoicePreview(voice: VoiceId, onState: (state: PreviewState) => void): () => void {
  stopCurrent?.();
  const controller = new AbortController();
  let context: AudioContext | undefined;
  let socket: WebSocket | undefined;
  let stopped = false;
  let completed = false;
  let receivedAudio = false;
  let samples = 0;
  let nextTime = 0;
  let pendingByte: number | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const sources = new Set<AudioBufferSourceNode>();

  function endSession() {
    if (!socket) return;
    socket.onmessage = socket.onerror = socket.onclose = socket.onopen = null;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "session.end" }));
    socket.close();
    socket = undefined;
  }
  function finish(message?: string) {
    if (stopped) return;
    stopped = true;
    controller.abort();
    clearTimeout(deadline);
    clearTimeout(drainTimer);
    endSession();
    sources.forEach((source) => { source.onended = null; source.stop(); source.disconnect(); });
    sources.clear();
    if (context) void context.close().catch(() => {});
    if (stopCurrent === stop) stopCurrent = undefined;
    onState(message ? { phase: "error", voice, message } : { phase: "idle" });
  }
  const stop = () => finish();
  stopCurrent = stop;
  const deadline = setTimeout(() => finish("Preview timed out. Please try again."), 20000);
  onState({ phase: "loading", voice });

  // AudioContext is created/resumed synchronously in the button's user gesture.
  void (async () => {
    try {
      context = new AudioContext();
      await context.resume();
      if (stopped) return;
      const response = await fetch("/api/voice-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voice }), signal: controller.signal, cache: "no-store",
      });
      const data = await response.json();
      if (stopped) return;
      if (!response.ok || typeof data.token !== "string" || typeof data.ws_url !== "string") {
        finish(response.status === 429 ? "Preview limit reached. Wait a minute and try again." : "Voice preview is unavailable. Please try again.");
        return;
      }
      const url = new URL(data.ws_url);
      url.searchParams.set("token", data.token);
      socket = new WebSocket(url);
      const ws = socket;
      const audio = context;
      ws.onopen = () => {
        if (!stopped) ws.send(JSON.stringify({ type: "session.update", session: voicePreviewSession(voice) }));
      };
      ws.onmessage = (event) => {
        if (stopped || completed) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "reply.audio" && typeof message.data === "string") {
            const raw = atob(message.data);
            const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
            const length = bytes.length + (pendingByte === undefined ? 0 : 1);
            const pcm = new Uint8Array(length);
            if (pendingByte !== undefined) { pcm[0] = pendingByte; pcm.set(bytes, 1); } else pcm.set(bytes);
            pendingByte = length % 2 ? pcm[length - 1] : undefined;
            const count = Math.floor(length / 2);
            if (!count) return;
            samples += count;
            if (samples > 24000 * 8) { finish("Preview exceeded its short audio limit."); return; }
            const buffer = audio.createBuffer(1, count, 24000);
            const channel = buffer.getChannelData(0);
            const view = new DataView(pcm.buffer);
            for (let i = 0; i < count; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
            const source = audio.createBufferSource();
            source.buffer = buffer;
            source.connect(audio.destination);
            sources.add(source);
            source.onended = () => { sources.delete(source); source.disconnect(); };
            nextTime = Math.max(nextTime, audio.currentTime);
            source.start(nextTime);
            nextTime += buffer.duration;
            if (!receivedAudio) { receivedAudio = true; onState({ phase: "playing", voice }); }
          } else if (message.type === "reply.done") {
            if (!receivedAudio || pendingByte !== undefined || message.status === "interrupted") {
              finish("Preview ended without complete audio. Please try again."); return;
            }
            completed = true;
            endSession(); // End billing immediately; buffered audio can finish locally.
            drainTimer = setTimeout(stop, Math.max(0, nextTime - audio.currentTime) * 1000 + 100);
          } else if (message.type === "session.error" || message.type === "error") {
            finish("AssemblyAI could not play this voice. Please try again.");
          }
        } catch { finish("Could not decode the voice preview."); }
      };
      ws.onerror = () => finish("Voice preview connection failed.");
      ws.onclose = () => { if (!completed) finish("Voice preview disconnected. Please try again."); };
    } catch { if (!stopped) finish("Voice preview is unavailable. Please try again."); }
  })();
  return stop;
}
