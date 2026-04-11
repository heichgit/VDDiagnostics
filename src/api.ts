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
  const t = getToken()?.trim();
  const headers = new Headers();
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (t) {
    headers.set("Authorization", `Bearer ${t}`);
    headers.set("X-VDD-Token", t);
  }
  return fetch(path, { ...init, headers });
}
