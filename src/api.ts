const TOKEN_KEY = "vdd_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const t = getToken();
  const headers = new Headers(init?.headers);
  if (t) headers.set("Authorization", `Bearer ${t}`);
  return fetch(path, { ...init, headers });
}
