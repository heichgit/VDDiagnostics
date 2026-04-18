import { app } from "@azure/functions";
import { getStorageConnectionString } from "../lib/storageConnection.js";
import { isSqlConfigured } from "../lib/sqlDiagnosticos.js";

function maxRecordingMinutesFromEnv() {
  const raw = process.env.MAX_RECORDING_MINUTES;
  const parsed =
    raw != null && String(raw).trim() !== "" ? Number.parseFloat(String(raw).trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(Math.max(parsed, 0.5), 120);
}

/** Para comprobar en producción si la API ve SQL o blob (sin exponer secretos). */
function diagnosticosDbMode() {
  if (isSqlConfigured()) return "sql";
  if (getStorageConnectionString()) return "blob";
  return "none";
}

app.http("publicConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config",
  handler: async () => {
    return {
      jsonBody: {
        maxRecordingMinutes: maxRecordingMinutesFromEnv(),
        diagnosticosDb: diagnosticosDbMode(),
      },
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    };
  },
});
