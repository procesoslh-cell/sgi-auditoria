import { all, get, run } from '../db/database.js';

function nextNumero() {
  const year = new Date().getFullYear();
  return `HA-${year}-${String(Date.now()).slice(-6)}`;
}

async function addHistory(hallazgoId, userId, accion, detalle = '') {
  await run('INSERT INTO historial_hallazgo(hallazgo_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)', [hallazgoId, userId || null, accion, detalle]);
}

export async function listHallazgos(req, res, next) {
  try {
    const params = [];
    const where = [];
    if (req.company?.id) { params.push(req.company.id); where.push('h.empresa_id = ?'); }
    const rows = await all(`SELECT h.*, uc.nombre as creado_por_nombre, ua.nombre as asignado_a_nombre
      FROM hallazgos h
      LEFT JOIN usuarios uc ON uc.id = h.creado_por
      LEFT JOIN usuarios ua ON ua.id = h.asignado_a
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE h.estado WHEN 'Abierto' THEN 1 WHEN 'En investigacion' THEN 2 WHEN 'Esperando respuesta' THEN 3 WHEN 'Pendiente validacion' THEN 4 WHEN 'Cerrado' THEN 5 ELSE 6 END, h.id DESC`, params);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function getHallazgo(req, res, next) {
  try {
    const item = await get(`SELECT h.*, uc.nombre as creado_por_nombre, ua.nombre as asignado_a_nombre
      FROM hallazgos h
      LEFT JOIN usuarios uc ON uc.id = h.creado_por
      LEFT JOIN usuarios ua ON ua.id = h.asignado_a
      WHERE h.id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ message: 'Hallazgo no encontrado' });
    const comentarios = await all(`SELECT c.*, u.nombre as usuario_nombre FROM comentarios_hallazgo c JOIN usuarios u ON u.id = c.usuario_id WHERE c.hallazgo_id = ? ORDER BY c.id ASC`, [req.params.id]);
    const historial = await all(`SELECT hh.*, u.nombre as usuario_nombre FROM historial_hallazgo hh LEFT JOIN usuarios u ON u.id = hh.usuario_id WHERE hh.hallazgo_id=? ORDER BY hh.id ASC`, [req.params.id]);
    const emails = await all(`SELECT e.*, u.nombre as usuario_nombre FROM emails_hallazgo e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.hallazgo_id=? ORDER BY e.id DESC`, [req.params.id]);
    res.json({ ...item, comentarios, historial, emails });
  } catch (err) { next(err); }
}

export async function createHallazgo(req, res, next) {
  try {
    const data = req.body;
    if (!data.titulo) return res.status(400).json({ message: 'El titulo es requerido' });
    const numero = nextNumero();
    const result = await run(`INSERT INTO hallazgos(numero, titulo, descripcion, tipo, prioridad, estado, sku, producto, ubicacion, lote, pedido, cliente, cantidad, area_responsable, creado_por, asignado_a, fecha_limite, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      numero, data.titulo, data.descripcion || '', data.tipo || 'Diferencia de stock', data.prioridad || 'Media', data.estado || 'Abierto',
      data.sku || '', data.producto || '', data.ubicacion || '', data.lote || '', data.pedido || '', data.cliente || '', Number(data.cantidad || 0), data.area_responsable || '', req.user.id, data.asignado_a || null, data.fecha_limite || null, req.company?.id || data.empresa_id || null, req.company?.name || data.empresa_nombre || null
    ]);
    await addHistory(result.id, req.user.id, 'Hallazgo creado', data.titulo);
    res.status(201).json({ id: result.id, numero, ...data, estado: data.estado || 'Abierto' });
  } catch (err) { next(err); }
}

export async function updateHallazgo(req, res, next) {
  try {
    const current = await get('SELECT * FROM hallazgos WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ message: 'Hallazgo no encontrado' });
    const nextData = { ...current, ...req.body };
    await run(`UPDATE hallazgos SET titulo=?, descripcion=?, tipo=?, prioridad=?, estado=?, sku=?, producto=?, ubicacion=?, lote=?, pedido=?, cliente=?, cantidad=?, area_responsable=?, asignado_a=?, fecha_limite=?, resolucion=?, feedback=?, empresa_id=?, empresa_nombre=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?`, [
      nextData.titulo, nextData.descripcion, nextData.tipo, nextData.prioridad, nextData.estado, nextData.sku, nextData.producto, nextData.ubicacion, nextData.lote, nextData.pedido || '', nextData.cliente || '', Number(nextData.cantidad || 0), nextData.area_responsable, nextData.asignado_a || null, nextData.fecha_limite || null, nextData.resolucion || '', nextData.feedback || '', req.company?.id || nextData.empresa_id || null, req.company?.name || nextData.empresa_nombre || null, req.params.id
    ]);
    const changes = [];
    for (const key of ['estado', 'prioridad', 'asignado_a', 'fecha_limite']) if (String(current[key] || '') !== String(nextData[key] || '')) changes.push(`${key}: ${current[key] || '-'} -> ${nextData[key] || '-'}`);
    await addHistory(req.params.id, req.user.id, 'Hallazgo actualizado', changes.join(' | ') || 'Edicion general');
    res.json({ message: 'Hallazgo actualizado' });
  } catch (err) { next(err); }
}

export async function addComment(req, res, next) {
  try {
    const { comentario, tipo = 'comentario' } = req.body;
    if (!comentario) return res.status(400).json({ message: 'Comentario requerido' });
    await run('INSERT INTO comentarios_hallazgo(hallazgo_id, usuario_id, comentario, tipo) VALUES (?, ?, ?, ?)', [req.params.id, req.user.id, comentario, tipo]);
    await addHistory(req.params.id, req.user.id, tipo === 'feedback' ? 'Feedback agregado' : 'Comentario agregado', comentario.slice(0, 250));
    res.status(201).json({ message: 'Comentario agregado' });
  } catch (err) { next(err); }
}

export async function prepareEmail(req, res, next) {
  try {
    const h = await get('SELECT * FROM hallazgos WHERE id=?', [req.params.id]);
    if (!h) return res.status(404).json({ message: 'Hallazgo no encontrado' });
    const to = req.body?.to || '';
    const cc = req.body?.cc || '';
    const subject = req.body?.subject || `SGI Auditoria - ${h.numero} - ${h.titulo}`;
    const body = req.body?.body || `Se informa hallazgo de Auditoria:\n\nNumero: ${h.numero}\nTitulo: ${h.titulo}\nTipo: ${h.tipo}\nPrioridad: ${h.prioridad}\nSKU: ${h.sku || '-'}\nUbicacion: ${h.ubicacion || '-'}\nCantidad: ${h.cantidad || 0}\n\nDescripcion:\n${h.descripcion || ''}\n\nSe solicita analisis/respuesta del area responsable.`;
    if (!to) return res.status(400).json({ message: 'Email destinatario requerido' });
    await run('INSERT INTO emails_hallazgo(hallazgo_id, usuario_id, para, cc, asunto, mensaje) VALUES (?, ?, ?, ?, ?, ?)', [h.id, req.user.id, to, cc, subject, body]);
    await addHistory(h.id, req.user.id, 'Email preparado', `Para: ${to}${cc ? ' | CC: ' + cc : ''}`);
    const mailto = `mailto:${encodeURIComponent(to)}?${cc ? `cc=${encodeURIComponent(cc)}&` : ''}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    res.json({ to, cc, subject, body, mailto });
  } catch (err) { next(err); }
}
