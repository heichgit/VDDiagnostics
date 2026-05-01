/**
 * Equivalente web del formulario frmEcoDoppler (HowToModifyWordDocuments).
 * Validaciones: área si Area1=2; Vel. llenado rápido y Vel. pico AO obligatorios.
 * Cálculos: Gradiente mitral = VelLR²×4; Grad pico AO = VelPico²×4; Grad max pulm = VPP²×4
 */

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
    <div class="eco-doppler-footer">
      <button type="button" class="btn-ghost" id="eco_btnLimpiar">Limpiar</button>
      <button type="button" class="btn-primary" id="eco_btnGuardarModal">Guardar mediciones</button>
    </div>
  </div>
</div>`;
}

let wired = false;

function wireNumeric(panel: HTMLElement, id: string) {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = sanitizeDecimal2(el.value);
  });
}

/** Inserta el overlay en document.body y enlaza eventos (una sola vez). */
export function ensureEcoDopplerModalMounted(): void {
  if (wired) return;
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

  wired = true;
}

export function openEcoDopplerModal(): void {
  ensureEcoDopplerModalMounted();
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
  const overlay = document.getElementById("ecoDopplerOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
}
