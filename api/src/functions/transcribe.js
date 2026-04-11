import { app } from "@azure/functions";
import busboy from "busboy";
import OpenAI, { toFile } from "openai";

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {Promise<{ buffer: Buffer; mimeType: string }>}
 */
function parseMultipartAudio(buffer, contentType) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: { "content-type": contentType } });
    /** @type {{ buffer: Buffer; mimeType: string } | null} */
    let audio = null;

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
      else resolve(audio);
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

    let audio;
    try {
      audio = await parseMultipartAudio(buffer, contentType);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 400, jsonBody: { error: msg } };
    }

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
