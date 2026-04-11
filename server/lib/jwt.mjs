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
    {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
    },
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
