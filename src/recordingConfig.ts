/**
 * Duración máxima de grabación (minutos):
 * 1) GET /api/config → maxRecordingMinutes (Azure: MAX_RECORDING_MINUTES en Application settings)
 * 2) Si falla: VITE_MAX_RECORDING_MINUTES en build
 * 3) Por defecto: 5
 *
 * Palabra para partir el dictado masivo Eco Doppler (además de ; y líneas):
 * 1) GET /api/config → ecoBulkChunkKeyword (Azure: ECO_BULK_CHUNK_KEYWORD)
 * 2) Si falla: VITE_ECO_BULK_CHUNK_KEYWORD en build
 * 3) Por defecto: "siguiente". Cadena vacía desactiva el corte por palabra.
 */

/** Solo se guarda si la API devolvió un valor válido (nunca el fallback de Vite). */
let cachedMinutes: number | null = null;

/** `undefined` = aún no vino del servidor; si es string (incluso "") viene de la API. */
let cachedEcoBulkChunkKeyword: string | undefined = undefined;

const DEFAULT_ECO_BULK_CHUNK_KEYWORD = "siguiente";

function clampMinutes(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.max(n, 0.5), 120);
}

function fallbackFromVite(): number {
  const raw = import.meta.env.VITE_MAX_RECORDING_MINUTES;
  const parsed =
    raw != null && String(raw).trim() !== ""
      ? Number.parseFloat(String(raw).trim())
      : Number.NaN;
  return clampMinutes(parsed);
}

function fallbackEcoBulkChunkKeywordFromVite(): string {
  const raw = import.meta.env.VITE_ECO_BULK_CHUNK_KEYWORD;
  if (raw == null || String(raw).trim() === "") return DEFAULT_ECO_BULK_CHUNK_KEYWORD;
  return String(raw).trim().slice(0, 64);
}

function ingestEcoBulkKeywordFromJson(data: unknown): void {
  if (data == null || typeof data !== "object") return;
  const k = (data as { ecoBulkChunkKeyword?: unknown }).ecoBulkChunkKeyword;
  if (typeof k !== "string") return;
  cachedEcoBulkChunkKeyword = k.trim().slice(0, 64);
}

function parseMaxFromJson(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  const n = Number((data as { maxRecordingMinutes?: unknown }).maxRecordingMinutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampMinutes(n);
}

function configUrl(): string {
  if (typeof globalThis.location === "undefined" || !globalThis.location.origin) {
    return "/api/config";
  }
  return `${globalThis.location.origin}/api/config`;
}

/**
 * Carga el valor desde el servidor (Azure/Express) y lo cachea si la respuesta es válida.
 * Reintenta antes de usar VITE_MAX_RECORDING_MINUTES: el fallback no se cachea para no quedar
 * “pegado” en 5 si el primer intento falló (HTML, cold start, etc.).
 */
export async function loadRecordingConfig(options?: { force?: boolean }): Promise<number> {
  if (options?.force) {
    cachedMinutes = null;
    cachedEcoBulkChunkKeyword = undefined;
  }
  if (cachedMinutes != null) return cachedMinutes;

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(configUrl(), {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      let data: unknown;
      if (ct.includes("application/json") || ct.includes("text/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed.startsWith("{")) continue;
        data = JSON.parse(trimmed) as unknown;
      }

      const parsed = parseMaxFromJson(data);
      ingestEcoBulkKeywordFromJson(data);
      if (parsed != null) {
        cachedMinutes = parsed;
        return cachedMinutes;
      }
    } catch {
      /* red, HTML, JSON inválido */
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }

  return fallbackFromVite();
}

/** Usar después de `await loadRecordingConfig()` (o si ya hubo carga). */
export function getMaxRecordingMinutes(): number {
  if (cachedMinutes != null) return cachedMinutes;
  return fallbackFromVite();
}

export function getMaxRecordingMs(): number {
  return getMaxRecordingMinutes() * 60 * 1000;
}

export function formatMaxRecordingLabel(minutes: number): string {
  if (Number.isInteger(minutes)) return `${minutes} min`;
  return `${minutes.toLocaleString("es", { maximumFractionDigits: 1 })} min`;
}

/**
 * Palabra que parte el texto en modo dictado completo Eco Doppler (límites de palabra).
 * Vacío = no cortar por palabra (solo `;`, saltos de línea y reglas largas).
 */
export function getEcoBulkChunkKeyword(): string {
  if (cachedEcoBulkChunkKeyword !== undefined) return cachedEcoBulkChunkKeyword;
  return fallbackEcoBulkChunkKeywordFromVite();
}
