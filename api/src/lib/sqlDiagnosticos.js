import sql from "mssql";

/**
 * Azure SQL / SQL Server. Prioridad: SQL_CONNECTION_STRING, luego AZURE_SQL_CONNECTION_STRING.
 * Si está definida, GET/POST /api/diagnosticos usan la tabla dbo.Diagnosticos (se crea si no existe).
 */

export function getSqlConnectionString() {
  const v =
    process.env.SQL_CONNECTION_STRING ||
    process.env.AZURE_SQL_CONNECTION_STRING ||
    "";
  return typeof v === "string" ? v.trim() : "";
}

export function isSqlConfigured() {
  return getSqlConnectionString().length > 0;
}

/** @type {import("mssql").ConnectionPool | null} */
let pool = null;

/** @type {Promise<import("mssql").ConnectionPool> | null} */
let connecting = null;

async function getPool() {
  const cs = getSqlConnectionString();
  if (!cs) throw new Error("SQL no configurado");
  if (pool) return pool;
  if (connecting) return connecting;
  connecting = (async () => {
    const next = new sql.ConnectionPool(cs);
    next.on("error", (err) => {
      console.error("[sqlDiagnosticos] pool error", err);
      pool = null;
    });
    await next.connect();
    pool = next;
    return next;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

let schemaReady = false;

async function ensureSchema(p) {
  if (schemaReady) return;
  await p.request().query(`
    IF OBJECT_ID(N'dbo.Diagnosticos', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Diagnosticos (
        id CHAR(36) NOT NULL CONSTRAINT PK_Diagnosticos PRIMARY KEY,
        pacienteRef NVARCHAR(512) NOT NULL CONSTRAINT DF_Diagnosticos_pacienteRef DEFAULT (N''),
        estudioTipo NVARCHAR(256) NOT NULL CONSTRAINT DF_Diagnosticos_estudioTipo DEFAULT (N''),
        imagenRef NVARCHAR(512) NOT NULL CONSTRAINT DF_Diagnosticos_imagenRef DEFAULT (N''),
        transcripcion NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Diagnosticos_transcripcion DEFAULT (N''),
        notas NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Diagnosticos_notas DEFAULT (N''),
        creadoEn DATETIME2(3) NOT NULL
      );
      CREATE INDEX IX_Diagnosticos_creadoEn ON dbo.Diagnosticos (creadoEn DESC);
    END
  `);
  schemaReady = true;
}

function rowToEntry(r) {
  const creadoEn =
    r.creadoEn instanceof Date
      ? r.creadoEn.toISOString()
      : typeof r.creadoEn === "string"
        ? r.creadoEn
        : new Date(r.creadoEn).toISOString();
  return {
    id: String(r.id),
    pacienteRef: r.pacienteRef != null ? String(r.pacienteRef) : "",
    estudioTipo: r.estudioTipo != null ? String(r.estudioTipo) : "",
    imagenRef: r.imagenRef != null ? String(r.imagenRef) : "",
    transcripcion: r.transcripcion != null ? String(r.transcripcion) : "",
    notas: r.notas != null ? String(r.notas) : "",
    creadoEn,
  };
}

/**
 * Lista más reciente primero (mismo orden que el JSON en blob).
 * @returns {Promise<Array<Record<string, string>>>}
 */
export async function listDiagnosticosSql() {
  const p = await getPool();
  await ensureSchema(p);
  const result = await p.request().query(`
    SELECT id, pacienteRef, estudioTipo, imagenRef, transcripcion, notas, creadoEn
    FROM dbo.Diagnosticos
    ORDER BY creadoEn DESC
  `);
  return (result.recordset ?? []).map(rowToEntry);
}

/**
 * @param {{ id: string, pacienteRef: string, estudioTipo: string, imagenRef: string, transcripcion: string, notas: string, creadoEn: string }} entry
 */
export async function insertDiagnosticoSql(entry) {
  const p = await getPool();
  await ensureSchema(p);
  const creado = new Date(entry.creadoEn);
  await p
    .request()
    .input("id", sql.VarChar(36), entry.id)
    .input("pacienteRef", sql.NVarChar(512), entry.pacienteRef)
    .input("estudioTipo", sql.NVarChar(256), entry.estudioTipo)
    .input("imagenRef", sql.NVarChar(512), entry.imagenRef)
    .input("transcripcion", sql.NVarChar(), entry.transcripcion)
    .input("notas", sql.NVarChar(), entry.notas)
    .input("creadoEn", sql.DateTime2(3), creado)
    .query(`
      INSERT INTO dbo.Diagnosticos (id, pacienteRef, estudioTipo, imagenRef, transcripcion, notas, creadoEn)
      VALUES (@id, @pacienteRef, @estudioTipo, @imagenRef, @transcripcion, @notas, @creadoEn)
    `);
  return entry;
}
