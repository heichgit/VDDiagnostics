/**
 * Interpreta un único dictado largo y reparte fragmentos a los campos Eco Doppler.
 * 1) Fragmentos delimitados por ; o salto de línea (y en texto largo por ". ").
 * 2) Cada fragmento se intenta asociar por palabras clave al campo correcto.
 * 3) Los fragmentos sin palabra clave se asignan en orden al primer campo aún vacío.
 */

import {
  type EcoSelectOption,
  type EcoVoiceKind,
  interpretEcoVoice,
  parseEcoVoiceNavigation,
} from "./ecoDopplerVoice";

export type BulkFieldMeta = { kind: EcoVoiceKind; opts?: readonly EcoSelectOption[] };

export type BulkParseResult = {
  values: Record<string, string>;
  errors: string[];
  /** Fragmentos que no encajaron por posición tras el reparto ordenado. */
  leftoverChunkCount: number;
};

type TriggerRow = { id: string; patterns: RegExp[] };

/** Orden: patrones más específicos (pulmonar, tricúspide, aórtica) antes que mitral/genéricos. */
const FIELD_TRIGGERS: TriggerRow[] = [
  {
    id: "eco_gradMaxPulm",
    patterns: [
      /\bgradiente\s+(?:m[aá]ximo|max(?:imo)?)\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?pulmon/i,
      /\bgradiente\s+(?:m[aá]ximo|max)\s+pulmonar/i,
    ],
  },
  {
    id: "eco_vpp",
    patterns: [
      /\bvelocidad\s+(?:de\s+)?pico\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?pulmon/i,
      /\bpico\s+(?:de\s+)?(?:la\s+)?pulmonar\b/i,
      /\bvpp\b/i,
    ],
  },
  {
    id: "eco_valvula4",
    patterns: [
      /\binsuficiencia\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?pulmonar\b/i,
      /\bpulmonar.*\binsuficiencia\b/i,
      /\binsuficiencia\s+pulmonar/i,
    ],
  },
  {
    id: "eco_prsPulm",
    patterns: [
      /\bpresi[oó]n\s+(?:sist[oó]lica\s+)?(?:arterial\s+)?pulmonar\b/i,
      /\bpsp\b/i,
      /\bpap\b/i,
    ],
  },
  {
    id: "eco_velLLTELEDTR",
    patterns: [
      /\btelediast[oó]lico.*tric[uú]spide/i,
      /\btric[uú]spide.*telediast/i,
      /\bonda\s+a\b.*tric[uú]spide/i,
    ],
  },
  {
    id: "eco_velLLRAPTR",
    patterns: [
      /\bllenado\s+r[aá]pido.*tric[uú]spide/i,
      /\btric[uú]spide.*llenado\s+r[aá]pido/i,
      /\bonda\s+e\b.*tric[uú]spide/i,
    ],
  },
  {
    id: "eco_valvula3",
    patterns: [
      /\binsuficiencia\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?tric[uú]spide/i,
      /\btric[uú]spide.*\binsuficiencia\b/i,
    ],
  },
  {
    id: "eco_gradMedioAO",
    patterns: [
      /\bgradiente\s+medio\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?a[oó]rtic/i,
      /\bgradiente\s+medio\s+a[oó]rtic/i,
    ],
  },
  {
    id: "eco_gradPicoAO",
    patterns: [
      /\bgradiente\s+pico\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?a[oó]rtic/i,
      /\bgradiente\s+pico\s+a[oó]rtic/i,
    ],
  },
  {
    id: "eco_velPicoAO",
    patterns: [
      /\bvelocidad\s+(?:de\s+)?pico\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?a[oó]rtic/i,
      /\bpico\s+(?:de\s+)?(?:la\s+)?a[oó]rtic/i,
    ],
  },
  {
    id: "eco_areaAoNum",
    patterns: [
      /\b[aá]rea\s+(?:valvular\s+)?a[oó]rtic[ua].*\d/i,
      /\b(?:cm\s*²|cm2|cent[ií]metros\s+cuadrados?).*a[oó]rtic/i,
      /\ba[oó]rtic[ua].*(?:cm\s*²|cm2)\b/i,
    ],
  },
  {
    id: "eco_areaAo",
    patterns: [/\b[aá]rea\s+(?:valvular\s+)?a[oó]rtic[ua]\b/i, /\btipo\s+de\s+[aá]rea\s+a[oó]rtic/i],
  },
  {
    id: "eco_valvula2",
    patterns: [
      /\binsuficiencia\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?a[oó]rtic/i,
      /\ba[oó]rtic[ua].*\binsuficiencia\b/i,
    ],
  },
  {
    id: "eco_gradientePicoMit",
    patterns: [
      /\bgradiente\s+(?:m[aá]ximo|max(?:imo)?)\s+(?:de\s+)?mitral\b/i,
      /\bgradiente\s+mitral\b/i,
    ],
  },
  {
    id: "eco_velLLTELED",
    patterns: [
      /\bonda\s+a\b.*mitral/i,
      /\bmitral.*onda\s+a\b/i,
      /\btelediast[oó]lico.*mitral/i,
      /\bmitral.*telediast/i,
    ],
  },
  {
    id: "eco_velLLRap",
    patterns: [
      /\bonda\s+e\b.*mitral/i,
      /\bmitral.*onda\s+e\b/i,
      /\bllenado\s+r[aá]pido.*mitral/i,
      /\bmitral.*llenado\s+r[aá]pido/i,
      /\be\s+mitral\b/i,
    ],
  },
  {
    id: "eco_areaNum",
    patterns: [
      /\b[aá]rea\s+mitral\b.*\d/i,
      /\b(?:cm\s*²|cm2|cent[ií]metros\s+cuadrados?).*mitral/i,
      /\bmitral.*(?:cm\s*²|cm2)\b/i,
    ],
  },
  {
    id: "eco_area1",
    patterns: [/\b[aá]rea\s+(?:valvular\s+)?mitral\b/i],
  },
  {
    id: "eco_valvula1",
    patterns: [
      /\binsuficiencia\s+(?:de\s+)?(?:la\s+)?(?:v[aá]lvula\s+)?mitral\b/i,
      /\bmitral.*\binsuficiencia\b/i,
      /\b(?:regurgitaci[oó]n|insuf)\s+mitral/i,
    ],
  },
  {
    id: "eco_fdvi",
    patterns: [
      /\bfunci[oó]n\s+diast[oó]lica\b/i,
      /\bfdvi\b/i,
      /\bdiast[oó]lica\s+(?:de\s+)?(?:el\s+)?(?:ventr[ií]culo|vi)\b/i,
    ],
  },
];

function splitIntoChunks(raw: string): string[] {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  let parts = t
    .split(/\s*[;\n]+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 1 && parts[0].length > 120) {
    const sub = parts[0]
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sub.length > 1) parts = sub;
  }
  return parts;
}

function matchChunkToField(chunk: string): { id: string; pattern: RegExp } | null {
  for (const row of FIELD_TRIGGERS) {
    for (const p of row.patterns) {
      if (p.test(chunk)) return { id: row.id, pattern: p };
    }
  }
  return null;
}

export function parseBulkEcoFormTranscript(
  raw: string,
  fieldOrder: readonly string[],
  getMeta: (fieldId: string) => BulkFieldMeta | null,
): BulkParseResult {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  const neverMatched: string[] = [];

  const chunks = splitIntoChunks(raw);
  for (const chunk of chunks) {
    const c = chunk.trim();
    if (!c) continue;
    if (parseEcoVoiceNavigation(c)) continue;

    const hit = matchChunkToField(c);
    if (!hit) {
      neverMatched.push(c);
      continue;
    }
    const valueText = c.replace(hit.pattern, " ").replace(/\s+/g, " ").trim() || c;
    const meta = getMeta(hit.id);
    if (!meta) {
      neverMatched.push(c);
      continue;
    }
    const r = interpretEcoVoice(meta.kind, valueText, meta.opts);
    if (r.ok) {
      values[hit.id] = r.value;
    } else {
      errors.push(`${hit.id}: ${r.message}`);
      neverMatched.push(c);
    }
  }

  const missing = fieldOrder.filter((id) => values[id] === undefined);
  let ui = 0;
  for (const fid of missing) {
    if (ui >= neverMatched.length) break;
    const chunk = neverMatched[ui++]!;
    const meta = getMeta(fid);
    if (!meta) continue;
    const r = interpretEcoVoice(meta.kind, chunk, meta.opts);
    if (r.ok) values[fid] = r.value;
    else errors.push(`${fid}: ${r.message}`);
  }

  const leftoverChunkCount = Math.max(0, neverMatched.length - ui);

  return { values, errors, leftoverChunkCount };
}
