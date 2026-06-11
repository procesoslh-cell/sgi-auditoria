import bcrypt from 'bcryptjs';
import { initSchema } from './schema.js';
import { get, run } from './database.js';

const roles = [
  ['Administrador', 'Acceso completo al sistema'],
  ['Jefe Auditoria', 'Gestiona hallazgos, reportes y cierres'],
  ['Auditor', 'Investiga stock y crea hallazgos']
];

const users = [
  ['Administrador SGI', 'admin@sgi.local', 'admin123', 'Administrador'],
  ['Jefe de Auditoria', 'jefe.auditoria@sgi.local', 'jefe123', 'Jefe Auditoria'],
  ['Auditor Operativo', 'auditor@sgi.local', 'auditor123', 'Auditor'],
  ['David Dellamea', 'david.dellamea@sgi.local', 'david123', 'Auditor'],
  ['Carlos Vergara', 'carlos.vergara@sgi.local', 'carlos123', 'Auditor']
];

async function seed() {
  await initSchema();
  for (const [nombre, descripcion] of roles) {
    const exists = await get('SELECT id FROM roles WHERE nombre = ?', [nombre]);
    if (!exists) await run('INSERT INTO roles(nombre, descripcion) VALUES (?, ?)', [nombre, descripcion]);
  }

  for (const [nombre, email, password, rol] of users) {
    const exists = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
    const role = await get('SELECT id FROM roles WHERE nombre = ?', [rol]);
    if (!exists && role) {
      const hash = await bcrypt.hash(password, 10);
      await run('INSERT INTO usuarios(nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)', [nombre, email, hash, role.id]);
    }
  }

  const reglas = [
    ['REG-001', 'Ajuste grande', 'Detecta ajustes positivos o negativos por encima del umbral definido.', 'ajuste_grande', 50, 30, 'Alta'],
    ['REG-002', 'Movimiento en AUDITORIA', 'Detecta movimientos hacia o desde ubicaciones AUDITORIA/*.', 'ubicacion_auditoria', 0, 30, 'Alta'],
    ['REG-003', 'Mercaderia detenida', 'Detecta stock o movimientos detenidos en CONTROL, REMISION, MUELLE o SALIDA por mas de N dias.', 'stock_detenido', 0, 30, 'Media'],
    ['REG-004', 'Circuito incompleto', 'Detecta movimientos en ubicaciones intermedias sin salida posterior a cliente.', 'circuito_incompleto', 0, 7, 'Alta'],
    ['REG-005', 'SKU ABC prioritario', 'Prioriza el barrido de SKU clase A/B/C cargados por Auditoria.', 'sku_abc', 0, 0, 'Media']
  ];
  for (const [codigo, nombre, descripcion, tipo, umbral, dias, prioridad] of reglas) {
    const exists = await get('SELECT id FROM reglas_preventivas WHERE codigo = ?', [codigo]);
    if (!exists) await run('INSERT INTO reglas_preventivas(codigo, nombre, descripcion, tipo, umbral, dias, prioridad) VALUES (?, ?, ?, ?, ?, ?, ?)', [codigo, nombre, descripcion, tipo, umbral, dias, prioridad]);
  }

  const abc = await get('SELECT id FROM sku_abc WHERE sku = ?', ['1004742']);
  if (!abc) await run('INSERT INTO sku_abc(sku, producto, clase, frecuencia, motivo) VALUES (?, ?, ?, ?, ?)', ['1004742', 'SKU prioritario auditoria', 'A', 'Diario', 'Alta rotacion / validar con Auditoria']);

  const dest = await get('SELECT id FROM destinatarios_alertas WHERE email = ?', ['jefe.auditoria@sgi.local']);
  if (!dest) await run('INSERT INTO destinatarios_alertas(nombre, email, rol, area, prioridad_minima) VALUES (?, ?, ?, ?, ?)', ['Jefe de Auditoria', 'jefe.auditoria@sgi.local', 'Jefe Auditoria', 'Auditoria', 'Media']);

  const h = await get('SELECT id FROM hallazgos WHERE numero = ?', ['HA-2026-0001']);
  if (!h) {
    await run(`INSERT INTO hallazgos(numero, titulo, descripcion, tipo, prioridad, estado, sku, producto, ubicacion, lote, cantidad, area_responsable, creado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'HA-2026-0001',
      'Diferencia inicial en AUDITORIA/C0-164-01',
      'Caso inicial para validar el flujo de hallazgos y seguimiento de auditoria.',
      'Faltante',
      'Alta',
      'Abierto',
      '1004742',
      'Producto auditoria',
      'AUDITORIA/C0-164-01',
      'P01080/09014',
      -11,
      'Deposito Central',
      2
    ]);
  }

  console.log('Seed finalizado. Usuarios iniciales: admin@sgi.local/admin123, jefe.auditoria@sgi.local/jefe123, auditor@sgi.local/auditor123');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
