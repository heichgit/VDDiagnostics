/** Roles en minúsculas (JWT y API). */
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

/** Ver estudios / listado de diagnósticos. */
export function canReadDiagnosticos(roles) {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) || n.has(R.TRANSCRIPCION) || n.has(R.OPERADOR);
}

/** Crear o editar diagnóstico (formulario guardar). */
export function canWriteDiagnostico(roles) {
  if (isAdmin(roles)) return true;
  return normRoles(roles).includes(R.USUARIO);
}

/** Grabación + Whisper: requiere rol usuario Y rol transcripcion (admin siempre). */
export function canTranscribe(roles) {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) && n.has(R.TRANSCRIPCION);
}

/** Alta de usuarios y asignación de roles. */
export function canManageUsers(roles) {
  return isAdmin(roles);
}
