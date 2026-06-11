import { all, get, run } from '../db/database.js';

function nextNumero() {
  return `AU-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}

export async function listAuditorias(req, res, next) {
  try {
    const mine = req.query.mine === '1';
    const params = [];
    const whereParts = [];
    if (mine) { whereParts.push('a.auditor_id = ?'); params.push(req.user.id); }
    if (req.company?.id) { whereParts.push('a.empresa_id = ?'); params.push(req.company.id); }
    const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const rows = await all(`SELECT a.*, u.nombre AS auditor_nombre, uc.nombre AS creado_por_nombre
      FROM auditorias_programadas a
      LEFT JOIN usuarios u ON u.id = a.auditor_id
      LEFT JOIN usuarios uc ON uc.id = a.creado_por
      ${where}
      ORDER BY CASE a.estado WHEN 'Pendiente' THEN 1 WHEN 'En curso' THEN 2 WHEN 'Esperando respuesta' THEN 3 WHEN 'Resuelto' THEN 4 ELSE 5 END, a.fecha_limite IS NULL, a.fecha_limite ASC, a.id DESC`, params);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function createAuditoria(req, res, next) {
  try {
    const d = req.body || {};
    if (!d.titulo) return res.status(400).json({ message: 'Titulo requerido' });
    const numero = nextNumero();
    const result = await run(`INSERT INTO auditorias_programadas(numero, titulo, descripcion, tipo, prioridad, estado, sku, ubicacion, lote, pedido, cliente, cantidad, auditor_id, creado_por, fecha_programada, fecha_limite, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      numero, d.titulo, d.descripcion || '', d.tipo || 'Revision preventiva', d.prioridad || 'Media', d.estado || 'Pendiente', d.sku || '', d.ubicacion || '', d.lote || '', d.pedido || '', d.cliente || '', Number(d.cantidad || 0), d.auditor_id || null, req.user.id, d.fecha_programada || null, d.fecha_limite || null, req.company?.id || d.empresa_id || null, req.company?.name || d.empresa_nombre || null
    ]);
    res.status(201).json({ id: result.id, numero });
  } catch (err) { next(err); }
}

export async function updateAuditoria(req, res, next) {
  try {
    const current = await get('SELECT * FROM auditorias_programadas WHERE id=?', [req.params.id]);
    if (!current) return res.status(404).json({ message: 'Auditoria no encontrada' });
    const d = { ...current, ...(req.body || {}) };
    await run(`UPDATE auditorias_programadas SET titulo=?, descripcion=?, tipo=?, prioridad=?, estado=?, sku=?, ubicacion=?, lote=?, pedido=?, cliente=?, cantidad=?, auditor_id=?, fecha_programada=?, fecha_limite=?, resultado=?, hallazgo_id=?, empresa_id=?, empresa_nombre=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?`, [
      d.titulo, d.descripcion || '', d.tipo || 'Revision preventiva', d.prioridad || 'Media', d.estado || 'Pendiente', d.sku || '', d.ubicacion || '', d.lote || '', d.pedido || '', d.cliente || '', Number(d.cantidad || 0), d.auditor_id || null, d.fecha_programada || null, d.fecha_limite || null, d.resultado || '', d.hallazgo_id || null, req.company?.id || d.empresa_id || null, req.company?.name || d.empresa_nombre || null, req.params.id
    ]);
    res.json({ message: 'Auditoria actualizada' });
  } catch (err) { next(err); }
}

export async function createHallazgoFromAuditoria(req, res, next) {
  try {
    const a = await get('SELECT * FROM auditorias_programadas WHERE id=?', [req.params.id]);
    if (!a) return res.status(404).json({ message: 'Auditoria no encontrada' });
    const numero = `HA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const result = await run(`INSERT INTO hallazgos(numero, titulo, descripcion, tipo, prioridad, estado, sku, ubicacion, lote, pedido, cliente, cantidad, creado_por, asignado_a, fecha_limite, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      numero, `Hallazgo desde auditoria: ${a.titulo}`, a.descripcion || a.resultado || '', a.tipo || 'Revision preventiva', a.prioridad || 'Media', 'Abierto', a.sku || '', a.ubicacion || '', a.lote || '', a.pedido || '', a.cliente || '', Number(a.cantidad || 0), req.user.id, a.auditor_id || null, a.fecha_limite || null, a.empresa_id || req.company?.id || null, a.empresa_nombre || req.company?.name || null
    ]);
    await run('UPDATE auditorias_programadas SET hallazgo_id=?, estado=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?', [result.id, 'En curso', a.id]);
    await run('INSERT INTO historial_hallazgo(hallazgo_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)', [result.id, req.user.id, 'Creado desde auditoria programada', a.numero]);
    res.status(201).json({ id: result.id, numero });
  } catch (err) { next(err); }
}
