import {
  canManageUsers,
  canReadDiagnosticos,
  canTranscribe,
  canWriteDiagnostico,
  R,
  rolesLabel,
} from "./roles";
import { apiFetch, clearToken, getToken, setToken } from "./api";
import {
  etiquetaTipoDiagnostico,
  htmlOpcionesTipoDiagnostico,
  normalizarCodigoTipoDiagnostico,
} from "./diagnosticoTipos";
import { formatMaxRecordingLabel, getMaxRecordingMinutes, loadRecordingConfig } from "./recordingConfig";

type Diagnostico = {
  id: string;
  pacienteRef: string;
  estudioTipo: string;
  imagenRef: string;
  tipoDiagnostico?: number;
  transcripcion: string;
  notas: string;
  creadoEn: string;
};

/** Cuántos ítems mostrar en “Últimos registros” (más recientes primero). */
const LISTA_DIAGNOSTICOS_MAX = 25;

function compareDiagnosticoRecientePrimero(a: Diagnostico, b: Diagnostico): number {
  const ta = Date.parse(a.creadoEn);
  const tb = Date.parse(b.creadoEn);
  if (Number.isFinite(tb) && Number.isFinite(ta)) return tb - ta;
  if (Number.isFinite(tb)) return 1;
  if (Number.isFinite(ta)) return -1;
  return 0;
}

function ordenarDiagnosticosRecientesPrimero(items: Diagnostico[]): Diagnostico[] {
  return [...items].sort(compareDiagnosticoRecientePrimero);
}

type User = { id: string; email: string; roles: string[] };

const root = document.querySelector<HTMLDivElement>("#app")!;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es");
  } catch {
    return iso;
  }
}

async function loginRequest(
  email: string,
  password: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string; detalle?: string };
  if (!res.ok) {
    const msg = [data.error, data.detalle].filter(Boolean).join(" — ");
    return { ok: false, error: msg || "Error de inicio de sesión" };
  }
  if (typeof data.token !== "string" || !data.token.trim()) {
    return { ok: false, error: "Respuesta inválida (sin token)" };
  }
  const token = data.token.trim();
  setToken(token);
  return { ok: true, token };
}

/**
 * Valida el JWT contra /api/auth/me. Usa token explícito tras login para evitar condiciones de carrera.
 */
async function fetchMe(sessionToken?: string | null): Promise<{ user: User | null; hint?: string }> {
  const t = (sessionToken ?? getToken())?.trim();
  if (!t) return { user: null, hint: "Sin token de sesión" };

  /** POST + token en JSON: Static Web Apps a veces no reenvía Authorization en GET hacia Functions. */
  const res = await fetch("/api/auth/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: t }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let hint = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) hint += `: ${j.error}`;
    } catch {
      if (text) hint += ` (${text.slice(0, 120).replace(/\s+/g, " ")})`;
    }
    return { user: null, hint };
  }
  try {
    return { user: JSON.parse(text) as User };
  } catch {
    return { user: null, hint: "Respuesta inválida del servidor" };
  }
}

function renderLogin(msg = "") {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="card login-card">
        <h1>Ingreso</h1>
        <p class="subtitle">Diagnóstico por imagen médica</p>
        <p class="status error" id="loginErr">${escapeHtml(msg)}</p>
        <label for="loginEmail">Email</label>
        <input id="loginEmail" type="email" autocomplete="username" />
        <label for="loginPass">Contraseña</label>
        <input id="loginPass" type="password" autocomplete="current-password" />
        <div class="actions">
          <button type="button" class="btn-primary" id="loginBtn">Entrar</button>
        </div>
      </div>
    </div>
  `;
  const err = root.querySelector<HTMLParagraphElement>("#loginErr")!;
  const email = root.querySelector<HTMLInputElement>("#loginEmail")!;
  const pass = root.querySelector<HTMLInputElement>("#loginPass")!;
  root.querySelector<HTMLButtonElement>("#loginBtn")!.addEventListener("click", async () => {
    err.textContent = "";
    err.className = "status";
    const r = await loginRequest(email.value.trim(), pass.value);
    if (!r.ok) {
      err.textContent = r.error || "Error";
      err.classList.add("error");
      return;
    }
    const { user: me, hint } = await fetchMe(r.token);
    if (!me) {
      clearToken();
      err.textContent = hint
        ? `No se pudo validar la sesión (${hint}). Revisá JWT_SECRET en Azure (sin espacios ni saltos de línea al pegar).`
        : "No se pudo validar la sesión";
      err.classList.add("error");
      return;
    }
    await mountApp(me);
  });
}

async function mountApp(user: User) {
  await loadRecordingConfig();
  const read = canReadDiagnosticos(user.roles);
  const write = canWriteDiagnostico(user.roles);
  const voice = canTranscribe(user.roles);
  const admin = canManageUsers(user.roles);
  const operadorSolo = !write && !voice && read;
  const maxRecordingMin = getMaxRecordingMinutes();

  root.innerHTML = `
    <header class="app-header">
      <div>
        <h1>Diagnóstico por imagen médica</h1>
        <p class="subtitle">${escapeHtml(user.email)} · Roles: ${escapeHtml(rolesLabel(user.roles))}</p>
      </div>
      <button type="button" class="btn-ghost" id="btnLogout">Salir</button>
    </header>

    ${admin ? adminPanelHtml() : ""}

    ${operadorSolo ? "" : fichaYDictadoHtml(voice, maxRecordingMin)}

    ${read ? listadoHtml() : `<p class="status error">Tu usuario no tiene permiso para ver el listado de diagnósticos.</p>`}
  `;

  root.querySelector<HTMLButtonElement>("#btnLogout")!.addEventListener("click", () => {
    clearToken();
    renderLogin();
  });

  if (admin) wireAdminPanel();

  if (!operadorSolo && read) wireEditor(voice, write, maxRecordingMin);
  else if (read) void loadListOnly();
}

function adminPanelHtml() {
  return `
    <div class="card" id="adminCard">
      <h2>Administración de usuarios</h2>
      <p class="subtitle">Solo rol <strong>admin</strong>. Asigná roles: usuario (informes), transcripcion (voz+Whisper), operador (solo lectura y futuros reportes).</p>
      <div class="table-wrap">
        <table class="users-table">
          <thead><tr><th>Email</th><th>Roles</th></tr></thead>
          <tbody id="usersTbody"></tbody>
        </table>
      </div>
      <h3 class="h3">Nuevo usuario</h3>
      <div class="row row-2">
        <div>
          <label for="nuEmail">Email</label>
          <input id="nuEmail" type="email" />
        </div>
        <div>
          <label for="nuPass">Contraseña inicial</label>
          <input id="nuPass" type="password" />
        </div>
      </div>
      <fieldset class="roles-fs">
        <legend>Roles</legend>
        <label class="chk"><input type="checkbox" id="r_admin" /> ${R.ADMIN}</label>
        <label class="chk"><input type="checkbox" id="r_usuario" checked /> ${R.USUARIO}</label>
        <label class="chk"><input type="checkbox" id="r_transcripcion" /> ${R.TRANSCRIPCION}</label>
        <label class="chk"><input type="checkbox" id="r_operador" /> ${R.OPERADOR}</label>
      </fieldset>
      <div class="actions">
        <button type="button" class="btn-primary" id="nuCreate">Crear usuario</button>
      </div>
      <p class="status" id="nuStatus"></p>
    </div>
  `;
}

function fichaYDictadoHtml(voice: boolean, maxRecordingMin: number) {
  const maxLabel = formatMaxRecordingLabel(maxRecordingMin);
  return `
    <div class="card" id="cardFicha">
      <h2>Ficha del estudio</h2>
      <div class="row row-2">
        <div>
          <label for="pacienteRef">Referencia paciente</label>
          <input id="pacienteRef" type="text" autocomplete="off" placeholder="Ej. HC-2024-001" />
        </div>
        <div>
          <label for="estudioTipo">Tipo de estudio</label>
          <select id="estudioTipo">
            <option value="">— Seleccionar —</option>
            <option value="RX">Radiografía</option>
            <option value="TC">Tomografía (TC)</option>
            <option value="RM">Resonancia (RM)</option>
            <option value="US">Ecografía</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
      </div>
      <div>
        <label for="imagenRef">Ref. / imágen</label>
        <input id="imagenRef" type="text" placeholder="Ej. PACS ID o número de Imágen" />
      </div>
      <div>
        <label for="tipoDiagnostico">Tipo de diagnóstico</label>
        <select id="tipoDiagnostico">${htmlOpcionesTipoDiagnostico()}</select>
      </div>
    </div>

    <div class="card" id="cardVoz">
      <h2>Dictado por voz</h2>
      ${
        voice
          ? `<p class="recording-limit-hint muted">Duración máxima por grabación: <strong>${escapeHtml(maxLabel)}</strong> (Azure: variable <code>MAX_RECORDING_MINUTES</code>;</p>
        <p class="status" id="micStatus"></p>
        <div class="actions">
          <button type="button" class="btn-record" id="btnRecord">Grabar</button>
          <button type="button" class="btn-ghost" id="btnStop" disabled>Detener y transcribir</button>
        </div>`
          : `<p class="status muted">La transcripción por voz no está habilitada para tu usuario (se requieren los roles <strong>usuario</strong> y <strong>transcripcion</strong>, o <strong>admin</strong>).</p>`
      }
      <label for="transcripcion">Informe / transcripción</label>
      <textarea id="transcripcion" placeholder="Texto del informe (manualpor o grabado por voz)."></textarea>
      <label for="notas">Notas adicionales (opcional)</label>
      <textarea id="notas" rows="3" placeholder="Complementos, aclaraciones…"></textarea>
      <div class="actions">
        <button type="button" class="btn-ghost" id="btnSugerirTipo">
          Detectar tipo de diagnóstico desde el informe (IA)
        </button>
        <button type="button" class="btn-primary" id="btnGuardar">Guardar diagnóstico</button>
      </div>
      <p class="status" id="saveStatus"></p>
    </div>
  `;
}

function listadoHtml() {
  return `
    <div class="card">
      <h2>Últimos registros</h2>
      <ul class="list" id="lista"></ul>
      <p class="empty" id="listaEmpty" hidden>No hay registros guardados aún.</p>
    </div>
  `;
}

async function refreshUsersTable() {
  const tbody = root.querySelector<HTMLTableSectionElement>("#usersTbody");
  if (!tbody) return;
  const res = await apiFetch("/api/users");
  const data = await res.json().catch(() => []);
  tbody.innerHTML = "";
  if (!res.ok || !Array.isArray(data)) return;
  for (const u of data as { email: string; roles: string[] }[]) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(u.email)}</td><td>${escapeHtml(rolesLabel(u.roles))}</td>`;
    tbody.appendChild(tr);
  }
}

function wireAdminPanel() {
  void refreshUsersTable();
  const st = root.querySelector<HTMLParagraphElement>("#nuStatus")!;
  root.querySelector<HTMLButtonElement>("#nuCreate")!.addEventListener("click", async () => {
    st.textContent = "";
    st.className = "status";
    const email = root.querySelector<HTMLInputElement>("#nuEmail")!.value.trim();
    const password = root.querySelector<HTMLInputElement>("#nuPass")!.value;
    const roles: string[] = [];
    if (root.querySelector<HTMLInputElement>("#r_admin")!.checked) roles.push(R.ADMIN);
    if (root.querySelector<HTMLInputElement>("#r_usuario")!.checked) roles.push(R.USUARIO);
    if (root.querySelector<HTMLInputElement>("#r_transcripcion")!.checked) roles.push(R.TRANSCRIPCION);
    if (root.querySelector<HTMLInputElement>("#r_operador")!.checked) roles.push(R.OPERADOR);
    const res = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, roles }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      st.textContent = data.error || "Error al crear";
      st.classList.add("error");
      return;
    }
    st.textContent = "Usuario creado";
    st.classList.add("ok");
    root.querySelector<HTMLInputElement>("#nuEmail")!.value = "";
    root.querySelector<HTMLInputElement>("#nuPass")!.value = "";
    await refreshUsersTable();
  });
}

function wireEditor(voice: boolean, write: boolean, maxRecordingMin: number) {
  const el = {
    pacienteRef: root.querySelector<HTMLInputElement>("#pacienteRef")!,
    estudioTipo: root.querySelector<HTMLSelectElement>("#estudioTipo")!,
    imagenRef: root.querySelector<HTMLInputElement>("#imagenRef")!,
    tipoDiagnostico: root.querySelector<HTMLSelectElement>("#tipoDiagnostico")!,
    transcripcion: root.querySelector<HTMLTextAreaElement>("#transcripcion")!,
    notas: root.querySelector<HTMLTextAreaElement>("#notas")!,
    btnRecord: root.querySelector<HTMLButtonElement>("#btnRecord"),
    btnStop: root.querySelector<HTMLButtonElement>("#btnStop"),
    btnGuardar: root.querySelector<HTMLButtonElement>("#btnGuardar")!,
    btnSugerirTipo: root.querySelector<HTMLButtonElement>("#btnSugerirTipo"),
    micStatus: root.querySelector<HTMLParagraphElement>("#micStatus"),
    saveStatus: root.querySelector<HTMLParagraphElement>("#saveStatus")!,
    lista: root.querySelector<HTMLUListElement>("#lista")!,
    listaEmpty: root.querySelector<HTMLParagraphElement>("#listaEmpty")!,
  };

  if (!write) {
    el.pacienteRef.disabled = true;
    el.estudioTipo.disabled = true;
    el.imagenRef.disabled = true;
    el.tipoDiagnostico.disabled = true;
    if (el.btnSugerirTipo) el.btnSugerirTipo.disabled = true;
    el.transcripcion.disabled = true;
    el.notas.disabled = true;
    el.btnGuardar.disabled = true;
    el.saveStatus.textContent = "Solo lectura: no podés guardar diagnósticos con tu rol actual.";
    el.saveStatus.classList.add("muted");
  }

  let mediaRecorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let recordingLimitTimer: ReturnType<typeof setTimeout> | null = null;
  const maxRecordingMs = maxRecordingMin * 60 * 1000;

  function clearRecordingLimitTimer() {
    if (recordingLimitTimer != null) {
      clearTimeout(recordingLimitTimer);
      recordingLimitTimer = null;
    }
  }

  function setRecordingUi(active: boolean) {
    if (!el.btnRecord || !el.btnStop || !el.micStatus) return;
    el.btnRecord.disabled = active;
    el.btnStop.disabled = !active;
    el.btnRecord.classList.toggle("recording", active);
    el.micStatus.textContent = active ? "Grabando…" : "";
    el.micStatus.classList.remove("error", "ok");
  }

  async function transcribe(blob: Blob) {
    if (!el.micStatus) return;
    el.micStatus.textContent = "Transcribiendo con Whisper…";
    el.micStatus.classList.remove("error", "ok");
    const fd = new FormData();
    fd.append("audio", blob, "dictado.webm");
    const tok = getToken()?.trim();
    if (tok) fd.append("_vdd_jwt", tok);
    const res = await apiFetch("/api/transcribe", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.micStatus.textContent = data.error || "Error al transcribir";
      el.micStatus.classList.add("error");
      throw new Error(data.error || res.statusText);
    }
    const text = typeof data.text === "string" ? data.text : "";
    const prev = el.transcripcion.value.trim();
    el.transcripcion.value = prev ? `${prev}\n\n${text}` : text;
    el.micStatus.textContent = "Transcripción lista";
    el.micStatus.classList.add("ok");
  }

  if (voice && el.btnRecord && el.btnStop) {
    el.btnRecord.addEventListener("click", async () => {
      el.saveStatus.textContent = "";
      el.saveStatus.className = "status";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          clearRecordingLimitTimer();
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || "audio/webm" });
          mediaRecorder = null;
          chunks = [];
          try {
            await transcribe(blob);
          } catch {
            /* mensaje en micStatus */
          }
        };
        mediaRecorder.start();
        clearRecordingLimitTimer();
        recordingLimitTimer = setTimeout(() => {
          recordingLimitTimer = null;
          if (mediaRecorder && mediaRecorder.state === "recording") {
            if (el.micStatus) {
              el.micStatus.textContent = `Límite de ${formatMaxRecordingLabel(maxRecordingMin)} alcanzado; deteniendo…`;
              el.micStatus.classList.remove("error", "ok");
            }
            mediaRecorder.stop();
            setRecordingUi(false);
          }
        }, maxRecordingMs);
        setRecordingUi(true);
      } catch (e) {
        if (el.micStatus) {
          el.micStatus.textContent =
            e instanceof Error ? e.message : "No se pudo acceder al micrófono";
          el.micStatus.classList.add("error");
        }
      }
    });

    el.btnStop.addEventListener("click", () => {
      clearRecordingLimitTimer();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        setRecordingUi(false);
      }
    });
  }

  const btnSugerirTipo = el.btnSugerirTipo;
  if (write && btnSugerirTipo) {
    btnSugerirTipo.addEventListener("click", async () => {
      const informe = el.transcripcion.value.trim();
      if (!informe) {
        el.saveStatus.textContent = "Escribí texto en el informe antes de detectar el tipo.";
        el.saveStatus.className = "status error";
        return;
      }
      btnSugerirTipo.disabled = true;
      el.saveStatus.textContent = "Analizando informe…";
      el.saveStatus.className = "status";
      try {
        const res = await apiFetch("/api/sugerir-tipo-diagnostico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcripcion: informe }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          codigo?: number | null;
          motivo?: string;
          error?: string;
          detalle?: string;
        };
        if (!res.ok) {
          el.saveStatus.textContent =
            data.error || data.detalle || "No se pudo analizar el informe";
          el.saveStatus.classList.add("error");
          return;
        }
        const codigo = data.codigo;
        const motivo = typeof data.motivo === "string" ? data.motivo.trim() : "";
        if (codigo === null || codigo === undefined) {
          el.saveStatus.textContent =
            motivo || "No se identificó un tipo con suficiente certeza. Podés elegirlo manualmente.";
          el.saveStatus.className = "status";
          return;
        }
        const label = etiquetaTipoDiagnostico(codigo);
        const motivoLine = motivo ? `\n\nMotivo sugerido: ${motivo}` : "";
        const msg = `Según el análisis del informe se sugiere el tipo:\n\n«${label}» (código ${codigo})${motivoLine}\n\n¿Desea aplicar este valor en el campo «Tipo de diagnóstico»?`;
        if (globalThis.confirm(msg)) {
          el.tipoDiagnostico.value = String(codigo);
          el.saveStatus.textContent = "Tipo de diagnóstico actualizado según su confirmación.";
          el.saveStatus.className = "status ok";
        } else {
          el.saveStatus.textContent = "No se modificó el tipo de diagnóstico.";
          el.saveStatus.className = "status muted";
        }
      } catch {
        el.saveStatus.textContent = "Error de red al analizar el informe.";
        el.saveStatus.classList.add("error");
      } finally {
        btnSugerirTipo.disabled = false;
      }
    });
  }

  if (write) {
    el.btnGuardar.addEventListener("click", async () => {
      el.saveStatus.textContent = "Guardando…";
      el.saveStatus.className = "status";
      try {
        const body = {
          pacienteRef: el.pacienteRef.value,
          estudioTipo: el.estudioTipo.value,
          imagenRef: el.imagenRef.value,
          tipoDiagnostico: normalizarCodigoTipoDiagnostico(Number(el.tipoDiagnostico.value)),
          transcripcion: el.transcripcion.value,
          notas: el.notas.value,
        };
        const res = await apiFetch("/api/diagnosticos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          el.saveStatus.textContent = data.error || "No se pudo guardar";
          el.saveStatus.classList.add("error");
          return;
        }
        el.saveStatus.textContent = "Guardado correctamente";
        el.saveStatus.classList.add("ok");
        const saved =
          data && typeof data === "object" && typeof (data as Diagnostico).id === "string"
            ? (data as Diagnostico)
            : undefined;
        await loadList(el.lista, el.listaEmpty, saved ? { preferFirst: saved } : undefined);
      } catch {
        el.saveStatus.textContent = "Error de red";
        el.saveStatus.classList.add("error");
      }
    });
  }

  void loadList(el.lista, el.listaEmpty);
}

async function loadList(
  lista: HTMLUListElement,
  listaEmpty: HTMLParagraphElement,
  opts?: { preferFirst?: Diagnostico },
) {
  try {
    /** POST + JSON vacío: apiFetch inyecta _vdd_jwt (Azure SWA no reenvía Authorization en GET). */
    const res = await apiFetch("/api/diagnosticos/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      lista.innerHTML = "";
      listaEmpty.hidden = false;
      return;
    }
    let items: Diagnostico[] = Array.isArray(data) ? (data as Diagnostico[]) : [];
    const p = opts?.preferFirst;
    if (p?.id && !items.some((d) => d.id === p.id)) {
      items = [p, ...items];
    }
    items = ordenarDiagnosticosRecientesPrimero(items);
    renderList(lista, listaEmpty, items);
  } catch {
    lista.innerHTML = "";
    listaEmpty.hidden = false;
  }
}

async function loadListOnly() {
  const lista = root.querySelector<HTMLUListElement>("#lista");
  const listaEmpty = root.querySelector<HTMLParagraphElement>("#listaEmpty");
  if (lista && listaEmpty) await loadList(lista, listaEmpty);
}

function renderList(lista: HTMLUListElement, listaEmpty: HTMLParagraphElement, items: Diagnostico[]) {
  lista.innerHTML = "";
  listaEmpty.hidden = items.length > 0;
  for (const d of items.slice(0, LISTA_DIAGNOSTICOS_MAX)) {
    const li = document.createElement("li");
    const tipoLabel = etiquetaTipoDiagnostico(d.tipoDiagnostico ?? 0);
    const meta = [tipoLabel, d.pacienteRef, d.estudioTipo, d.imagenRef].filter(Boolean).join(" · ");
    const snippet = d.transcripcion || d.notas || "(sin texto)";
    li.innerHTML = `
      <div class="meta">${escapeHtml(meta || "Sin referencias")} · ${escapeHtml(fmtDate(d.creadoEn))}</div>
      <div class="snippet">${escapeHtml(snippet)}</div>
    `;
    lista.appendChild(li);
  }
}

async function boot() {
  const t = getToken();
  if (!t) {
    renderLogin();
    return;
  }
  const { user: me } = await fetchMe(t);
  if (!me) {
    clearToken();
    renderLogin();
    return;
  }
  await mountApp(me);
}

void boot();
