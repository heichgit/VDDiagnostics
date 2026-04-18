/** Código numérico de tipo de diagnóstico (cardiológico / imagen). */
export const TIPO_DIAGNOSTICO_NA = 0;
export const TIPO_DIAGNOSTICO_MAX = 36;

export type OpcionTipoDiagnostico = { codigo: number; etiqueta: string };

export const OPCIONES_TIPO_DIAGNOSTICO: readonly OpcionTipoDiagnostico[] = [
  { codigo: 0, etiqueta: "N/A" },
  { codigo: 1, etiqueta: "Estudio Normal" },
  { codigo: 2, etiqueta: "Hipertrofia Ventricular Izquierda" },
  { codigo: 3, etiqueta: "Dilatacion Auricular Izquierda" },
  { codigo: 4, etiqueta: "Patologia Aortica" },
  { codigo: 5, etiqueta: "Aneurisma Aortico" },
  { codigo: 6, etiqueta: "Aneurisma Ventricular Izquierdo" },
  { codigo: 7, etiqueta: "Fibrosis/Calcificacion Valvular" },
  { codigo: 8, etiqueta: "Disfuncion Sistolica VI" },
  { codigo: 9, etiqueta: "Disfuncion Diastolica VI" },
  { codigo: 10, etiqueta: "Disfuncion Sistolica VD" },
  { codigo: 11, etiqueta: "Disfuncion Sistolica Biventricular" },
  { codigo: 12, etiqueta: "Cardiopatia Isquemica" },
  { codigo: 13, etiqueta: "Prolapso Mitral" },
  { codigo: 14, etiqueta: "Insuficiencia Mitral" },
  { codigo: 15, etiqueta: "Insuficiencia Aortica" },
  { codigo: 16, etiqueta: "Estenosis Mitral" },
  { codigo: 17, etiqueta: "Estenosis Aortica" },
  { codigo: 18, etiqueta: "Protesis Aórtica" },
  { codigo: 19, etiqueta: "Protesis Mitral" },
  { codigo: 20, etiqueta: "Protesis Disfuncionante" },
  { codigo: 21, etiqueta: "Miocardiopatia Hipertrofica Obstructiva" },
  { codigo: 22, etiqueta: "Miocardiopatia Hipertrofica No Obstructiva" },
  { codigo: 23, etiqueta: "Miocardiopatia Dilatada" },
  { codigo: 24, etiqueta: "Cardiopatia Infiltrativa/Restrictiva" },
  { codigo: 25, etiqueta: "Miocardiopatia Chagasica" },
  { codigo: 26, etiqueta: "Cardiopatia Congenita" },
  { codigo: 27, etiqueta: "CIA" },
  { codigo: 28, etiqueta: "CIV" },
  { codigo: 29, etiqueta: "Masa Cardiaca" },
  { codigo: 30, etiqueta: "Mixoma Auricular" },
  { codigo: 31, etiqueta: "Vegetacion Valvular" },
  { codigo: 32, etiqueta: "Derrame Pericardico" },
  { codigo: 33, etiqueta: "Pericarditis Constrictiva" },
  { codigo: 34, etiqueta: "Hipertension Pulmonar" },
  { codigo: 35, etiqueta: "Probable tromboembolismo Pulmonar" },
  { codigo: 36, etiqueta: "Endocarditis Infecciosa" },
] as const;

const mapa = new Map<number, string>(OPCIONES_TIPO_DIAGNOSTICO.map((o) => [o.codigo, o.etiqueta]));

export function etiquetaTipoDiagnostico(codigo: unknown): string {
  const n = typeof codigo === "number" ? codigo : Number(codigo);
  if (!Number.isFinite(n)) return mapa.get(0) ?? "N/A";
  const c = Math.min(Math.max(Math.floor(n), TIPO_DIAGNOSTICO_NA), TIPO_DIAGNOSTICO_MAX);
  return mapa.get(c) ?? "N/A";
}

export function normalizarCodigoTipoDiagnostico(val: unknown): number {
  const n = typeof val === "number" ? val : Number.parseInt(String(val), 10);
  if (!Number.isFinite(n) || n < TIPO_DIAGNOSTICO_NA) return TIPO_DIAGNOSTICO_NA;
  if (n > TIPO_DIAGNOSTICO_MAX) return TIPO_DIAGNOSTICO_MAX;
  return Math.floor(n);
}

export function htmlOpcionesTipoDiagnostico(): string {
  return OPCIONES_TIPO_DIAGNOSTICO.map(
    (o) => `<option value="${o.codigo}">${escapeHtml(o.etiqueta)}</option>`,
  ).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
