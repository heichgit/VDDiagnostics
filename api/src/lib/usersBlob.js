import { BlobServiceClient } from "@azure/storage-blob";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { R } from "./roles.js";

const CONTAINER = "vddiagnostics-data";
const BLOB_NAME = "usuarios-auth.json";

const ALLOWED = new Set(Object.values(R));

/** @typedef {{ id: string, email: string, passwordHash: string, roles: string[] }} UserRow */

/**
 * @param {string} connectionString
 * @returns {Promise<UserRow[]>}
 */
export async function readUsers(connectionString) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB_NAME);
  try {
    const buf = await blob.downloadToBuffer();
    const data = JSON.parse(buf.toString("utf8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    const code = e?.details?.errorCode ?? e?.code;
    if (e?.statusCode === 404 || code === "BlobNotFound") return [];
    throw e;
  }
}

/**
 * @param {string} connectionString
 * @param {UserRow[]} list
 */
export async function writeUsers(connectionString, list) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB_NAME);
  const body = JSON.stringify(list, null, 2);
  const buf = Buffer.from(body, "utf8");
  await blob.uploadData(buf, {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

/**
 * @param {string} connectionString
 * @param {string} email
 */
export async function findUserByEmail(connectionString, email) {
  const e = String(email).toLowerCase().trim();
  const users = await readUsers(connectionString);
  return users.find((u) => u.email.toLowerCase() === e) ?? null;
}

/** @param {unknown} roles */
function sanitizeRolesInput(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return [R.USUARIO];
  const out = [...new Set(roles.map((r) => String(r).toLowerCase().trim()).filter((r) => ALLOWED.has(r)))];
  return out.length ? out : [R.USUARIO];
}

/**
 * @param {string} connectionString
 */
export async function bootstrapAdminIfEmpty(connectionString, log) {
  let users = await readUsers(connectionString);
  if (users.length > 0) return users;

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const plain = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !plain || !process.env.JWT_SECRET) {
    if (typeof log === "function") {
      log("[auth] Sin usuarios: configurá INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD y JWT_SECRET para el primer admin.");
    }
    return users;
  }

  const passwordHash = await bcrypt.hash(String(plain), 10);
  users = [
    {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      roles: [R.ADMIN, R.USUARIO, R.TRANSCRIPCION, R.OPERADOR],
    },
  ];
  await writeUsers(connectionString, users);
  if (typeof log === "function") {
    log(`[auth] Administrador inicial creado: ${email}`);
  }
  return users;
}

/**
 * @param {string} connectionString
 */
export async function verifyCredentials(connectionString, email, password) {
  await bootstrapAdminIfEmpty(connectionString, undefined);
  const u = await findUserByEmail(connectionString, email);
  if (!u) return null;
  const ok = await bcrypt.compare(String(password), u.passwordHash);
  if (!ok) return null;
  return { id: u.id, email: u.email, roles: u.roles };
}

/**
 * @param {string} connectionString
 */
export async function createUser(connectionString, input) {
  const email = String(input.email).toLowerCase().trim();
  if (!email || !input.password) throw new Error("Email y contraseña requeridos");

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const users = await readUsers(connectionString);
    if (users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error("El email ya está registrado");
    }
    const passwordHash = await bcrypt.hash(String(input.password), 10);
    const row = {
      id: randomUUID(),
      email,
      passwordHash,
      roles: sanitizeRolesInput(input.roles),
    };
    const next = [...users, row];
    try {
      await writeUsers(connectionString, next);
      return { id: row.id, email: row.email, roles: row.roles };
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 100 * attempt));
    }
  }
  throw new Error("No se pudo crear el usuario");
}

/**
 * @param {string} connectionString
 */
export async function listUsersPublic(connectionString) {
  const users = await readUsers(connectionString);
  return users.map((u) => ({ id: u.id, email: u.email, roles: u.roles }));
}
