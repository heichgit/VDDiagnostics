import { BlobServiceClient } from "@azure/storage-blob";

const CONTAINER = "vddiagnostics-data";
const BLOB_NAME = "diagnosticos.json";

/**
 * @param {string} connectionString
 */
export async function readDiagnosticos(connectionString) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB_NAME);
  try {
    const buf = await blob.downloadToBuffer();
    const data = JSON.parse(buf.toString("utf8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    const code = e?.details?.errorCode ?? e?.code;
    if (e?.statusCode === 404 || code === "BlobNotFound") return [];
    throw e;
  }
}

/**
 * @param {string} connectionString
 * @param {unknown[]} list
 */
export async function writeDiagnosticos(connectionString, list) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists();
  const blob = container.getBlockBlobClient(BLOB_NAME);
  const body = JSON.stringify(list, null, 2);
  const buf = Buffer.from(body, "utf8");
  await blob.uploadData(buf, {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}
