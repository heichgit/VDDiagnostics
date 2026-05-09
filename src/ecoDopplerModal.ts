/**
 * Equivalente web del formulario frmEcoDoppler (HowToModifyWordDocuments).
 * Validaciones: área si Area1=2; Vel. llenado rápido y Vel. pico AO obligatorios.
 * Cálculos: Gradiente mitral = VelLR²×4; Grad pico AO = VelPico²×4; Grad max pulm = VPP²×4
 */

import { apiFetch, getToken } from "./api";
import { parseBulkEcoFormTranscript } from "./ecoDopplerBulkVoice";
import { type EcoVoiceKind, interpretEcoVoice, parseEcoVoiceNavigation } from "./ecoDopplerVoice";
import { formatMaxRecordingLabel } from "./recordingConfig";

export const ECO_DOPPLER_STORAGE_KEY = "vdd_eco_doppler_form";

export type EcoDopplerStored = {
  area1: string;
  areaNum: string;
  valvula1: string;
  fdvi: string;
  velLLRap: string;
  velLLTELED: string;
  gradientePicoMit: string;
  areaAo: string;
  areaAoNum: string;
  valvula2: string;
  velPicoAO: string;
  gradPicoAO: string;
  gradMedioAO: string;
  valvula3: string;
  velLLRAPTR: string;
  velLLTELEDTR: string;
  prsPulm: string;
  valvula4: string;
  vpp: string;
  gradMaxPulm: string;
};

const MOTILIDAD = [
  { id: "1", descripcion: "Normal / sin cuantificación numérica" },
  { id: "2", descripcion: "Área valvular — debe indicarse cm²" },
  { id: "3", descripcion: "No valorable / técnica limitada" },
];

const FUNCION_VALVULA = [
  { id: "8", descripcion: "Sin alteración significativa (predeterminado)" },
  { id: "7", descripcion: "Leve" },
  { id: "9", descripcion: "Moderada" },
  { id: "10", descripcion: "Severa" },
  { id: "11", descripcion: "Prótesis / otros" },
];

const FDVI_OPTS = [
  { id: "1", descripcion: "Normal" },
  { id: "2", descripcion: "Alteración grado I" },
  { id: "3", descripcion: "Alteración grado II" },
  { id: "4", descripcion: "Alteración grado III o mayor" },
];

const ECO_FIELD_LABELS: Record<string, string> = {
  eco_velLLRap: "Velocidad llenado rápido — mitral (m/s)",
  eco_velLLTELED: "Velocidad telediastólica — mitral (m/s)",
  eco_gradientePicoMit: "Gradiente máximo mitral (mmHg)",
  eco_area1: "Área valvular mitral",
  eco_areaNum: "Área mitral numérica (cm²)",
  eco_valvula1: "Insuficiencia mitral",
  eco_fdvi: "Función diastólica VI",
  eco_velPicoAO: "Velocidad pico aórtica (m/s)",
  eco_gradPicoAO: "Gradiente pico aórtico (mmHg)",
  eco_gradMedioAO: "Gradiente medio aórtico (mmHg)",
  eco_areaAo: "Área valvular aórtica",
  eco_areaAoNum: "Área aórtica numérica (cm²)",
  eco_valvula2: "Insuficiencia aórtica",
  eco_velLLRAPTR: "Velocidad llenado rápido — tricúspide",
  eco_velLLTELEDTR: "Velocidad telediastólica — tricúspide",
  eco_valvula3: "Insuficiencia tricúspide",
  eco_prsPulm: "Presión sistólica pulmonar (mmHg)",
  eco_vpp: "Velocidad pico pulmonar (m/s)",
  eco_gradMaxPulm: "Gradiente máximo pulmonar (mmHg)",
  eco_valvula4: "Insuficiencia pulmonar",
};

const ECO_VOICE_DECIMAL_IDS = new Set([
  "eco_velLLRap",
  "eco_velLLTELED",
  "eco_gradientePicoMit",
  "eco_areaNum",
  "eco_areaAoNum",
  "eco_velPicoAO",
  "eco_gradPicoAO",
  "eco_gradMedioAO",
  "eco_velLLRAPTR",
  "eco_velLLTELEDTR",
  "eco_prsPulm",
  "eco_vpp",
  "eco_gradMaxPulm",
]);

function ecoVoiceFieldKind(fieldId: string): EcoVoiceKind | null {
  if (ECO_VOICE_DECIMAL_IDS.has(fieldId)) return "decimal";
  if (fieldId === "eco_area1" || fieldId === "eco_areaAo") return "motilidad";
  if (fieldId === "eco_valvula1" || fieldId === "eco_valvula2" || fieldId === "eco_valvula3" || fieldId === "eco_valvula4")
    return "valvula";
  if (fieldId === "eco_fdvi") return "fdvi";
  return null;
}

function ecoVoiceOptsForField(fieldId: string) {
  if (fieldId === "eco_area1" || fieldId === "eco_areaAo") return MOTILIDAD;
  if (fieldId.startsWith("eco_valvula")) return FUNCION_VALVULA;
  if (fieldId === "eco_fdvi") return FDVI_OPTS;
  return undefined;
}

/** Orden de lectura/dictado (coincide con el formulario de arriba a abajo). */
const ECO_VOICE_ORDER: readonly string[] = [
  "eco_velLLRap",
  "eco_velLLTELED",
  "eco_gradientePicoMit",
  "eco_area1",
  "eco_areaNum",
  "eco_valvula1",
  "eco_fdvi",
  "eco_velPicoAO",
  "eco_gradPicoAO",
  "eco_gradMedioAO",
  "eco_areaAo",
  "eco_areaAoNum",
  "eco_valvula2",
  "eco_velLLRAPTR",
  "eco_velLLTELEDTR",
  "eco_valvula3",
  "eco_prsPulm",
  "eco_vpp",
  "eco_gradMaxPulm",
  "eco_valvula4",
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function optsHtml(rows: { id: string; descripcion: string }[]): string {
  return rows.map((r) => `<option value="${esc(r.id)}">${esc(r.descripcion)}</option>`).join("");
}

export function validateEcoDopplerForm(s: EcoDopplerStored): string | null {
  if (s.area1 === "2") {
    const a = s.areaNum.trim();
    if (a === "" || a === "0") return "Debe completar el área (cm²).";
  }
  if (s.velLLRap.trim() === "") return "Debe completar el valor de Velocidad de llenado rápido.";
  if (s.velPicoAO.trim() === "") return "Debe completar el valor de Velocidad de pico.";
  return null;
}

function parseLocaleFloat(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function gradFromVel(velInput: string): string {
  const n = parseLocaleFloat(velInput);
  if (n === null) return "";
  return String(Math.pow(n, 2) * 4);
}

function sanitizeDecimal2(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    const [intp, frac = ""] = s.split(".");
    s = intp + "." + frac.slice(0, 2);
  }
  return s;
}

function collect(panel: HTMLElement): EcoDopplerStored {
  const v = (id: string) =>
    (panel.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? "").trim();
  return {
    area1: v("eco_area1"),
    areaNum: v("eco_areaNum"),
    valvula1: v("eco_valvula1"),
    fdvi: v("eco_fdvi"),
    velLLRap: v("eco_velLLRap"),
    velLLTELED: v("eco_velLLTELED"),
    gradientePicoMit: v("eco_gradientePicoMit"),
    areaAo: v("eco_areaAo"),
    areaAoNum: v("eco_areaAoNum"),
    valvula2: v("eco_valvula2"),
    velPicoAO: v("eco_velPicoAO"),
    gradPicoAO: v("eco_gradPicoAO"),
    gradMedioAO: v("eco_gradMedioAO"),
    valvula3: v("eco_valvula3"),
    velLLRAPTR: v("eco_velLLRAPTR"),
    velLLTELEDTR: v("eco_velLLTELEDTR"),
    prsPulm: v("eco_prsPulm"),
    valvula4: v("eco_valvula4"),
    vpp: v("eco_vpp"),
    gradMaxPulm: v("eco_gradMaxPulm"),
  };
}

function apply(panel: HTMLElement, s: Partial<EcoDopplerStored>) {
  const set = (id: string, val: string | undefined) => {
    const el = panel.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
    if (el && val !== undefined) el.value = val;
  };
  set("eco_area1", s.area1);
  set("eco_areaNum", s.areaNum);
  set("eco_valvula1", s.valvula1);
  set("eco_fdvi", s.fdvi);
  set("eco_velLLRap", s.velLLRap);
  set("eco_velLLTELED", s.velLLTELED);
  set("eco_gradientePicoMit", s.gradientePicoMit);
  set("eco_areaAo", s.areaAo);
  set("eco_areaAoNum", s.areaAoNum);
  set("eco_valvula2", s.valvula2);
  set("eco_velPicoAO", s.velPicoAO);
  set("eco_gradPicoAO", s.gradPicoAO);
  set("eco_gradMedioAO", s.gradMedioAO);
  set("eco_valvula3", s.valvula3);
  set("eco_velLLRAPTR", s.velLLRAPTR);
  set("eco_velLLTELEDTR", s.velLLTELEDTR);
  set("eco_prsPulm", s.prsPulm);
  set("eco_valvula4", s.valvula4);
  set("eco_vpp", s.vpp);
  set("eco_gradMaxPulm", s.gradMaxPulm);
}

export function getStoredEcoDoppler(): EcoDopplerStored | null {
  try {
    const raw = sessionStorage.getItem(ECO_DOPPLER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as EcoDopplerStored;
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

export function clearStoredEcoDoppler(): void {
  sessionStorage.removeItem(ECO_DOPPLER_STORAGE_KEY);
}

function modalHtml(): string {
  const mv = optsHtml(MOTILIDAD);
  const fv = optsHtml(FUNCION_VALVULA);
  const fd = optsHtml(FDVI_OPTS);
  return `
<div id="ecoDopplerOverlay" class="modal-overlay" hidden aria-hidden="true">
  <div class="modal-panel eco-doppler-modal" role="dialog" aria-labelledby="ecoDopplerTitle">
    <div class="eco-doppler-header">
      <h2 id="ecoDopplerTitle">Eco Doppler — mediciones valvulares</h2>
      <button type="button" class="btn-modal-close" id="eco_btnCerrar" aria-label="Cerrar">×</button>
    </div>
    <div class="eco-doppler-scroll">
      <fieldset class="eco-fieldset">
        <legend>Válvula Mitral</legend>
        <div class="eco-grid">
          <label class="eco-label">Velocidad de llenado rápido (Onda E) <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_velLLRap" class="eco-num" autocomplete="off" />
          <label class="eco-label">Velocidad de llenado telediastólico (Onda A) <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_velLLTELED" class="eco-num" autocomplete="off" />
          <label class="eco-label">Gradiente máximo <span class="eco-unit">mmHg</span></label>
          <input type="text" inputmode="decimal" id="eco_gradientePicoMit" class="eco-num" autocomplete="off" />
          <label class="eco-label">Área valvular</label>
          <div class="eco-inline">
            <select id="eco_area1">${mv}</select>
            <input type="text" inputmode="decimal" id="eco_areaNum" class="eco-num eco-num-sm" placeholder="cm²" autocomplete="off" />
            <span class="eco-unit-inline">cm²</span>
          </div>
          <label class="eco-label">Insuficiencia valvular</label>
          <select id="eco_valvula1">${fv}</select>
          <label class="eco-label">Función diastólica VI</label>
          <select id="eco_fdvi">${fd}</select>
        </div>
      </fieldset>
      <fieldset class="eco-fieldset">
        <legend>Válvula Aórtica</legend>
        <div class="eco-grid">
          <label class="eco-label">Velocidad pico <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_velPicoAO" class="eco-num" autocomplete="off" />
          <label class="eco-label">Gradiente pico <span class="eco-unit">mmHg</span></label>
          <input type="text" inputmode="decimal" id="eco_gradPicoAO" class="eco-num" autocomplete="off" />
          <label class="eco-label">Gradiente medio <span class="eco-unit">mmHg</span></label>
          <input type="text" inputmode="decimal" id="eco_gradMedioAO" class="eco-num" autocomplete="off" />
          <label class="eco-label">Área valvular aórtica</label>
          <div class="eco-inline">
            <select id="eco_areaAo">${mv}</select>
            <input type="text" inputmode="decimal" id="eco_areaAoNum" class="eco-num eco-num-sm" placeholder="cm²" autocomplete="off" />
            <span class="eco-unit-inline">cm²</span>
          </div>
          <label class="eco-label">Insuficiencia valvular</label>
          <select id="eco_valvula2">${fv}</select>
        </div>
      </fieldset>
      <fieldset class="eco-fieldset">
        <legend>Válvula Tricúspide</legend>
        <div class="eco-grid">
          <label class="eco-label">Velocidad de llenado rápido <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_velLLRAPTR" class="eco-num" autocomplete="off" />
          <label class="eco-label">Velocidad de llenado telediastólico <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_velLLTELEDTR" class="eco-num" autocomplete="off" />
          <label class="eco-label">Insuficiencia valvular</label>
          <select id="eco_valvula3">${fv}</select>
          <label class="eco-label">Presión sistólica pulmonar <span class="eco-unit">mmHg</span></label>
          <input type="text" inputmode="decimal" id="eco_prsPulm" class="eco-num" autocomplete="off" />
        </div>
      </fieldset>
      <fieldset class="eco-fieldset">
        <legend>Válvula Pulmonar</legend>
        <div class="eco-grid">
          <label class="eco-label">Velocidad pico <span class="eco-unit">m/seg</span></label>
          <input type="text" inputmode="decimal" id="eco_vpp" class="eco-num" autocomplete="off" />
          <label class="eco-label">Grad máximo <span class="eco-unit">mmHg</span></label>
          <input type="text" inputmode="decimal" id="eco_gradMaxPulm" class="eco-num" autocomplete="off" />
          <label class="eco-label">Insuficiencia valvular</label>
          <select id="eco_valvula4">${fv}</select>
        </div>
      </fieldset>
      <p class="eco-status" id="eco_modalStatus" role="status"></p>
    </div>
    <div class="eco-voice-strip" id="ecoVoiceStrip" hidden>
      <div class="eco-voice-strip-inner">
        <span id="ecoVoiceFieldLabel" class="eco-voice-target muted">Orden del formulario — tocá un campo o usá «Siguiente» / «Anterior»</span>
        <div class="eco-voice-order-row">
          <button type="button" class="btn-ghost eco-voice-order-btn" id="ecoVoicePrev" aria-label="Campo anterior en el orden del formulario">← Anterior</button>
          <button type="button" class="btn-ghost eco-voice-order-btn" id="ecoVoiceNext" aria-label="Campo siguiente en el orden del formulario">Siguiente →</button>
        </div>
        <label class="eco-voice-bulk-label">
          <input type="checkbox" id="ecoVoiceBulkMode" />
          Dictado completo del formulario (palabras clave y orden de fragmentos separados por punto y coma o líneas)
        </label>
        <div class="eco-voice-actions">
          <button type="button" class="btn-record eco-voice-record" id="ecoVoiceRecord" aria-label="Grabar dictado para el campo activo">Grabar</button>
          <button type="button" class="btn-ghost" id="ecoVoiceStop" disabled>Detener y aplicar</button>
        </div>
        <span id="ecoVoiceMicStatus" class="eco-voice-status muted" role="status"></span>
      </div>
    </div>
    <div class="eco-doppler-footer">
      <button type="button" class="btn-ghost" id="eco_btnLimpiar">Limpiar</button>
      <button type="button" class="btn-primary" id="eco_btnGuardarModal">Guardar mediciones</button>
    </div>
  </div>
</div>`;
}

let wiredBase = false;
let wiredVoice = false;
let lastVoiceCapability = false;
let lastMaxRecordingMin = 15;
/** Detiene grabación Eco sin transcribir (cierre de modal). */
let ecoVoiceAbortRecording: (() => void) | null = null;

function wireNumeric(panel: HTMLElement, id: string) {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = sanitizeDecimal2(el.value);
  });
}

function wireEcoVoiceStrip(panel: HTMLElement, maxRecordingMin: number): void {
  const lbl = panel.querySelector<HTMLSpanElement>("#ecoVoiceFieldLabel");
  const btnRec = panel.querySelector<HTMLButtonElement>("#ecoVoiceRecord");
  const btnStop = panel.querySelector<HTMLButtonElement>("#ecoVoiceStop");
  const btnPrev = panel.querySelector<HTMLButtonElement>("#ecoVoicePrev");
  const btnNext = panel.querySelector<HTMLButtonElement>("#ecoVoiceNext");
  const chkBulk = panel.querySelector<HTMLInputElement>("#ecoVoiceBulkMode");
  const mic = panel.querySelector<HTMLSpanElement>("#ecoVoiceMicStatus");
  if (!lbl || !btnRec || !btnStop || !mic || !btnPrev || !btnNext || !chkBulk) return;

  let lastTargetId: string | null = null;
  let orderIdx = 0;
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let recordingLimitTimer: ReturnType<typeof setTimeout> | null = null;
  let discardEcoBlob = false;
  /** Evita iniciar otra grabación hasta terminar la transcripción (corrige blob vacío / recorder pisado). */
  let transcribeBusy = false;
  const maxRecordingMs = Math.max(1, maxRecordingMin) * 60 * 1000;
  const nOrder = ECO_VOICE_ORDER.length;

  function clearRecordingLimitTimer() {
    if (recordingLimitTimer != null) {
      clearTimeout(recordingLimitTimer);
      recordingLimitTimer = null;
    }
  }

  function syncOrderIndexFromId(id: string | null) {
    if (!id) return;
    const ix = ECO_VOICE_ORDER.indexOf(id);
    if (ix >= 0) orderIdx = ix;
  }

  function focusOrderedAt(index: number): void {
    orderIdx = ((index % nOrder) + nOrder) % nOrder;
    const id = ECO_VOICE_ORDER[orderIdx];
    const el = panel.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    lastTargetId = id;
    el.focus();
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    updateTargetLabel();
  }

  function moveOrdered(delta: number): void {
    if (!lastTargetId) {
      focusOrderedAt(delta > 0 ? 0 : nOrder - 1);
      return;
    }
    focusOrderedAt(orderIdx + delta);
  }

  function updateTargetLabel() {
    if (!lastTargetId) {
      lbl.textContent = `Orden del formulario (${nOrder} campos). «Siguiente» / «Anterior», o tocá un campo. Por voz: «siguiente campo» / «campo anterior».`;
      return;
    }
    const kind = ecoVoiceFieldKind(lastTargetId);
    const name = ECO_FIELD_LABELS[lastTargetId] ?? lastTargetId;
    const pos = ECO_VOICE_ORDER.indexOf(lastTargetId);
    const idxLabel = pos >= 0 ? ` · ${pos + 1}/${nOrder}` : "";
    lbl.textContent = kind ? `Dictado${idxLabel} → ${name}` : `${name} (sin dictado)`;
  }

  function syncEcoVoiceControls() {
    const recording = mediaRecorder !== null && mediaRecorder.state === "recording";
    btnRec.disabled = recording || transcribeBusy;
    btnStop.disabled = !recording;
    btnPrev.disabled = recording || transcribeBusy;
    btnNext.disabled = recording || transcribeBusy;
    chkBulk.disabled = recording || transcribeBusy;
    btnRec.classList.toggle("recording", recording);
  }

  panel.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) return;
      const id = t.id;
      if (!id.startsWith("eco_")) return;
      if (!ecoVoiceFieldKind(id)) return;
      lastTargetId = id;
      syncOrderIndexFromId(id);
      updateTargetLabel();
    },
    true,
  );

  btnPrev.addEventListener("click", () => {
    mic.textContent = "";
    mic.classList.remove("error", "ok");
    moveOrdered(-1);
  });

  btnNext.addEventListener("click", () => {
    mic.textContent = "";
    mic.classList.remove("error", "ok");
    moveOrdered(1);
  });

  async function postTranscribe(blob: Blob): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
    mic.textContent = "Transcribiendo…";
    mic.classList.remove("error", "ok");
    const fd = new FormData();
    fd.append("audio", blob, "eco.webm");
    const tok = getToken()?.trim();
    if (tok) fd.append("_vdd_jwt", tok);
    const ac = new AbortController();
    const transcribeTimeoutMs = 120_000;
    const timer = setTimeout(() => ac.abort(), transcribeTimeoutMs);
    try {
      const res = await apiFetch("/api/transcribe", { method: "POST", body: fd, signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: typeof data.error === "string" ? data.error : "Error al transcribir" };
      }
      return { ok: true, text: typeof data.text === "string" ? data.text : "" };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, message: "Tiempo de espera agotado al transcribir. Probá de nuevo." };
      }
      return { ok: false, message: "Error de red al transcribir." };
    } finally {
      clearTimeout(timer);
    }
  }

  function applyBulkFromText(text: string) {
    const getMeta = (fieldId: string) => {
      const kind = ecoVoiceFieldKind(fieldId);
      if (!kind) return null;
      return {
        kind,
        opts: kind === "decimal" ? undefined : ecoVoiceOptsForField(fieldId),
      };
    };
    const res = parseBulkEcoFormTranscript(text, ECO_VOICE_ORDER, getMeta);
    let n = 0;
    for (const [fid, val] of Object.entries(res.values)) {
      const el = panel.querySelector<HTMLInputElement | HTMLSelectElement>(`#${fid}`);
      if (!el) continue;
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    }
    const errPreview =
      res.errors.length > 0 ? ` · Avisos: ${res.errors.slice(0, 5).join(" · ")}` : "";
    const leftover =
      res.leftoverChunkCount > 0 ? ` · ${res.leftoverChunkCount} fragmento(s) sin asignar al orden` : "";
    mic.textContent = `Formulario: ${n} campo(s) completado(s)${errPreview}${leftover}`;
    mic.classList.toggle("error", n === 0 && (res.errors.length > 0 || text.trim().length > 0));
    mic.classList.toggle("ok", n > 0);
  }

  async function transcribeAndApply(blob: Blob) {
    const tr = await postTranscribe(blob);
    if (!tr.ok) {
      mic.textContent = tr.message;
      mic.classList.add("error");
      return;
    }
    const text = tr.text;

    const nav = parseEcoVoiceNavigation(text);
    if (nav) {
      if (!lastTargetId) {
        focusOrderedAt(nav === "next" ? 0 : nOrder - 1);
      } else {
        moveOrdered(nav === "next" ? 1 : -1);
      }
      mic.textContent = nav === "next" ? "Campo siguiente." : "Campo anterior.";
      mic.classList.add("ok");
      return;
    }

    if (chkBulk.checked) {
      applyBulkFromText(text);
      return;
    }

    const tid = lastTargetId;
    if (!tid || !ecoVoiceFieldKind(tid)) {
      mic.textContent = "No hay campo activo. Usá «Siguiente» o tocá un campo.";
      mic.classList.add("error");
      return;
    }
    const kind = ecoVoiceFieldKind(tid)!;
    const opts = kind === "decimal" ? undefined : ecoVoiceOptsForField(tid);
    const r = interpretEcoVoice(kind, text, opts);
    if (!r.ok) {
      mic.textContent = r.message;
      mic.classList.add("error");
      return;
    }
    const el = panel.querySelector<HTMLInputElement | HTMLSelectElement>(`#${tid}`);
    if (!el) {
      mic.textContent = "Campo no encontrado.";
      mic.classList.add("error");
      return;
    }
    el.value = r.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const preview = text.trim().slice(0, 72);
    mic.textContent = `Aplicado: «${preview}${text.trim().length > 72 ? "…" : ""}»`;
    mic.classList.add("ok");
  }

  ecoVoiceAbortRecording = () => {
    clearRecordingLimitTimer();
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      transcribeBusy = false;
      syncEcoVoiceControls();
      return;
    }
    discardEcoBlob = true;
    mediaRecorder.stop();
  };

  btnRec.addEventListener("click", async () => {
    if (transcribeBusy || (mediaRecorder && mediaRecorder.state === "recording")) return;

    discardEcoBlob = false;
    mic.textContent = "";
    mic.classList.remove("error", "ok");
    if (!chkBulk.checked) {
      if (!lastTargetId || !ecoVoiceFieldKind(lastTargetId)) {
        focusOrderedAt(0);
      }
      if (!lastTargetId || !ecoVoiceFieldKind(lastTargetId)) {
        mic.textContent = "No hay campos dictables en el formulario.";
        mic.classList.add("error");
        return;
      }
    }
    try {
      const sessionChunks: BlobPart[] = [];
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) sessionChunks.push(e.data);
      };
      recorder.onstop = async () => {
        clearRecordingLimitTimer();
        const blobType = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(sessionChunks, { type: blobType });
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        mediaRecorder = null;

        transcribeBusy = true;
        syncEcoVoiceControls();

        try {
          if (discardEcoBlob) {
            discardEcoBlob = false;
            mic.textContent = "";
            return;
          }
          if (blob.size === 0) {
            mic.textContent = "No se capturó audio. Volvé a grabar.";
            mic.classList.add("error");
            return;
          }
          await transcribeAndApply(blob);
        } catch {
          mic.textContent = "Error inesperado al procesar el audio.";
          mic.classList.add("error");
        } finally {
          transcribeBusy = false;
          syncEcoVoiceControls();
        }
      };
      recorder.start(500);
      clearRecordingLimitTimer();
      recordingLimitTimer = setTimeout(() => {
        recordingLimitTimer = null;
        const rec = mediaRecorder;
        if (rec?.state === "recording") {
          mic.textContent = `Límite ${formatMaxRecordingLabel(maxRecordingMin)} alcanzado; deteniendo…`;
          try {
            rec.requestData();
          } catch {
            /* opcional */
          }
          rec.stop();
        }
      }, maxRecordingMs);
      syncEcoVoiceControls();
    } catch (e) {
      mic.textContent = e instanceof Error ? e.message : "No se pudo usar el micrófono";
      mic.classList.add("error");
    }
  });

  btnStop.addEventListener("click", () => {
    clearRecordingLimitTimer();
    const rec = mediaRecorder;
    if (rec && rec.state !== "inactive") {
      try {
        rec.requestData();
      } catch {
        /* no es obligatorio en todos los navegadores */
      }
      rec.stop();
    }
  });
}

/** Inserta el overlay en document.body y enlaza eventos (una sola vez). */
export function ensureEcoDopplerModalMounted(canVoiceDictate = lastVoiceCapability, maxRecordingMin?: number): void {
  if (maxRecordingMin !== undefined && Number.isFinite(maxRecordingMin) && maxRecordingMin > 0) {
    lastMaxRecordingMin = maxRecordingMin;
  }
  lastVoiceCapability = canVoiceDictate;

  if (!wiredBase) {
    if (!document.getElementById("ecoDopplerOverlay")) {
      document.body.insertAdjacentHTML("beforeend", modalHtml());
    }
    const overlay = document.getElementById("ecoDopplerOverlay");
    const panel = overlay?.querySelector(".eco-doppler-modal");
    if (!overlay || !panel) return;

    const idsNum = [
      "eco_velLLRap",
      "eco_velLLTELED",
      "eco_gradientePicoMit",
      "eco_areaNum",
      "eco_areaAoNum",
      "eco_velPicoAO",
      "eco_gradPicoAO",
      "eco_gradMedioAO",
      "eco_velLLRAPTR",
      "eco_velLLTELEDTR",
      "eco_prsPulm",
      "eco_vpp",
      "eco_gradMaxPulm",
    ];
    for (const id of idsNum) wireNumeric(panel as HTMLElement, id);

    const velLL = panel.querySelector<HTMLInputElement>("#eco_velLLRap");
    const gradMit = panel.querySelector<HTMLInputElement>("#eco_gradientePicoMit");
    velLL?.addEventListener("input", () => {
      if (gradMit) gradMit.value = gradFromVel(velLL.value);
    });

    const velAo = panel.querySelector<HTMLInputElement>("#eco_velPicoAO");
    const gradAo = panel.querySelector<HTMLInputElement>("#eco_gradPicoAO");
    velAo?.addEventListener("input", () => {
      if (gradAo) gradAo.value = gradFromVel(velAo.value);
    });

    const vpp = panel.querySelector<HTMLInputElement>("#eco_vpp");
    const gradMp = panel.querySelector<HTMLInputElement>("#eco_gradMaxPulm");
    vpp?.addEventListener("input", () => {
      if (gradMp) gradMp.value = gradFromVel(vpp.value);
    });

    const statusEl = panel.querySelector<HTMLParagraphElement>("#eco_modalStatus");

    panel.querySelector("#eco_btnCerrar")?.addEventListener("click", () => closeEcoDopplerModal());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeEcoDopplerModal();
    });

    panel.querySelector("#eco_btnLimpiar")?.addEventListener("click", () => {
      const defaults: EcoDopplerStored = {
        area1: "1",
        areaNum: "",
        valvula1: "8",
        fdvi: "1",
        velLLRap: "",
        velLLTELED: "",
        gradientePicoMit: "",
        areaAo: "1",
        areaAoNum: "",
        valvula2: "8",
        velPicoAO: "",
        gradPicoAO: "",
        gradMedioAO: "",
        valvula3: "8",
        velLLRAPTR: "",
        velLLTELEDTR: "",
        prsPulm: "",
        valvula4: "8",
        vpp: "",
        gradMaxPulm: "",
      };
      apply(panel as HTMLElement, defaults);
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "eco-status";
      }
    });

    panel.querySelector("#eco_btnGuardarModal")?.addEventListener("click", () => {
      const st = collect(panel as HTMLElement);
      const err = validateEcoDopplerForm(st);
      if (err) {
        globalThis.alert(err);
        return;
      }
      sessionStorage.setItem(ECO_DOPPLER_STORAGE_KEY, JSON.stringify(st));
      if (statusEl) {
        statusEl.textContent = "Mediciones guardadas. Se enviarán al guardar el diagnóstico.";
        statusEl.className = "eco-status ok";
      }
      closeEcoDopplerModal();
    });

    wiredBase = true;
  }

  const overlay2 = document.getElementById("ecoDopplerOverlay");
  const panel2 = overlay2?.querySelector(".eco-doppler-modal") as HTMLElement | null;
  if (!panel2) return;

  const strip = panel2.querySelector<HTMLElement>("#ecoVoiceStrip");
  if (strip) strip.hidden = !canVoiceDictate;

  if (canVoiceDictate && !wiredVoice) {
    wireEcoVoiceStrip(panel2, lastMaxRecordingMin);
    wiredVoice = true;
  }
}

export function openEcoDopplerModal(): void {
  ensureEcoDopplerModalMounted(lastVoiceCapability, lastMaxRecordingMin);
  const overlay = document.getElementById("ecoDopplerOverlay");
  const panel = overlay?.querySelector(".eco-doppler-modal");
  if (!overlay || !panel) return;

  const stored = getStoredEcoDoppler();
  if (stored) apply(panel as HTMLElement, stored);
  else {
    apply(panel as HTMLElement, {
      area1: "1",
      valvula1: "8",
      fdvi: "1",
      areaAo: "1",
      valvula2: "8",
      valvula3: "8",
      valvula4: "8",
    });
  }

  const statusEl = panel.querySelector<HTMLParagraphElement>("#eco_modalStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "eco-status";
  }

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  panel.querySelector<HTMLInputElement>("#eco_velLLRap")?.focus();
}

export function closeEcoDopplerModal(): void {
  ecoVoiceAbortRecording?.();
  const overlay = document.getElementById("ecoDopplerOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
}
