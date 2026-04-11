/**
 * Cadena de conexión al Storage (Blob: usuarios y diagnósticos).
 *
 * En Azure Static Web Apps no podés crear manualmente la variable
 * AzureWebJobsStorage (está reservada / no permitida en App settings).
 * Usá AZURE_STORAGE_CONNECTION_STRING con la connection string de tu Storage Account.
 *
 * En Functions locales sigue siendo válido AzureWebJobsStorage en local.settings.json.
 */
export function getStorageConnectionString() {
  const v =
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.STORAGE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    "";
  return typeof v === "string" ? v.trim() : "";
}

export function storageMissingResponse() {
  return {
    status: 503,
    jsonBody: {
      error: "Storage no configurado",
      detalle:
        "Agregá la variable AZURE_STORAGE_CONNECTION_STRING en tu Static Web App (Environment variables / Application settings) con el valor de Connection string de una cuenta Azure Storage (Access keys). En Static Web Apps no se permite definir AzureWebJobsStorage a mano.",
    },
  };
}
