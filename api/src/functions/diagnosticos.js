import { app } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { readDiagnosticos, writeDiagnosticos } from "../lib/blobDiagnosticos.js";
import { getAuthFromRequest } from "../lib/jwt.js";
import { canReadDiagnosticos, canWriteDiagnostico } from "../lib/roles.js";
import { getStorageConnectionString, storageMissingResponse } from "../lib/storageConnection.js";

app.http("diagnosticos", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "diagnosticos",
  handler: async (request, context) => {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }

    const storage = getStorageConnectionString();
    if (!storage) {
      return storageMissingResponse();
    }

    if (request.method === "GET") {
      if (!canReadDiagnosticos(auth.roles)) {
        return { status: 403, jsonBody: { error: "Sin permiso para ver diagnósticos" } };
      }
      try {
        const list = await readDiagnosticos(storage);
        return { jsonBody: list };
      } catch (e) {
        context.error("[diagnosticos GET]", e);
        return { status: 500, jsonBody: { error: String(e?.message || e) } };
      }
    }

    if (!canWriteDiagnostico(auth.roles)) {
      return { status: 403, jsonBody: { error: "Sin permiso para crear diagnósticos" } };
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
