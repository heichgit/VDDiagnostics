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
    const storage = getStorageConnectionString();
    if (!storage) {
      return storageMissingResponse();
    }

    /** @type {Record<string, unknown> | null} */
    let postBody = null;
    if (request.method === "POST") {
      try {
        postBody = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: "JSON inválido" } };
      }
    }

    const bodyJwt =
      postBody && typeof postBody._vdd_jwt === "string" ? postBody._vdd_jwt : undefined;
    const auth = getAuthFromRequest(request, bodyJwt);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
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

    if (!postBody) {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    const pacienteRef = String(postBody.pacienteRef ?? "").trim();
    const estudioTipo = String(postBody.estudioTipo ?? "").trim();
    const imagenRef = String(postBody.imagenRef ?? "").trim();
    const transcripcion = String(postBody.transcripcion ?? "").trim();
    const notas = String(postBody.notas ?? "").trim();

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
