import { app } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { readDiagnosticos, writeDiagnosticos } from "../lib/blobDiagnosticos.js";

app.http("diagnosticos", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "diagnosticos",
  handler: async (request, context) => {
    const storage = process.env.AzureWebJobsStorage;
    if (!storage) {
      return {
        status: 503,
        jsonBody: { error: "AzureWebJobsStorage no configurado (requerido para diagnosticos en la nube)" },
      };
    }

    if (request.method === "GET") {
      try {
        const list = await readDiagnosticos(storage);
        return { jsonBody: list };
      } catch (e) {
        context.error("[diagnosticos GET]", e);
        return { status: 500, jsonBody: { error: String(e?.message || e) } };
      }
    }

    /** @type {Record<string, unknown>} */
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    const pacienteRef = String(body.pacienteRef ?? "").trim();
    const estudioTipo = String(body.estudioTipo ?? "").trim();
    const imagenRef = String(body.imagenRef ?? "").trim();
    const transcripcion = String(body.transcripcion ?? "").trim();
    const notas = String(body.notas ?? "").trim();

    if (!transcripcion && !notas) {
      return { status: 400, jsonBody: { error: "Indica transcripción o notas" } };
    }

    const entry = {
      id: randomUUID(),
      pacienteRef,
      estudioTipo,
      imagenRef,
      transcripcion,
      notas,
      creadoEn: new Date().toISOString(),
    };

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const list = await readDiagnosticos(storage);
        list.unshift(entry);
        await writeDiagnosticos(storage, list);
        return { status: 201, jsonBody: entry };
      } catch (e) {
        context.log(`[diagnosticos POST] intento ${attempt}/${maxAttempts}: ${e?.message || e}`);
        if (attempt === maxAttempts) {
          return { status: 500, jsonBody: { error: String(e?.message || e) } };
        }
        await new Promise((r) => setTimeout(r, 80 * attempt));
      }
    }

    return { status: 500, jsonBody: { error: "No se pudo guardar" } };
  },
});
