import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

async function readJson(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      const err = new Error("Payload muito grande");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    const err = new Error("JSON inválido");
    err.statusCode = 400;
    throw err;
  }
}

function validateHost(host) {
  const h = String(host ?? "").trim();
  if (!h || h.length > 255) return null;
  return h;
}

function validatePort(port) {
  const p = Number(port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return null;
  return Math.trunc(p);
}

function sendRawToPrinter({ host, port, data, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs, () => done(new Error("Timeout conectando/enviando para a impressora")));
    socket.on("error", (e) => done(e));
    socket.connect(port, host, () => {
      socket.write(data, "utf8", () => {
        socket.end();
      });
    });
    socket.on("close", () => done());
  });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/print") {
    try {
      const body = await readJson(req, 2 * 1024 * 1024);
      const host = validateHost(body?.host);
      const port = validatePort(body?.port ?? 9100);
      const zpl = String(body?.zpl ?? "");

      if (!host) return json(res, 400, { error: "Host inválido" });
      if (!port) return json(res, 400, { error: "Porta inválida" });
      if (!zpl || zpl.length > 2 * 1024 * 1024) return json(res, 400, { error: "ZPL inválido" });

      await sendRawToPrinter({ host, port, data: zpl });
      json(res, 200, { ok: true });
    } catch (e) {
      const status = Number(e?.statusCode || 500);
      json(res, status, { error: String(e?.message || "Erro ao imprimir") });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

const port = Number(process.env.PRINT_AGENT_PORT ?? 8787);
server.listen(port, () => {
  process.stdout.write(`http://localhost:${port}\n`);
});
