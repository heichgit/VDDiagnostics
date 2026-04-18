import OpenAI from "openai";
import { CATALOGO_TIPOS_DIAGNOSTICO_PROMPT } from "./catalogoTipoDiagnosticoPrompt.js";
import { normalizarTipoDiagnostico } from "./tipoDiagnostico.js";

const MAX_INFORME_CHARS = 14000;

/**
 * @param {string} transcripcion
 * @returns {Promise<{ ok: true, codigo: number | null, motivo: string } | { ok: false, error: string }>}
 */
export async function sugerirTipoDesdeInforme(transcripcion) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "OPENAI_API_KEY no configurada en el servidor" };
  }
  const text = String(transcripcion ?? "").trim();
  if (!text) {
    return { ok: false, error: "El informe está vacío" };
  }
  const informe = text.slice(0, MAX_INFORME_CHARS);

  const client = new OpenAI({ apiKey: key });
  const model = (process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini").trim();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 220,
    messages: [
      {
        role: "system",
        content: `Sos un asistente para clasificar informes de imagen cardiológica en español.
Debés elegir exactamente UN código del siguiente catálogo según el contenido clínico del informe.
Si el texto no permite clasificar con criterio razonable, usá codigo null (no uses 0 salvo que el informe indique explícitamente normalidad sin otra patología predominante).

Catálogo (solo estos códigos; no inventes otros):
${CATALOGO_TIPOS_DIAGNOSTICO_PROMPT}

Respondé SOLO un objeto JSON válido, sin bloques markdown, con esta forma exacta:
{"codigo": <entero 0-36 o null>, "motivo": "<una o dos frases breves en español explicando la elección o por qué no se puede clasificar>"}`,
      },
      {
        role: "user",
        content: `Texto del informe / transcripción médica:\n\n${informe}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";
  let jsonText = raw;
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "Respuesta del modelo no interpretable" };
  }
  jsonText = jsonText.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Respuesta del modelo no es JSON válido" };
  }

  const motivo = typeof parsed.motivo === "string" ? parsed.motivo.trim() : "";

  if (parsed.codigo === null || parsed.codigo === undefined || parsed.codigo === "") {
    return { ok: true, codigo: null, motivo: motivo || "No se identificó un tipo con suficiente certeza." };
  }

  const codigo = normalizarTipoDiagnostico(parsed.codigo);
  return { ok: true, codigo, motivo };
}
