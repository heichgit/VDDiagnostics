/**
 * Duración máxima de grabación (minutos):
 * 1) GET /api/config → maxRecordingMinutes (Azure: MAX_RECORDING_MINUTES en Application settings)
 * 2) Si falla: VITE_MAX_RECORDING_MINUTES en build
 * 3) Por defecto: 5
 */

let cachedMinutes: number | null = null;

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

/** Carga el valor desde el servidor (Azure/Express) y lo cachea. Llamar al iniciar la app. */
export async function loadRecordingConfig(): Promise<number> {
  if (cachedMinutes != null) return cachedMinutes;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { maxRecordingMinutes?: unknown };
      const n = Number(data?.maxRecordingMinutes);
      if (Number.isFinite(n) && n > 0) {
        cachedMinutes = clampMinutes(n);
        return cachedMinutes;
      }
    }
  } catch {
    /* sin red o API antigua */
  }
  cachedMinutes = fallbackFromVite();
  return cachedMinutes;
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
