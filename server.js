import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import express from "express";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import {
  createUser,
  hasAnyUsers,
  findUserByEmail,
  getUserById,
  listTemplatesForUser,
  createTemplate,
  getTemplateById,
  updateTemplate,
  requestPublishTemplate,
  listPendingPublishTemplates,
  publishTemplate,
  deleteTemplate,
} from "./src/storage.js";
import { createToken, requireAuth, requireAdmin } from "./src/auth.js";
import { generateZplForTemplate } from "./src/zpl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("unhandledRejection", (reason) => {
  process.stderr.write(
    `[${new Date().toISOString()}] unhandledRejection\n${reason?.stack || String(reason)}\n`
  );
});

process.on("uncaughtException", (err) => {
  process.stderr.write(`[${new Date().toISOString()}] uncaughtException\n${err?.stack || err}\n`);
  process.exitCode = 1;
});

const app = express();
const isProd = process.env.NODE_ENV === "production";
const distDir = path.join(__dirname, "frontend", "dist");
const hasFrontendBuild = fs.existsSync(path.join(distDir, "index.html"));

function getDbDebugInfo() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      return {
        source: "DATABASE_URL",
        host: url.hostname || "",
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username || ""),
        database: url.pathname ? url.pathname.replace(/^\//, "") : "",
      };
    } catch {
      return { source: "DATABASE_URL", host: "", port: 0, user: "", database: "" };
    }
  }
  return {
    source: "DB_*",
    host: process.env.DB_HOST || "",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "",
    database: process.env.DB_NAME || "",
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseMm(value, fallback) {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, 5, 2000);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

if (isProd || process.env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    process.stdout.write(
      `[${new Date().toISOString()}] req ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms\n`
    );
  });
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webmanifest")) {
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      }
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/qr", requireAuth, asyncRoute(async (req, res) => {
  const rawData = String(req.query?.data ?? "");
  const data = rawData.slice(0, 1000);
  const size = Math.max(64, Math.min(512, Math.floor(Number(req.query?.size ?? 256) || 256)));
  if (!data) return res.status(400).json({ error: "Dados do QR vazios" });

  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  https
    .get(url, (qrRes) => {
      if (!qrRes.statusCode || qrRes.statusCode >= 400) {
        res.status(502).json({ error: "Falha ao gerar QR" });
        qrRes.resume();
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=86400");
      qrRes.pipe(res);
    })
    .on("error", () => {
      res.status(502).json({ error: "Falha ao gerar QR" });
    });
}));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const storeId = String(req.body?.storeId ?? "loja-1").trim();

  if (!email || !email.includes("@") || password.length < 6) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "E-mail já cadastrado" });
  }

  const role = (await hasAnyUsers()) ? "user" : "admin";
  const user = await createUser({
    id: nanoid(),
    email,
    password,
    role,
    storeId,
  });

  const token = createToken(user);
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: isProd });
  res.json({ user: { id: user.id, email: user.email, role: user.role, storeId: user.storeId } });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const { verifyPassword } = await import("./src/auth.js");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const token = createToken(user);
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: isProd });
  res.json({ user: { id: user.id, email: user.email, role: user.role, storeId: user.storeId } });
}));

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida" });
  }
  res.json({ user: { id: user.id, email: user.email, role: user.role, storeId: user.storeId } });
}));

app.get("/api/templates", requireAuth, asyncRoute(async (req, res) => {
  const templates = await listTemplatesForUser(req.user.id);
  res.json({ templates });
}));

app.post("/api/templates", requireAuth, asyncRoute(async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Novo modelo";
  const label = req.body?.label ?? {};
  const widthMm = parseMm(label.widthMm, 50);
  const heightMm = parseMm(label.heightMm, 30);
  const dpi = 203;
  const objects = Array.isArray(req.body?.objects) ? req.body.objects : [];

  const template = await createTemplate({
    id: nanoid(),
    ownerId: req.user.id,
    name,
    visibility: "private",
    publishStatus: "none",
    label: { widthMm, heightMm, dpi },
    objects,
  });

  res.json({ template });
}));

app.get("/api/templates/:id", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modelo não encontrado" });
  const canSee = tpl.visibility === "public" || tpl.ownerId === req.user.id || req.user.role === "admin";
  if (!canSee) return res.status(403).json({ error: "Sem permissão" });
  res.json({ template: tpl });
}));

app.put("/api/templates/:id", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modelo não encontrado" });
  if (tpl.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Sem permissão" });
  }

  const name = String(req.body?.name ?? tpl.name).trim() || tpl.name;
  const label = req.body?.label ?? tpl.label;
  const widthMm = parseMm(label.widthMm, tpl.label.widthMm);
  const heightMm = parseMm(label.heightMm, tpl.label.heightMm);
  const dpi = 203;
  const objects = Array.isArray(req.body?.objects) ? req.body.objects : tpl.objects;

  const updated = await updateTemplate(req.params.id, {
    name,
    label: { widthMm, heightMm, dpi },
    objects,
  });
  res.json({ template: updated });
}));

app.delete("/api/templates/:id", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modelo não encontrado" });
  if (tpl.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Sem permissão" });
  }
  const ok = await deleteTemplate(req.params.id);
  res.json({ ok });
}));

app.post("/api/templates/:id/request-publish", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modelo não encontrado" });
  if (tpl.ownerId !== req.user.id) return res.status(403).json({ error: "Sem permissão" });
  const updated = await requestPublishTemplate(req.params.id);
  res.json({ template: updated });
}));

app.get("/api/admin/pending-publish", requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
  const pending = await listPendingPublishTemplates();
  res.json({ templates: pending });
}));

app.post("/api/admin/templates/:id/publish", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const updated = await publishTemplate(req.params.id);
  if (!updated) return res.status(404).json({ error: "Modelo não encontrado" });
  res.json({ template: updated });
}));

app.get("/api/templates/:id/zpl", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modelo não encontrado" });
  const canSee = tpl.visibility === "public" || tpl.ownerId === req.user.id || req.user.role === "admin";
  if (!canSee) return res.status(403).json({ error: "Sem permissão" });
  const zpl = generateZplForTemplate(tpl);
  res.json({ zpl });
}));

app.get("/api/templates/:id/export.zpl", requireAuth, asyncRoute(async (req, res) => {
  const tpl = await getTemplateById(req.params.id);
  if (!tpl) return res.status(404).send("Modelo não encontrado");
  const canSee = tpl.visibility === "public" || tpl.ownerId === req.user.id || req.user.role === "admin";
  if (!canSee) return res.status(403).send("Sem permissão");
  const zpl = generateZplForTemplate(tpl);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(tpl.name)}.zpl"`);
  res.send(zpl);
}));

function sanitizeFilename(name) {
  return String(name)
    .trim()
    .slice(0, 60)
    .replace(/[^\w\-\. ]+/g, "_")
    .replace(/\s+/g, "_") || "modelo";
}

const port = Number(process.env.PORT ?? 3000);
{
  const db = getDbDebugInfo();
  process.stdout.write(
    `[${new Date().toISOString()}] startup node=${process.version} env=${process.env.NODE_ENV || ""} port=${port} dist=${hasFrontendBuild ? "yes" : "no"} dbSource=${db.source} dbHost=${db.host} dbPort=${db.port} dbUser=${db.user} dbName=${db.database}\n`
  );
}
if (hasFrontendBuild) {
  app.use(express.static(distDir, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((err, req, res, _next) => {
  const requestId = nanoid(10);
  process.stderr.write(
    `[${new Date().toISOString()}] error requestId=${requestId} ${req.method} ${req.originalUrl}\n${err?.stack || err}\n`
  );
  if (req.path.startsWith("/api/")) {
    res.status(500).json({ error: "Erro interno", requestId });
    return;
  }
  res.status(500).send("Erro interno");
});

app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Listening on port ${port}\n`);
});
