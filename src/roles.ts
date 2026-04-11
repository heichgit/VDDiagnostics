export const R = {
  ADMIN: "admin",
  USUARIO: "usuario",
  TRANSCRIPCION: "transcripcion",
  OPERADOR: "operador",
} as const;

export type Role = (typeof R)[keyof typeof R];

export function normRoles(roles: string[] | undefined): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.map((r) => String(r).toLowerCase().trim()).filter(Boolean);
}

export function isAdmin(roles: string[] | undefined): boolean {
  return normRoles(roles).includes(R.ADMIN);
}

export function canReadDiagnosticos(roles: string[] | undefined): boolean {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) || n.has(R.TRANSCRIPCION) || n.has(R.OPERADOR);
}

export function canWriteDiagnostico(roles: string[] | undefined): boolean {
  if (isAdmin(roles)) return true;
  return normRoles(roles).includes(R.USUARIO);
}

export function canTranscribe(roles: string[] | undefined): boolean {
  if (isAdmin(roles)) return true;
  const n = new Set(normRoles(roles));
  return n.has(R.USUARIO) && n.has(R.TRANSCRIPCION);
}

export function canManageUsers(roles: string[] | undefined): boolean {
  return isAdmin(roles);
}

export function rolesLabel(roles: string[] | undefined): string {
  return normRoles(roles).join(", ") || "—";
}
