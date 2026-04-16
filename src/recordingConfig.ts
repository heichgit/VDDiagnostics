/**
 * Duración máxima de una grabación para transcribir (minutos).
 * Configuración en build: VITE_MAX_RECORDING_MINUTES (por defecto 5).
 */
export function getMaxRecordingMinutes(): number {
  const raw = import.meta.env.VITE_MAX_RECORDING_MINUTES;
  const parsed =
    raw != null && String(raw).trim() !== ""
      ? Number.parseFloat(String(raw).trim())
      : 5;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(Math.max(parsed, 0.5), 120);
}

export function getMaxRecordingMs(): number {
  return getMaxRecordingMinutes() * 60 * 1000;
}

export function formatMaxRecordingLabel(minutes: number): string {
  if (Number.isInteger(minutes)) return `${minutes} min`;
  return `${minutes.toLocaleString("es", { maximumFractionDigits: 1 })} min`;
}
