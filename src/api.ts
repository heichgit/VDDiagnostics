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

  const method = (init?.method || "GET").toUpperCase();
  const ct = headers.get("content-type") || "";
  if (
    t &&
    method !== "GET" &&
    method !== "HEAD" &&
    typeof init?.body === "string" &&
    ct.includes("application/json")
  ) {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return fetch(path, {
          ...init,
          headers,
          body: JSON.stringify({ ...parsed, _vdd_jwt: t }),
        });
      }
    } catch {
      /* cuerpo no JSON */
    }
  }

  return fetch(path, { ...init, headers });
}
