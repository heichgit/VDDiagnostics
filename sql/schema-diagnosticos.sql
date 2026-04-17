-- Azure SQL / SQL Server: tabla usada por la app cuando SQL_CONNECTION_STRING está definida.
-- La API también crea la tabla automáticamente si no existe (dbo.Diagnosticos).

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
GO
