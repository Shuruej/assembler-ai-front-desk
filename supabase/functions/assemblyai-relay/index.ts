import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ASSEMBLYAI_HTTP_BASE = "https://agents.assemblyai.com";
const ASSEMBLYAI_WS_URL = "wss://agents.assemblyai.com/v1/ws";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleHttpRelay(req: Request, url: URL): Promise<Response> {
  const apiKey = req.headers.get("x-assemblyai-key")?.trim();
  if (!apiKey) return json({ error: "Missing AssemblyAI relay credential." }, 403);

  let targetUrl = "";
  let authorization = apiKey;

  if (url.pathname.endsWith("/token")) {
    targetUrl = `${ASSEMBLYAI_HTTP_BASE}/v1/token${url.search}`;
    authorization = `Bearer ${apiKey}`;
  } else {
    const agentsIndex = url.pathname.lastIndexOf("/agents");
    if (agentsIndex < 0) return json({ error: "Unknown relay path." }, 404);

    const agentsPath = url.pathname.slice(agentsIndex);
    targetUrl = `${ASSEMBLYAI_HTTP_BASE}/v1${agentsPath}${url.search}`;
  }
  const headers = new Headers({ Authorization: authorization });
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
  });

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function handleWebSocketRelay(req: Request, url: URL): Response {
  const token = url.searchParams.get("token")?.trim();
  if (!token) return json({ error: "Missing temporary AssemblyAI token." }, 400);

  const { socket: client, response } = Deno.upgradeWebSocket(req);
  client.binaryType = "arraybuffer";

  const upstream = new WebSocket(
    `${ASSEMBLYAI_WS_URL}?token=${encodeURIComponent(token)}`,
  );
  upstream.binaryType = "arraybuffer";
  const pending: Array<string | ArrayBuffer | Blob> = [];
  let upstreamOpen = false;
  let finished = false;
  let resolveFinished!: () => void;
  const finishedPromise = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    resolveFinished();
  };

  client.onmessage = (event) => {
    const data = event.data as string | ArrayBuffer | Blob;
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    } else {
      pending.push(data);
    }
  };

  upstream.onopen = () => {
    upstreamOpen = true;
    for (const message of pending.splice(0)) upstream.send(message);
  };

  upstream.onmessage = (event) => {
    if (client.readyState === WebSocket.OPEN) client.send(event.data);
  };
  client.onerror = () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) upstream.close(1011, "client websocket error");
    finish();
  };

  upstream.onerror = () => {
    if (
      client.readyState === WebSocket.OPEN ||
      client.readyState === WebSocket.CONNECTING
    ) client.close(1011, "AssemblyAI relay connection failed");
    finish();
  };

  client.onclose = () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) upstream.close(1000, "client closed");
    finish();
  };

  upstream.onclose = (event) => {
    if (
      client.readyState === WebSocket.OPEN ||
      client.readyState === WebSocket.CONNECTING
    ) {
      const code = event.code >= 1000 && event.code <= 4999 ? event.code : 1000;
      client.close(code, event.reason || "AssemblyAI connection closed");
    }
    finish();
  };

  EdgeRuntime.waitUntil(finishedPromise);
  return response;
}
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);

    if (url.pathname.endsWith("/health")) {
      return json({ ok: true, relay: "assemblyai" });
    }

    const upgrade = (req.headers.get("upgrade") || "").toLowerCase();
    if (upgrade === "websocket" && url.pathname.endsWith("/ws")) {
      return handleWebSocketRelay(req, url);
    }

    if (url.pathname.endsWith("/token") || url.pathname.includes("/agents")) {
      return await handleHttpRelay(req, url);
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Relay failure." },
      500,
    );
  }
});
