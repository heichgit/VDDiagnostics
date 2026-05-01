/**
 * Interpretación del texto Whisper para campos Eco Doppler.
 * Decimales: primer número reconocido (coma/punto, también “coma” hablada).
 * Combos: palabras clave en español + número de opción cuando coincide con la lista.
 */

export type EcoSelectOption = { id: string; descripcion: string };

export type EcoVoiceKind = "decimal" | "motilidad" | "valvula" | "fdvi";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Igual que sanitizeDecimal2 del modal: hasta 2 decimales, un solo punto. */
export function sanitizeEcoDecimal(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    const [intp, frac = ""] = s.split(".");
    s = intp + "." + frac.slice(0, 2);
  }
  return s;
}

/** Primer valor numérico en el texto (tras normalizar “coma” hablada). */
export function parseDecimalFromTranscript(raw: string): string | null {
  let s = stripDiacritics(raw.toLowerCase().trim());
  s = s.replace(/\bcoma\b/g, ".").replace(/,/g, ".");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return m[1];
}

function normPhrase(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, " ").trim();
}

export function matchSelectFromTranscript(transcript: string, opts: readonly EcoSelectOption[]): string | null {
  const t = normPhrase(transcript);
  if (!t) return null;

  const idM = t.match(/\b(\d{1,2})\b/);
  if (idM && opts.some((o) => o.id === idM[1])) return idM[1];

  let bestId: string | null = null;
  let best = 0;

  for (const o of opts) {
    let score = 0;
    const d = normPhrase(o.descripcion);

    if (t.includes(d.slice(0, Math.min(24, d.length)))) score += 12;

    const words = d.split(" ").filter((w) => w.length > 3);
    for (const w of words) {
      if (t.includes(w)) score += 3;
    }

    if (o.id === "2" && /\b(area|cm2|cm\b|cuantific|medir|numer)/i.test(t)) score += 6;
    if (o.id === "3" && /(no valorable|no evaluable|tecnica limitada|mala ventana)/i.test(t)) score += 10;

    if (score > best) {
      best = score;
      bestId = o.id;
    }
  }

  const THRESH = opts.length <= 5 ? 3 : 4;
  return best >= THRESH ? bestId : null;
}

export function matchValvulaFuncion(transcript: string, opts: readonly EcoSelectOption[]): string | null {
  const t = normPhrase(transcript);
  if (!t) return null;

  if (/(severa|grave)/i.test(t)) return opts.find((o) => o.id === "10")?.id ?? null;
  if (/moderad/i.test(t)) return opts.find((o) => o.id === "9")?.id ?? null;
  if (/leve\b/i.test(t)) return opts.find((o) => o.id === "7")?.id ?? null;
  if (/(protesis|prot[eé]sis|mec[aá]nic)/i.test(t)) return opts.find((o) => o.id === "11")?.id ?? null;
  if (/(sin alteracion|normal\s*$|funcion valvular normal)/i.test(t)) return opts.find((o) => o.id === "8")?.id ?? null;

  return matchSelectFromTranscript(transcript, opts);
}

export function matchFdvi(transcript: string, opts: readonly EcoSelectOption[]): string | null {
  const t = normPhrase(transcript);
  if (!t) return null;

  if (/\bnormal\b/i.test(t)) return opts.find((o) => o.id === "1")?.id ?? null;
  if (/(grado\s*(iii|3|tres)|alteracion.*(iii|3)|mayor)/i.test(t)) return opts.find((o) => o.id === "4")?.id ?? null;
  if (/(grado\s*(ii|2|dos))/i.test(t)) return opts.find((o) => o.id === "3")?.id ?? null;
  if (/(grado\s*(i|1|uno)|alteracion leve)/i.test(t)) return opts.find((o) => o.id === "2")?.id ?? null;

  return matchSelectFromTranscript(transcript, opts);
}

export function matchMotilidad(transcript: string, opts: readonly EcoSelectOption[]): string | null {
  const t = normPhrase(transcript);
  if (!t) return null;

  if (/(no valorable|no evaluable|tecnica limitada)/i.test(t)) return opts.find((o) => o.id === "3")?.id ?? null;
  if (/(area valvular|indicar cm|hay que medir|opcion dos\b|\b2\b)/i.test(t)) return opts.find((o) => o.id === "2")?.id ?? null;
  if (/(normal|sin cuantif)/i.test(t)) return opts.find((o) => o.id === "1")?.id ?? null;

  return matchSelectFromTranscript(transcript, opts);
}

export function interpretEcoVoice(
  kind: EcoVoiceKind,
  transcript: string,
  opts: readonly EcoSelectOption[] | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
  const t = transcript.trim();
  if (!t) return { ok: false, message: "Transcripción vacía." };

  if (kind === "decimal") {
    const parsed = parseDecimalFromTranscript(t);
    if (!parsed) return { ok: false, message: "No se reconoció un número en el dictado." };
    const value = sanitizeEcoDecimal(parsed);
    if (value === "" || value === ".") return { ok: false, message: "Valor numérico inválido." };
    return { ok: true, value };
  }

  if (!opts?.length) return { ok: false, message: "Lista de opciones no disponible." };

  let id: string | null = null;
  if (kind === "motilidad") id = matchMotilidad(t, opts);
  else if (kind === "valvula") id = matchValvulaFuncion(t, opts);
  else id = matchFdvi(t, opts);

  if (!id)
    return {
      ok: false,
      message: "No se reconoció la opción. Probá palabras como en el desplegable o el número de opción.",
    };
  return { ok: true, value: id };
}

/** Comando de voz para mover el foco al campo siguiente/anterior en el flujo ordenado. */
export type EcoVoiceNav = "next" | "prev";

/**
 * Detecta «siguiente campo», «anterior», etc. sin confundir con valores que llevan números.
 * No activa navegación si el texto es largo o contiene dígitos (p. ej. «siguiente 1.5»).
 */
export function parseEcoVoiceNavigation(transcript: string): EcoVoiceNav | null {
  const raw = transcript.trim();
  if (!raw) return null;
  const t = normPhrase(raw).replace(/[.,;:!?¡¿]+$/g, "").trim();
  if (!t || t.length > 56) return null;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.some((w) => /\d/.test(w))) return null;

  const joined = words.join(" ");

  if (
    /^(siguiente|proximo|prox\.?\s*campo|campo\s+siguiente|siguiente\s+campo|adelante|avanza(r)?|pasar)$/i.test(
      joined,
    )
  )
    return "next";
  if (/^(anterior|atras|campo\s+anterior|anterior\s+campo|volver|retroceder)$/i.test(joined)) return "prev";

  if (words.length <= 5) {
    if (/^(siguiente|proximo)(\s+campo)?$/i.test(joined)) return "next";
    if (/^(anterior|atras)(\s+campo)?$/i.test(joined)) return "prev";
    if (/\b(siguiente\s+campo|campo\s+siguiente)\b/.test(t)) return "next";
    if (/\b(campo\s+anterior|anterior\s+campo)\b/.test(t)) return "prev";
  }

  return null;
}
