import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

let poolPromise = null;

function dbConfigFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    const username = decodeURIComponent(url.username || "");
    const password = decodeURIComponent(url.password || "");
    const database = url.pathname ? url.pathname.replace(/^\//, "") : "";
    return {
      host: url.hostname || "127.0.0.1",
      port: Number(url.port || 3306),
      user: username || "root",
      password,
      database: database || "imake",
    };
  }
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "imake",
  };
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const cfg = dbConfigFromEnv();
      const pool = mysql.createPool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        connectionLimit: 10,
        namedPlaceholders: false,
        charset: "utf8mb4",
        timezone: "Z",
      });
      await pool.query("SELECT 1");
      await ensureSchema(pool);
      return pool;
    })();
  }
  return poolPromise;
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      store_id VARCHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY ux_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id VARCHAR(64) NOT NULL,
      owner_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      visibility ENUM('private','public') NOT NULL DEFAULT 'private',
      publish_status ENUM('none','pending','approved') NOT NULL DEFAULT 'none',
      label_width_mm DECIMAL(10,2) NOT NULL,
      label_height_mm DECIMAL(10,2) NOT NULL,
      label_dpi INT NOT NULL,
      objects_json JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      KEY ix_templates_owner_updated (owner_id, updated_at),
      KEY ix_templates_visibility_updated (visibility, updated_at),
      KEY ix_templates_publish_status_updated (publish_status, updated_at),
      CONSTRAINT fk_templates_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function createUser({ id, email, password, role, storeId }) {
  const pool = await getPool();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  await pool.execute(
    "INSERT INTO users (id, email, password_hash, role, store_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, email, passwordHash, role, storeId, now]
  );
  const user = { id, email, passwordHash, role, storeId, createdAt: now.toISOString() };
  return user;
}

export async function hasAnyUsers() {
  const pool = await getPool();
  const [rows] = await pool.query("SELECT 1 AS one FROM users LIMIT 1");
  return Array.isArray(rows) && rows.length > 0;
}

export async function findUserByEmail(email) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    "SELECT id, email, password_hash, role, store_id, created_at FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    storeId: row.store_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getUserById(id) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    "SELECT id, email, password_hash, role, store_id, created_at FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    storeId: row.store_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listTemplatesForUser(userId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `
      SELECT
        id, name, owner_id, visibility, publish_status,
        label_width_mm, label_height_mm, label_dpi,
        updated_at
      FROM templates
      WHERE visibility = 'public' OR owner_id = ?
      ORDER BY updated_at DESC
    `,
    [userId]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: r.owner_id,
    visibility: r.visibility,
    publishStatus: r.publish_status,
    label: { widthMm: Number(r.label_width_mm), heightMm: Number(r.label_height_mm), dpi: Number(r.label_dpi) },
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function createTemplate({ id, ownerId, name, visibility, publishStatus, label, objects }) {
  const pool = await getPool();
  const now = new Date();
  const widthMm = Number(label?.widthMm ?? 50);
  const heightMm = Number(label?.heightMm ?? 30);
  const dpi = Number(label?.dpi ?? 203);
  const objectsJson = JSON.stringify(Array.isArray(objects) ? objects : []);
  await pool.execute(
    `
      INSERT INTO templates
        (id, owner_id, name, visibility, publish_status, label_width_mm, label_height_mm, label_dpi, objects_json, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [id, ownerId, name, visibility, publishStatus, widthMm, heightMm, dpi, objectsJson, now, now]
  );

  return {
    id,
    ownerId,
    name,
    visibility,
    publishStatus,
    label: { widthMm, heightMm, dpi },
    objects: Array.isArray(objects) ? objects : [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function getTemplateById(id) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `
      SELECT
        id, owner_id, name, visibility, publish_status,
        label_width_mm, label_height_mm, label_dpi,
        objects_json,
        created_at, updated_at
      FROM templates
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    visibility: row.visibility,
    publishStatus: row.publish_status,
    label: { widthMm: Number(row.label_width_mm), heightMm: Number(row.label_height_mm), dpi: Number(row.label_dpi) },
    objects: parseJson(row.objects_json, []),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function updateTemplate(id, patch) {
  const prev = await getTemplateById(id);
  if (!prev) return null;
  const pool = await getPool();
  const next = {
    ...prev,
    ...patch,
    label: patch.label ?? prev.label,
    objects: patch.objects ?? prev.objects,
    updatedAt: new Date().toISOString(),
  };
  const widthMm = Number(next.label?.widthMm ?? 50);
  const heightMm = Number(next.label?.heightMm ?? 30);
  const dpi = Number(next.label?.dpi ?? 203);
  const objectsJson = JSON.stringify(Array.isArray(next.objects) ? next.objects : []);
  const updatedAt = new Date();

  await pool.execute(
    `
      UPDATE templates
      SET
        name = ?,
        visibility = ?,
        publish_status = ?,
        label_width_mm = ?,
        label_height_mm = ?,
        label_dpi = ?,
        objects_json = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      next.name,
      next.visibility,
      next.publishStatus,
      widthMm,
      heightMm,
      dpi,
      objectsJson,
      updatedAt,
      id,
    ]
  );

  return {
    ...next,
    label: { widthMm, heightMm, dpi },
    objects: Array.isArray(next.objects) ? next.objects : [],
    updatedAt: updatedAt.toISOString(),
  };
}

export async function requestPublishTemplate(id) {
  const tpl = await getTemplateById(id);
  if (!tpl) return null;
  if (tpl.visibility === "public") return tpl;
  return updateTemplate(id, { publishStatus: "pending" });
}

export async function listPendingPublishTemplates() {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `
      SELECT
        id, name, owner_id, visibility, publish_status,
        label_width_mm, label_height_mm, label_dpi,
        updated_at
      FROM templates
      WHERE publish_status = 'pending' AND visibility <> 'public'
      ORDER BY updated_at DESC
    `
  );
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: r.owner_id,
    visibility: r.visibility,
    publishStatus: r.publish_status,
    label: { widthMm: Number(r.label_width_mm), heightMm: Number(r.label_height_mm), dpi: Number(r.label_dpi) },
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function publishTemplate(id) {
  const tpl = await getTemplateById(id);
  if (!tpl) return null;
  return updateTemplate(id, { visibility: "public", publishStatus: "approved" });
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}
