// AssemblyAI documented catalog, verified 2026-09-29. No gender/age/style claims.
export const ASSEMBLYAI_VOICES = [
  { id: "alba", name: "Alba", language: "English", accent: "US" },
  { id: "eve", name: "Eve", language: "English", accent: "US" },
  { id: "george", name: "George", language: "English", accent: "US" },
  { id: "jane", name: "Jane", language: "English", accent: "US" },
  { id: "jean", name: "Jean", language: "English", accent: "US" },
  { id: "mary", name: "Mary", language: "English", accent: "US" },
  { id: "michael", name: "Michael", language: "English", accent: "US" },
  { id: "anna", name: "Anna", language: "English", accent: "UK" },
  { id: "charles", name: "Charles", language: "English", accent: "UK" },
  { id: "paul", name: "Paul", language: "English", accent: "UK" },
  { id: "vera", name: "Vera", language: "English", accent: "UK" },
  { id: "giovanni", name: "Giovanni", language: "Italian", accent: null },
  { id: "lola", name: "Lola", language: "Spanish", accent: null },
  { id: "juergen", name: "Juergen", language: "German", accent: null },
  { id: "rafael", name: "Rafael", language: "Portuguese", accent: null },
  { id: "estelle", name: "Estelle", language: "French", accent: null },
] as const;

export type VoiceId = typeof ASSEMBLYAI_VOICES[number]["id"];
export const DEFAULT_VOICE_ID: VoiceId = "alba";
export function isVoiceId(value: unknown): value is VoiceId {
  return ASSEMBLYAI_VOICES.some((voice) => voice.id === value);
}
export function requireVoiceId(value: unknown): VoiceId {
  if (!isVoiceId(value)) throw new Error("Unsupported AssemblyAI voice ID.");
  return value;
}
export function savedVoiceId(agent: { voice_id?: unknown; blueprint?: { voice_id?: unknown } | null }): VoiceId {
  if (isVoiceId(agent.voice_id)) return agent.voice_id;
  return isVoiceId(agent.blueprint?.voice_id) ? agent.blueprint.voice_id : DEFAULT_VOICE_ID;
}

// Product recommendation heuristics, NOT provider gender metadata. Always preview.
export const VOICE_SUGGESTIONS = {
  feminine: { US: "alba", UK: "anna" },
  masculine: { US: "michael", UK: "charles" },
} as const;

export function selectPromptVoice(prompt: string, override?: VoiceId): VoiceId {
  if (override !== undefined) return requireVoiceId(override);
  // Require voice context so a business owner named Anna doesn't change the voice.
  const ids = ASSEMBLYAI_VOICES.map((voice) => voice.id).join("|");
  const explicit = prompt.match(new RegExp(`\\bvoice(?:[ _-]?id)?[\\s:=\"']+(?:[\"']?)(` + ids + `)\\b|\\b(` + ids + `)\\s+voice\\b`, "i"));
  if (explicit) return requireVoiceId((explicit[1] ?? explicit[2]).toLowerCase());
  const accent = /\b(british|uk)\b/i.test(prompt) ? "UK" : "US";
  if (/\b(female|feminine|woman)\b/i.test(prompt)) return VOICE_SUGGESTIONS.feminine[accent];
  if (/\b(male|masculine|man)\b/i.test(prompt)) return VOICE_SUGGESTIONS.masculine[accent];
  return DEFAULT_VOICE_ID;
}

const PREVIEW_GREETINGS = {
  English: "Hello! How can I help you?",
  Italian: "Ciao! Come posso aiutarti?",
  Spanish: "¡Hola! ¿Cómo puedo ayudarte?",
  German: "Hallo! Wie kann ich helfen?",
  Portuguese: "Olá! Como posso ajudar?",
  French: "Bonjour ! Comment puis-je vous aider ?",
} as const;

export function voicePreviewSession(voiceId: VoiceId) {
  const voice = ASSEMBLYAI_VOICES.find((item) => item.id === requireVoiceId(voiceId))!;
  return {
    system_prompt: "Speak only the supplied greeting. Do not continue or call tools.",
    greeting: PREVIEW_GREETINGS[voice.language],
    output: { voice: voice.id, format: { encoding: "audio/pcm" } },
    tools: [],
  };
}
