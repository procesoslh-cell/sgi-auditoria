CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT UNIQUE NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol_id INTEGER NOT NULL,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS hallazgos (
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
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  FOREIGN KEY (asignado_a) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS comentarios_hallazgo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hallazgo_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  comentario TEXT NOT NULL,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS investigaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  consulta TEXT NOT NULL,
  tipo TEXT DEFAULT 'auto',
  provider TEXT,
  movimientos INTEGER DEFAULT 0,
  balance REAL DEFAULT 0,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS sku_abc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  producto TEXT,
  clase TEXT DEFAULT 'A',
  frecuencia TEXT DEFAULT 'Diario',
  motivo TEXT,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reglas_preventivas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT NOT NULL,
  umbral REAL DEFAULT 0,
  dias INTEGER DEFAULT 0,
  prioridad TEXT DEFAULT 'Media',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertas_preventivas (
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
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  hallazgo_id INTEGER,
  FOREIGN KEY (hallazgo_id) REFERENCES hallazgos(id)
);

CREATE TABLE IF NOT EXISTS barridos_preventivos (
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
);

CREATE TABLE IF NOT EXISTS destinatarios_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  rol TEXT,
  area TEXT,
  prioridad_minima TEXT DEFAULT 'Media',
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP
);
