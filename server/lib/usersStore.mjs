import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { R } from "./roles.mjs";

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

/** @typedef {{ id: string, email: string, passwordHash: string, roles: string[] }} UserRow */

async function ensureFile() {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, "[]", "utf8");
  }
}

/** @returns {Promise<UserRow[]>} */
export async function readUsers() {
  await ensureFile();
  const raw = await fs.readFile(USERS_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** @param {UserRow[]} list */
export async function writeUsers(list) {
  await ensureFile();
  await fs.writeFile(USERS_FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function findUserByEmail(email) {
  const e = String(email).toLowerCase().trim();
  const users = await readUsers();
  return users.find((u) => u.email.toLowerCase() === e) ?? null;
}

export async function bootstrapAdminIfEmpty() {
  let users = await readUsers();
  if (users.length > 0) return;

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const plain = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !plain) {
    console.warn(
      "[auth] No hay usuarios. Definí INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD (y JWT_SECRET) para crear el primer administrador.",
    );
    return;
  }

  if (!process.env.JWT_SECRET) {
    console.warn("[auth] JWT_SECRET requerido para bootstrap de admin.");
    return;
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
  await writeUsers(users);
  console.log(`[auth] Usuario administrador inicial creado: ${email}`);
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function verifyCredentials(email, password) {
  const u = await findUserByEmail(email);
  if (!u) return null;
  const ok = await bcrypt.compare(String(password), u.passwordHash);
  if (!ok) return null;
  return { id: u.id, email: u.email, roles: u.roles };
}

/**
 * @param {{ email: string, password: string, roles: string[] }} input
 */
export async function createUser(input) {
  const email = String(input.email).toLowerCase().trim();
  if (!email || !input.password) throw new Error("Email y contraseña requeridos");
  const users = await readUsers();
  if (users.some((u) => u.email.toLowerCase() === email)) throw new Error("El email ya está registrado");
  const passwordHash = await bcrypt.hash(String(input.password), 10);
  const row = {
    id: randomUUID(),
    email,
    passwordHash,
    roles: sanitizeRolesInput(input.roles),
  };
  users.push(row);
  await writeUsers(users);
  return { id: row.id, email: row.email, roles: row.roles };
}

const ALLOWED = new Set(Object.values(R));

/** @param {unknown} roles */
function sanitizeRolesInput(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return [R.USUARIO];
  const out = [...new Set(roles.map((r) => String(r).toLowerCase().trim()).filter((r) => ALLOWED.has(r)))];
  return out.length ? out : [R.USUARIO];
}

/** @returns {Promise<{ id: string, email: string, roles: string[] }[]>} */
export async function listUsersPublic() {
  const users = await readUsers();
  return users.map((u) => ({ id: u.id, email: u.email, roles: u.roles }));
}
