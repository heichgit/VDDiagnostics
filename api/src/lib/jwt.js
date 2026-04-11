import jwt from "jsonwebtoken";

const DEFAULT_EXPIRES = "12h";

function secret() {
  const s = process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("JWT_SECRET no configurado");
  return s;
}

/**
 * @param {{ sub: string, email: string, roles: string[] }} payload
 */
export function signToken(payload) {
  return jwt.sign(
    { sub: payload.sub, email: payload.email, roles: payload.roles },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES },
  );
}

/**
 * @returns {{ sub: string, email: string, roles: string[] }}
 */
export function verifyToken(token) {
  const decoded = jwt.verify(token, secret());
  if (typeof decoded !== "object" || !decoded) throw new Error("Token inválido");
  const sub = String(decoded.sub ?? "");
  const email = String(decoded.email ?? "");
  const roles = Array.isArray(decoded.roles) ? decoded.roles.map(String) : [];
  if (!sub || !email) throw new Error("Token inválido");
  return { sub, email, roles };
}

/**
 * @param {import("@azure/functions").HttpRequest} request
 * @param {string | null | undefined} bodyJwt JWT enviado en JSON como `_vdd_jwt` (p. ej. Static Web Apps sin cabecera Authorization).
 * @returns {{ sub: string, email: string, roles: string[] } | null}
 */
export function getAuthFromRequest(request, bodyJwt = null) {
  let token = typeof bodyJwt === "string" ? bodyJwt.trim() : "";
  if (!token) {
    const auth = request.headers.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) {
      token = auth.slice(7).trim();
    }
  }
  if (!token) {
    token = (request.headers.get("x-vdd-token") || "").trim();
  }
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
