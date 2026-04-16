import { app } from "@azure/functions";

function maxRecordingMinutesFromEnv() {
  const raw = process.env.MAX_RECORDING_MINUTES;
  const parsed =
    raw != null && String(raw).trim() !== "" ? Number.parseFloat(String(raw).trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(Math.max(parsed, 0.5), 120);
}

app.http("publicConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "config",
  handler: async () => {
    return {
      jsonBody: { maxRecordingMinutes: maxRecordingMinutesFromEnv() },
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    };
  },
});
