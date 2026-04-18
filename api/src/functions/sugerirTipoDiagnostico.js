import { app } from "@azure/functions";
import { getAuthFromRequest } from "../lib/jwt.js";
import { canWriteDiagnostico } from "../lib/roles.js";
import { sugerirTipoDesdeInforme } from "../lib/sugerirTipoDiagnosticoOpenAI.js";

app.http("sugerirTipoDiagnostico", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "sugerir-tipo-diagnostico",
  handler: async (request, context) => {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "JSON inválido" } };
    }

    const bodyJwt = body && typeof body._vdd_jwt === "string" ? body._vdd_jwt : undefined;
    const auth = getAuthFromRequest(request, bodyJwt);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }
    if (!canWriteDiagnostico(auth.roles)) {
      return {
        status: 403,
        jsonBody: { error: "Sin permiso (se requiere rol usuario o admin para esta acción)" },
      };
    }

    const transcripcion = typeof body.transcripcion === "string" ? body.transcripcion : "";
    try {
      const out = await sugerirTipoDesdeInforme(transcripcion);
      if (!out.ok) {
        return { status: 400, jsonBody: { error: out.error } };
      }
      return {
        jsonBody: { codigo: out.codigo, motivo: out.motivo },
        headers: { "Cache-Control": "no-store" },
      };
    } catch (e) {
      context.error("[sugerir-tipo-diagnostico]", e);
      return {
        status: 502,
        jsonBody: { error: "Fallo al consultar el modelo", detalle: String(e?.message || e) },
      };
    }
  },
});
