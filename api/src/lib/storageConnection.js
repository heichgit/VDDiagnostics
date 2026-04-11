/**
 * Cadena de conexión al Storage usada por Blob (usuarios y diagnósticos).
 * En Azure Static Web Apps suele existir como AzureWebJobsStorage; si falta,
 * podés definir AZURE_STORAGE_CONNECTION_STRING con la misma cadena.
 */
export function getStorageConnectionString() {
  const v =
    process.env.AzureWebJobsStorage ||
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.STORAGE_CONNECTION_STRING ||
    "";
  return typeof v === "string" ? v.trim() : "";
}

export function storageMissingResponse() {
  return {
    status: 503,
    jsonBody: {
      error: "Storage no configurado",
      detalle:
        "Falta la cadena de conexión a Azure Storage. En Azure Portal: tu recurso Static Web App → Environment variables (o Configuration) → Application settings. Agregá AzureWebJobsStorage con la connection string de una cuenta Storage (Claves de acceso), o bien AZURE_STORAGE_CONNECTION_STRING con el mismo valor.",
    },
  };
}
