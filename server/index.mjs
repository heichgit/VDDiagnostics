import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import {
  canReadDiagnosticos,
  canTranscribe,
  canWriteDiagnostico,
  canManageUsers,
} from "./lib/roles.mjs";
import { signToken, verifyToken } from "./lib/jwt.mjs";
import * as users from "./lib/usersStore.mjs";
import {
  insertDiagnosticoSql,
  isSqlConfigured,
  listDiagnosticosSql,
} from "../api/src/lib/sqlDiagnosticos.js";
import { getStorageConnectionString } from "../api/src/lib/storageConnection.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "diagnosticos.json");
const DIST = path.join(ROOT, "dist");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function maxRecordingMinutesFromEnv() {
  const raw = process.env.MAX_RECORDING_MINUTES;
  const parsed =
    raw != null && String(raw).trim() !== "" ? Number.parseFloat(String(raw).trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(Math.max(parsed, 0.5), 120);
}

function diagnosticosDbMode() {
  if (isSqlConfigured()) return "sql";
  if (getStorageConnectionString()) return "blob";
  return "none";
}

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({
    maxRecordingMinutes: maxRecordingMinutesFromEnv(),
    diagnosticosDb: diagnosticosDbMode(),
  });
});

function extractAccessToken(req) {
  const b = req.body;
  if (b && typeof b === "object" && typeof b._vdd_jwt === "string" && b._vdd_jwt.trim()) {
    return b._vdd_jwt.trim();
  }
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const x = req.headers["x-vdd-token"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return null;
}

function requireAuth(req, res, next) {
  const raw = extractAccessToken(req);
  if (!raw) {
    return res.status(401).json({ error: "Se requiere autenticación" });
  }
  try {
    req.auth = verifyToken(raw);
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

async function readDiagnoses() {
  if (isSqlConfigured()) {
    return await listDiagnosticosSql();
  }
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeDiagnoses(list) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "Servidor sin JWT_SECRET configurado" });
    }
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña requeridos" });
    }
    const user = await users.verifyCredentials(email, password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const token = signToken({ sub: user.id, email: user.email, roles: user.roles });
    return res.json({
      token,
      user: { id: user.id, email: user.email, roles: user.roles },
    });
  } catch (e) {
    console.error("[login]", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/auth/me", (req, res) => {
  const raw = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!raw) {
    return res.status(401).json({ error: "Se requiere el campo token en el cuerpo JSON" });
  }
  try {
    const auth = verifyToken(raw);
    return res.json({ id: auth.sub, email: auth.email, roles: auth.roles });
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    id: req.auth.sub,
    email: req.auth.email,
    roles: req.auth.roles,
  });
});

app.get("/api/users", requireAuth, async (req, res) => {
  if (!canManageUsers(req.auth.roles)) {
    return res.status(403).json({ error: "Sin permiso para administrar usuarios" });
  }
  try {
    const list = await users.listUsersPublic();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/users", requireAuth, async (req, res) => {
  if (!canManageUsers(req.auth.roles)) {
    return res.status(403).json({ error: "Sin permiso para administrar usuarios" });
  }
  try {
    const created = await users.createUser({
      email: req.body?.email,
      password: req.body?.password,
      roles: req.body?.roles,
    });
    res.status(201).json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.includes("ya está") ? 409 : 400;
    res.status(code).json({ error: msg });
  }
});

app.post(
  "/api/transcribe",
  upload.single("audio"),
  requireAuth,
  (req, res, next) => {
    if (!canTranscribe(req.auth.roles)) {
      return res.status(403).json({
        error: "Sin permiso para transcripción por voz (se requieren roles usuario y transcripcion)",
      });
    }
    next();
  },
  async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Falta OPENAI_API_KEY en .env" });
  }
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ error: "Archivo de audio requerido (campo: audio)" });
  }

  try {
    const client = new OpenAI({ apiKey: key });
    const mime = req.file.mimetype || "audio/webm";
    const ext = mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : "webm";
    const file = await toFile(req.file.buffer, `dictado.${ext}`, { type: mime });

    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "es",
    });

    return res.json({ text: result.text ?? "" });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[transcribe]", msg);
    return res.status(502).json({ error: "Whisper no disponible", detail: msg });
  }
},
);

app.get("/api/diagnosticos", requireAuth, async (req, res) => {
  if (!canReadDiagnosticos(req.auth.roles)) {
    return res.status(403).json({ error: "Sin permiso para ver diagnósticos" });
  }
  try {
    const list = await readDiagnoses();
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Mismo listado con POST + JWT en cuerpo (Static Web Apps / proxy). */
app.post("/api/diagnosticos/list", requireAuth, async (req, res) => {
  if (!canReadDiagnosticos(req.auth.roles)) {
    return res.status(403).json({ error: "Sin permiso para ver diagnósticos" });
  }
  try {
    const list = await readDiagnoses();
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/diagnosticos", requireAuth, async (req, res) => {
  if (!canWriteDiagnostico(req.auth.roles)) {
    return res.status(403).json({ error: "Sin permiso para crear diagnósticos" });
  }
  const {
    pacienteRef = "",
    estudioTipo = "",
    imagenRef = "",
    transcripcion = "",
    notas = "",
  } = req.body ?? {};

  if (!String(transcripcion).trim() && !String(notas).trim()) {
    return res.status(400).json({ error: "Indica transcripción o notas" });
  }

  try {
    const entry = {
      id: crypto.randomUUID(),
      pacienteRef: String(pacienteRef).trim(),
      estudioTipo: String(estudioTipo).trim(),
      imagenRef: String(imagenRef).trim(),
      transcripcion: String(transcripcion).trim(),
      notas: String(notas).trim(),
      creadoEn: new Date().toISOString(),
    };
    if (isSqlConfigured()) {
      await insertDiagnosticoSql(entry);
      return res.status(201).json(entry);
    }
    const list = await readDiagnoses();
    list.unshift(entry);
    await writeDiagnoses(list);
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = Number(process.env.PORT) || 8787;
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  app.use(express.static(DIST));
  app.get("*", (_req, res, next) => {
    res.sendFile(path.join(DIST, "index.html"), (err) => (err ? next(err) : undefined));
  });
}

await ensureDataFile();
await users.bootstrapAdminIfEmpty();
app.listen(PORT, () => {
  console.log(`API en http://127.0.0.1:${PORT}`);
  if (isProd) console.log(`Sirviendo estáticos desde ${DIST}`);
});
