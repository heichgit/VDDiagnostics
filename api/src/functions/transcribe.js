import { app } from "@azure/functions";
import busboy from "busboy";
import OpenAI, { toFile } from "openai";
import { getAuthFromRequest } from "../lib/jwt.js";
import { canTranscribe } from "../lib/roles.js";

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<{ audio: { buffer: Buffer; mimeType: string }; jwtField: string | null }>}
 */
function parseMultipartTranscribe(buffer, contentType) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: { "content-type": contentType } });
    /** @type {{ buffer: Buffer; mimeType: string } | null} */
    let audio = null;
    /** @type {string | null} */
    let jwtField = null;

    bb.on("field", (name, val) => {
      if (name === "_vdd_jwt" && typeof val === "string" && val.trim()) {
        jwtField = val.trim();
      }
    });

    bb.on("file", (name, file, info) => {
      if (name !== "audio") {
        file.resume();
        return;
      }
      const chunks = [];
      file.on("data", (d) => chunks.push(d));
      file.on("end", () => {
        audio = {
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType || "audio/webm",
        };
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => {
      if (!audio?.buffer?.length) reject(new Error("Archivo de audio requerido (campo: audio)"));
      else resolve({ audio, jwtField });
    });
    bb.end(buffer);
  });
}

app.http("transcribe", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "transcribe",
  handler: async (request, context) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return { status: 500, jsonBody: { error: "Falta OPENAI_API_KEY en la configuración de Azure" } };
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return { status: 400, jsonBody: { error: "Content-Type debe ser multipart/form-data" } };
    }

    let buffer;
    try {
      buffer = Buffer.from(await request.arrayBuffer());
    } catch (e) {
      context.error("transcribe body", e);
      return { status: 400, jsonBody: { error: "Cuerpo de petición inválido" } };
    }

    let parsed;
    try {
      parsed = await parseMultipartTranscribe(buffer, contentType);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 400, jsonBody: { error: msg } };
    }

    const auth = getAuthFromRequest(request, parsed.jwtField);
    if (!auth) {
      return { status: 401, jsonBody: { error: "Se requiere autenticación" } };
    }
    if (!canTranscribe(auth.roles)) {
      return {
        status: 403,
        jsonBody: {
          error: "Sin permiso para transcripción por voz (se requieren roles usuario y transcripcion, o admin)",
        },
      };
    }

    const audio = parsed.audio;

    try {
      const client = new OpenAI({ apiKey: key });
      const mime = audio.mimeType;
      const ext = mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : "webm";
      const file = await toFile(audio.buffer, `dictado.${ext}`, { type: mime });

      const result = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "es",
      });

      return { jsonBody: { text: result.text ?? "" } };
    } catch (e) {
      const msg = e?.message || String(e);
      context.error("[transcribe]", msg);
      return { status: 502, jsonBody: { error: "Whisper no disponible", detail: msg } };
    }
  },
});
