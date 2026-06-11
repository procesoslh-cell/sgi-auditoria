import { run } from './database.js';

async function safe(sql) {
  try { await run(sql); } catch (_err) { /* idempotent migration */ }
}

export async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol_id INTEGER NOT NULL,
    activo INTEGER DEFAULT 1,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
  )`);


  await run(`CREATE TABLE IF NOT EXISTS empresas (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    analizable INTEGER DEFAULT 1
  )`);
  await run(`INSERT OR IGNORE INTO empresas(id, nombre, activo, analizable) VALUES ('LH','LH',1,1),('GRAM SAS','GRAM SAS',1,1),('RODAMAX','RODAMAX',1,1),('BICI','BICI',1,0)`);

  await run(`CREATE TABLE IF NOT EXISTS hallazgos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT DEFAULT 'Diferencia de stock',
    prioridad TEXT DEFAULT 'Media',
    estado TEXT DEFAULT 'Abierto',
    sku TEXT,
    producto TEXT,
    ubicacion TEXT,
    lote TEXT,
    cantidad REAL DEFAULT 0,
    area_responsable TEXT,
    creado_por INTEGER,
    asignado_a INTEGER,
    fecha_limite TEXT,
    resolucion TEXT,
    feedback TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (asignado_a) REFERENCES usuarios(id)
  )`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN fecha_limite TEXT`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN resolucion TEXT`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN feedback TEXT`);

  await run(`CREATE TABLE IF NOT EXISTS comentarios_hallazgo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hallazgo_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    tipo TEXT DEFAULT 'comentario',
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);
  await safe(`ALTER TABLE comentarios_hallazgo ADD COLUMN tipo TEXT DEFAULT 'comentario'`);

  await run(`CREATE TABLE IF NOT EXISTS historial_hallazgo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hallazgo_id INTEGER NOT NULL,
    usuario_id INTEGER,
    accion TEXT NOT NULL,
    detalle TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS emails_hallazgo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hallazgo_id INTEGER NOT NULL,
    usuario_id INTEGER,
    para TEXT NOT NULL,
    cc TEXT,
    asunto TEXT,
    mensaje TEXT,
    enviado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS investigaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    consulta TEXT NOT NULL,
    tipo TEXT DEFAULT 'auto',
    provider TEXT,
    movimientos INTEGER DEFAULT 0,
    balance REAL DEFAULT 0,
    filtros_json TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sku_abc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    producto TEXT,
    clase TEXT DEFAULT 'A',
    frecuencia TEXT DEFAULT 'Diario',
    motivo TEXT,
    activo INTEGER DEFAULT 1,
    import_batch TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await safe(`ALTER TABLE sku_abc ADD COLUMN import_batch TEXT`);

  await run(`CREATE TABLE IF NOT EXISTS reglas_preventivas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT NOT NULL,
    umbral REAL DEFAULT 0,
    dias INTEGER DEFAULT 0,
    prioridad TEXT DEFAULT 'Media',
    activo INTEGER DEFAULT 1,
    config_json TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await safe(`ALTER TABLE reglas_preventivas ADD COLUMN config_json TEXT`);
  await safe(`ALTER TABLE reglas_preventivas ADD COLUMN actualizado_en TEXT`);

  await run(`CREATE TABLE IF NOT EXISTS alertas_preventivas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regla_codigo TEXT,
    tipo TEXT NOT NULL,
    prioridad TEXT DEFAULT 'Media',
    estado TEXT DEFAULT 'Nueva',
    sku TEXT,
    producto TEXT,
    ubicacion TEXT,
    lote TEXT,
    cantidad REAL DEFAULT 0,
    motivo TEXT,
    detalle TEXT,
    origen TEXT DEFAULT 'barrido',
    firma TEXT UNIQUE,
    datos_json TEXT,
    asignado_a INTEGER,
    auditoria_id INTEGER,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    hallazgo_id INTEGER,
    FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id),
    FOREIGN KEY (asignado_a) REFERENCES usuarios(id)
  )`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN asignado_a INTEGER`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN auditoria_id INTEGER`);

  await run(`CREATE TABLE IF NOT EXISTS barridos_preventivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ejecutado_por INTEGER,
    estado TEXT DEFAULT 'finalizado',
    alcance TEXT,
    skus_analizados INTEGER DEFAULT 0,
    alertas_generadas INTEGER DEFAULT 0,
    alertas_actualizadas INTEGER DEFAULT 0,
    errores TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ejecutado_por) REFERENCES usuarios(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS destinatarios_alertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT,
    area TEXT,
    prioridad_minima TEXT DEFAULT 'Media',
    activo INTEGER DEFAULT 1,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await safe(`ALTER TABLE hallazgos ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN empresa_nombre TEXT`);
  await safe(`ALTER TABLE investigaciones ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE investigaciones ADD COLUMN empresa_nombre TEXT`);
  await safe(`ALTER TABLE investigaciones ADD COLUMN filtros_json TEXT`);
  await safe(`ALTER TABLE sku_abc ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE sku_abc ADD COLUMN empresa_nombre TEXT`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN empresa_nombre TEXT`);
  await safe(`ALTER TABLE barridos_preventivos ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE barridos_preventivos ADD COLUMN empresa_nombre TEXT`);

  await run(`CREATE TABLE IF NOT EXISTS auditorias_programadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT DEFAULT 'Revision preventiva',
    prioridad TEXT DEFAULT 'Media',
    estado TEXT DEFAULT 'Pendiente',
    sku TEXT,
    ubicacion TEXT,
    lote TEXT,
    cantidad REAL DEFAULT 0,
    auditor_id INTEGER,
    creado_por INTEGER,
    alerta_id INTEGER,
    hallazgo_id INTEGER,
    fecha_programada TEXT,
    fecha_limite TEXT,
    resultado TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auditor_id) REFERENCES usuarios(id),
    FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    FOREIGN KEY (alerta_id) REFERENCES alertas_preventivas(id),
    FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id)
  )`);
  await safe(`ALTER TABLE auditorias_programadas ADD COLUMN empresa_id TEXT`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN pedido TEXT`);
  await safe(`ALTER TABLE hallazgos ADD COLUMN cliente TEXT`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN pedido TEXT`);
  await safe(`ALTER TABLE alertas_preventivas ADD COLUMN cliente TEXT`);
  await safe(`ALTER TABLE auditorias_programadas ADD COLUMN pedido TEXT`);
  await safe(`ALTER TABLE auditorias_programadas ADD COLUMN cliente TEXT`);
}


