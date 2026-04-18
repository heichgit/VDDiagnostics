/** Código 0–36 alineado con el combo del front (tipo de diagnóstico cardiológico). */
export function normalizarTipoDiagnostico(val) {
  const n = typeof val === "number" ? val : Number.parseInt(String(val ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 36) return 36;
  return Math.floor(n);
}
