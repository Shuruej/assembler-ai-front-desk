import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isIP } from "node:net";

export type OutboundConfig = { url: string; method: "GET" | "POST" | "PUT" | "PATCH" };

function encryptionKey(): Buffer {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!raw) throw new Error("CONNECTION_ENCRYPTION_KEY is not configured.");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CONNECTION_ENCRYPTION_KEY must be 32 bytes (hex or base64).");
  return key;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret.");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function validateOutboundConfig(value: unknown, kind: "http" | "webhook"): OutboundConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Connection configuration must be an object.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["url", "method"].includes(key))) throw new Error("Unsupported connection setting.");
  if (typeof input.url !== "string" || input.url.length > 2048) throw new Error("A URL is required.");
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error("Invalid connection URL."); }
  if (url.username || url.password || url.hash || url.search) throw new Error("Credentials, query strings, and fragments are not allowed in connection URLs.");
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (url.protocol === "https:" && isIP(host) !== 0) throw new Error("IP address targets are not allowed.");
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local && process.env.NODE_ENV !== "production"))) throw new Error("Connections require HTTPS (localhost HTTP is development-only).");
  if (!local && (isIP(host) !== 0 || host.endsWith(".local") || host.endsWith(".internal"))) throw new Error("Private network hosts are not allowed.");
  const method = typeof input.method === "string" ? input.method.toUpperCase() : kind === "webhook" ? "POST" : "GET";
  if (!["GET", "POST", "PUT", "PATCH"].includes(method) || (kind === "webhook" && method !== "POST")) throw new Error("Unsupported connection method.");
  return { url: url.toString(), method: method as OutboundConfig["method"] };
}

export async function executeOutbound(config: OutboundConfig, argumentsValue: Record<string, unknown>, secret?: string | null, fetcher: typeof fetch = fetch): Promise<unknown> {
  // Validate at execution too: persisted configuration is not trusted indefinitely.
  const checked = validateOutboundConfig(config, "http");
  const url = new URL(checked.url);
  if (checked.method === "GET") for (const [key, value] of Object.entries(argumentsValue)) if (value != null) url.searchParams.set(key, String(value));
  const response = await fetcher(url, {
    method: checked.method,
    headers: { "content-type": "application/json", ...(secret ? { authorization: secret } : {}) },
    ...(checked.method === "GET" ? {} : { body: JSON.stringify(argumentsValue) }),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`External service returned HTTP ${response.status}.`);
  const raw = (await response.text()).slice(0, 4000);
  try { return JSON.parse(raw); } catch { return { text: raw }; }
}
