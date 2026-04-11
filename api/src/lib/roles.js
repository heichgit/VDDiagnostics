export const R = {
  ADMIN: "admin",
  USUARIO: "usuario",
  TRANSCRIPCION: "transcripcion",
  OPERADOR: "operador",
};

/** @param {unknown} roles */
export function normRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.map((r) => String(r).toLowerCase().trim()).filter(Boolean);
}

/** @param {unknown} roles */
export function isAdmin(roles) {
  return normRoles(roles).includes(R.ADMIN);
}

/** @param {unknown} roles */
export function canReadDiagnosticos(roles) {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) || n.has(R.TRANSCRIPCION) || n.has(R.OPERADOR);
}

/** @param {unknown} roles */
export function canWriteDiagnostico(roles) {
  if (isAdmin(roles)) return true;
  return normRoles(roles).includes(R.USUARIO);
}

/** @param {unknown} roles */
export function canTranscribe(roles) {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) && n.has(R.TRANSCRIPCION);
}

/** @param {unknown} roles */
export function canManageUsers(roles) {
  return isAdmin(roles);
}
