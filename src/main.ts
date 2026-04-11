type Diagnostico = {
  id: string;
  pacienteRef: string;
  estudioTipo: string;
  imagenRef: string;
  transcripcion: string;
  notas: string;
  creadoEn: string;
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <h1>Diagnóstico por imagen médica</h1>
  <p class="subtitle">Graba el dictado; Whisper lo transcribe. Edita el texto y guarda el registro.</p>

  <div class="card">
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
      <label for="imagenRef">Ref. / accession imagen</label>
      <input id="imagenRef" type="text" placeholder="Ej. PACS ID o número de acceso" />
    </div>
  </div>

  <div class="card">
    <h2>Dictado por voz</h2>
    <p class="status" id="micStatus"></p>
    <div class="actions">
      <button type="button" class="btn-record" id="btnRecord">Grabar</button>
      <button type="button" class="btn-ghost" id="btnStop" disabled>Detener y transcribir</button>
    </div>
    <label for="transcripcion">Informe / transcripción</label>
    <textarea id="transcripcion" placeholder="Aparecerá aquí el texto reconocido. Puedes editarlo."></textarea>
    <label for="notas">Notas adicionales (opcional)</label>
    <textarea id="notas" rows="3" placeholder="Complementos, aclaraciones…"></textarea>
    <div class="actions">
      <button type="button" class="btn-primary" id="btnGuardar">Guardar diagnóstico</button>
    </div>
    <p class="status" id="saveStatus"></p>
  </div>

  <div class="card">
    <h2>Últimos registros</h2>
    <ul class="list" id="lista"></ul>
    <p class="empty" id="listaEmpty" hidden>No hay registros guardados aún.</p>
  </div>
`;

const el = {
  pacienteRef: app.querySelector<HTMLInputElement>("#pacienteRef")!,
  estudioTipo: app.querySelector<HTMLSelectElement>("#estudioTipo")!,
  imagenRef: app.querySelector<HTMLInputElement>("#imagenRef")!,
  transcripcion: app.querySelector<HTMLTextAreaElement>("#transcripcion")!,
  notas: app.querySelector<HTMLTextAreaElement>("#notas")!,
  btnRecord: app.querySelector<HTMLButtonElement>("#btnRecord")!,
  btnStop: app.querySelector<HTMLButtonElement>("#btnStop")!,
  btnGuardar: app.querySelector<HTMLButtonElement>("#btnGuardar")!,
  micStatus: app.querySelector<HTMLParagraphElement>("#micStatus")!,
  saveStatus: app.querySelector<HTMLParagraphElement>("#saveStatus")!,
  lista: app.querySelector<HTMLUListElement>("#lista")!,
  listaEmpty: app.querySelector<HTMLParagraphElement>("#listaEmpty")!,
};

let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];

function setRecordingUi(active: boolean) {
  el.btnRecord.disabled = active;
  el.btnStop.disabled = !active;
  el.btnRecord.classList.toggle("recording", active);
  el.micStatus.textContent = active ? "Grabando…" : "";
  el.micStatus.classList.remove("error", "ok");
}

async function transcribe(blob: Blob) {
  el.micStatus.textContent = "Transcribiendo con Whisper…";
  el.micStatus.classList.remove("error", "ok");
  const fd = new FormData();
  fd.append("audio", blob, "dictado.webm");
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
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
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || "audio/webm" });
      mediaRecorder = null;
      chunks = [];
      try {
        await transcribe(blob);
      } catch {
        /* error ya mostrado */
      }
    };
    mediaRecorder.start();
    setRecordingUi(true);
  } catch (e) {
    el.micStatus.textContent =
      e instanceof Error ? e.message : "No se pudo acceder al micrófono";
    el.micStatus.classList.add("error");
  }
});

el.btnStop.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    setRecordingUi(false);
  }
});

el.btnGuardar.addEventListener("click", async () => {
  el.saveStatus.textContent = "Guardando…";
  el.saveStatus.className = "status";
  try {
    const body = {
      pacienteRef: el.pacienteRef.value,
      estudioTipo: el.estudioTipo.value,
      imagenRef: el.imagenRef.value,
      transcripcion: el.transcripcion.value,
      notas: el.notas.value,
    };
    const res = await fetch("/api/diagnosticos", {
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
    await loadList();
  } catch {
    el.saveStatus.textContent = "Error de red";
    el.saveStatus.classList.add("error");
  }
});

function renderList(items: Diagnostico[]) {
  el.lista.innerHTML = "";
  el.listaEmpty.hidden = items.length > 0;
  for (const d of items.slice(0, 12)) {
    const li = document.createElement("li");
    const meta = [d.pacienteRef, d.estudioTipo, d.imagenRef].filter(Boolean).join(" · ");
    const snippet = d.transcripcion || d.notas || "(sin texto)";
    li.innerHTML = `
      <div class="meta">${escapeHtml(meta || "Sin referencias")} · ${escapeHtml(fmtDate(d.creadoEn))}</div>
      <div class="snippet">${escapeHtml(snippet)}</div>
    `;
    el.lista.appendChild(li);
  }
}

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

async function loadList() {
  try {
    const res = await fetch("/api/diagnosticos");
    const data = await res.json();
    renderList(Array.isArray(data) ? data : []);
  } catch {
    el.listaEmpty.hidden = false;
  }
}

loadList();
