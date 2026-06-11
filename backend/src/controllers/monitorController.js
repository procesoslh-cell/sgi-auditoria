import { all, get, run } from '../db/database.js';
import { getErpAdapter } from '../services/erpService.js';

function companyWhere(req, alias = '') {
  const id = req.company?.id;
  if (!id || id === 'all') return { sql: '', params: [] };
  const p = alias ? `${alias}.empresa_id` : 'empresa_id';
  return { sql: `${p} = ?`, params: [id] };
}

function normalizeAlert(alert, company = {}) {
  const raw = JSON.stringify(alert || {});
  const companyKey = company.id || alert.empresa_id || 'all';
  const firma = alert.firma || `${companyKey}|${alert.regla_codigo || alert.tipo}|${alert.sku || ''}|${alert.ubicacion || ''}|${alert.lote || ''}|${alert.pedido || ''}|${alert.cantidad || 0}|${alert.documento || ''}`.slice(0, 480);
  return {
    regla_codigo: alert.regla_codigo || '',
    tipo: alert.tipo || 'Alerta preventiva',
    prioridad: alert.prioridad || 'Media',
    estado: alert.estado || 'Nueva',
    sku: alert.sku || '',
    producto: alert.producto || '',
    ubicacion: alert.ubicacion || '',
    lote: alert.lote || '',
    pedido: alert.pedido || '',
    cliente: alert.cliente || '',
    cantidad: Number(alert.cantidad || 0),
    motivo: alert.motivo || '',
    detalle: alert.detalle || '',
    origen: alert.origen || 'barrido',
    firma,
    datos_json: raw,
    empresa_id: alert.empresa_id || company.id || null,
    empresa_nombre: alert.empresa_nombre || company.name || null
  };
}

function nextNumero(prefix = 'AU') {
  return `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
}

export async function getMonitorResumen(req, res, next) {
  try {
    const cw = companyWhere(req);
    const alertas = await all(`SELECT * FROM alertas_preventivas ${cw.sql ? 'WHERE ' + cw.sql : ''} ORDER BY id DESC`, cw.params);
    const ultimo = await get(`SELECT * FROM barridos_preventivos ${cw.sql ? 'WHERE ' + cw.sql : ''} ORDER BY id DESC LIMIT 1`, cw.params);
    const abc = await all(`SELECT clase, COUNT(*) AS total FROM sku_abc WHERE activo = 1 ${cw.sql ? 'AND ' + cw.sql : ''} GROUP BY clase`, cw.params);
    const abiertas = alertas.filter(a => a.estado !== 'Cerrada');
    const tareas = await all(`SELECT estado, COUNT(*) AS total FROM auditorias_programadas ${cw.sql ? 'WHERE ' + cw.sql : ''} GROUP BY estado`, cw.params);
    const resumen = {
      total_alertas: abiertas.length,
      criticas: abiertas.filter(a => a.prioridad === 'Critica').length,
      altas: abiertas.filter(a => a.prioridad === 'Alta').length,
      medias: abiertas.filter(a => a.prioridad === 'Media').length,
      bajas: abiertas.filter(a => a.prioridad === 'Baja').length,
      sku_abc: abc,
      tareas,
      ultimo_barrido: ultimo || null
    };
    res.json(resumen);
  } catch (err) { next(err); }
}

export async function listAlertas(req, res, next) {
  try {
    const estado = req.query.estado || '';
    const prioridad = req.query.prioridad || '';
    const params = [];
    const where = [];
    if (req.company?.id) { params.push(req.company.id); where.push('a.empresa_id = ?'); }
    if (estado) { params.push(estado); where.push(`a.estado = ?`); }
    if (prioridad) { params.push(prioridad); where.push(`a.prioridad = ?`); }
    const rows = await all(`SELECT a.*, u.nombre AS asignado_a_nombre
      FROM alertas_preventivas a
      LEFT JOIN usuarios u ON u.id = a.asignado_a
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE a.prioridad WHEN 'Critica' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END, a.id DESC LIMIT 1000`, params);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function updateAlerta(req, res, next) {
  try {
    const current = await get('SELECT * FROM alertas_preventivas WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ message: 'Alerta no encontrada' });
    const nextAlert = { ...current, ...req.body };
    await run(`UPDATE alertas_preventivas SET estado=?, prioridad=?, motivo=?, detalle=?, hallazgo_id=?, asignado_a=?, auditoria_id=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?`, [
      nextAlert.estado, nextAlert.prioridad, nextAlert.motivo, nextAlert.detalle, nextAlert.hallazgo_id || null, nextAlert.asignado_a || null, nextAlert.auditoria_id || null, req.params.id
    ]);
    res.json({ message: 'Alerta actualizada' });
  } catch (err) { next(err); }
}

export async function createHallazgoFromAlerta(req, res, next) {
  try {
    const alerta = await get('SELECT * FROM alertas_preventivas WHERE id = ?', [req.params.id]);
    if (!alerta) return res.status(404).json({ message: 'Alerta no encontrada' });
    const numero = `HA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const result = await run(`INSERT INTO hallazgos(numero, titulo, descripcion, tipo, prioridad, estado, sku, producto, ubicacion, lote, pedido, cliente, cantidad, area_responsable, creado_por, asignado_a, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      numero,
      `${alerta.tipo}: ${alerta.sku || alerta.ubicacion || 'sin referencia'}`,
      `${alerta.motivo || ''}\n\n${alerta.detalle || ''}`,
      alerta.tipo,
      alerta.prioridad,
      'Abierto',
      alerta.sku || '',
      alerta.producto || '',
      alerta.ubicacion || '',
      alerta.lote || '',
      alerta.pedido || '',
      alerta.cliente || '',
      Number(alerta.cantidad || 0),
      'Auditoria / Logistica',
      req.user?.id || null,
      req.body?.asignado_a || alerta.asignado_a || null,
      alerta.empresa_id || req.company?.id || null,
      alerta.empresa_nombre || req.company?.name || null
    ]);
    await run('INSERT INTO historial_hallazgo(hallazgo_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)', [result.id, req.user?.id || null, 'Creado desde alerta preventiva', alerta.motivo || '']);
    await run('UPDATE alertas_preventivas SET estado = ?, hallazgo_id = ?, actualizado_en=CURRENT_TIMESTAMP WHERE id = ?', ['Convertida en hallazgo', result.id, req.params.id]);
    res.status(201).json({ id: result.id, numero });
  } catch (err) { next(err); }
}

export async function assignAlerta(req, res, next) {
  try {
    const alerta = await get('SELECT * FROM alertas_preventivas WHERE id = ?', [req.params.id]);
    if (!alerta) return res.status(404).json({ message: 'Alerta no encontrada' });
    const auditorId = Number(req.body?.auditor_id || 0);
    if (!auditorId) return res.status(400).json({ message: 'Debe seleccionar un auditor' });
    const numero = nextNumero('AU');
    const result = await run(`INSERT INTO auditorias_programadas(numero, titulo, descripcion, tipo, prioridad, estado, sku, ubicacion, lote, pedido, cliente, cantidad, auditor_id, creado_por, alerta_id, fecha_limite, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      numero,
      req.body?.titulo || `Investigar alerta: ${alerta.sku || alerta.ubicacion || alerta.tipo}`,
      req.body?.descripcion || `${alerta.motivo || ''}\n${alerta.detalle || ''}`,
      alerta.tipo || 'Revision preventiva',
      alerta.prioridad || 'Media',
      'Pendiente',
      alerta.sku || '',
      alerta.ubicacion || '',
      alerta.lote || '',
      alerta.pedido || '',
      alerta.cliente || '',
      Number(alerta.cantidad || 0),
      auditorId,
      req.user?.id || null,
      alerta.id,
      req.body?.fecha_limite || null,
      alerta.empresa_id || req.company?.id || null,
      alerta.empresa_nombre || req.company?.name || null
    ]);
    await run('UPDATE alertas_preventivas SET estado=?, asignado_a=?, auditoria_id=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?', ['Asignada', auditorId, result.id, alerta.id]);
    res.status(201).json({ id: result.id, numero });
  } catch (err) { next(err); }
}

export async function ejecutarBarrido(req, res, next) {
  try {
    const reglas = await all('SELECT * FROM reglas_preventivas WHERE activo = 1 ORDER BY id ASC');
    const cw = companyWhere(req);
    const skuAbc = await all(`SELECT * FROM sku_abc WHERE activo = 1 ${cw.sql ? 'AND ' + cw.sql : ''} ORDER BY CASE clase WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, sku ASC LIMIT 500`, cw.params);
    const adapter = getErpAdapter();
    const config = {
      reglas,
      skuAbc,
      ajusteUmbral: Number(req.body?.ajusteUmbral || reglas.find(r => r.tipo === 'ajuste_grande')?.umbral || 50),
      diasDetenido: Number(req.body?.diasDetenido || reglas.find(r => r.tipo === 'stock_detenido')?.dias || 30),
      diasCircuito: Number(req.body?.diasCircuito || reglas.find(r => r.tipo === 'circuito_incompleto')?.dias || 7),
      companyId: req.company?.id || null,
      companyName: req.company?.name || null
    };
    let generated = [];
    if (typeof adapter.getPreventiveAlerts === 'function') generated = await adapter.getPreventiveAlerts(config);
    let creadas = 0;
    let actualizadas = 0;
    for (const item of generated.map(a => normalizeAlert(a, req.company))) {
      const existing = await get('SELECT id FROM alertas_preventivas WHERE firma = ?', [item.firma]);
      if (existing) {
        await run(`UPDATE alertas_preventivas SET prioridad=?, estado=CASE WHEN estado='Cerrada' THEN 'Nueva' ELSE estado END, cantidad=?, motivo=?, detalle=?, datos_json=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?`, [item.prioridad, item.cantidad, item.motivo, item.detalle, item.datos_json, existing.id]);
        actualizadas += 1;
      } else {
        await run(`INSERT INTO alertas_preventivas(regla_codigo, tipo, prioridad, estado, sku, producto, ubicacion, lote, pedido, cliente, cantidad, motivo, detalle, origen, firma, datos_json, empresa_id, empresa_nombre)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [item.regla_codigo, item.tipo, item.prioridad, item.estado, item.sku, item.producto, item.ubicacion, item.lote, item.pedido, item.cliente, item.cantidad, item.motivo, item.detalle, item.origen, item.firma, item.datos_json, item.empresa_id, item.empresa_nombre]);
        creadas += 1;
      }
    }
    const barrido = await run(`INSERT INTO barridos_preventivos(ejecutado_por, alcance, skus_analizados, alertas_generadas, alertas_actualizadas, empresa_id, empresa_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.user?.id || null, 'Barrido preventivo', skuAbc.length, creadas, actualizadas, req.company?.id || null, req.company?.name || null]);
    res.json({ ok: true, barrido_id: barrido.id, alertas_detectadas: generated.length, alertas_generadas: creadas, alertas_actualizadas: actualizadas, skus_abc_analizados: skuAbc.length });
  } catch (err) { next(err); }
}

export async function listAbc(req, res, next) {
  try { const cw = companyWhere(req); res.json(await all(`SELECT * FROM sku_abc ${cw.sql ? 'WHERE ' + cw.sql : ''} ORDER BY CASE clase WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, sku ASC`, cw.params)); }
  catch (err) { next(err); }
}

export async function saveAbc(req, res, next) {
  try {
    const data = req.body || {};
    if (!data.sku) return res.status(400).json({ message: 'SKU requerido' });
    const sku = String(data.sku).trim();
    const existing = await get("SELECT id FROM sku_abc WHERE sku = ? AND COALESCE(empresa_id, 'all') = COALESCE(?, 'all')", [sku, req.company?.id || null]);
    if (existing) {
      await run('UPDATE sku_abc SET producto=?, clase=?, frecuencia=?, motivo=?, activo=?, actualizado_en=CURRENT_TIMESTAMP WHERE sku=?', [data.producto || '', data.clase || 'A', data.frecuencia || 'Diario', data.motivo || '', data.activo === false ? 0 : 1, sku]);
      res.json({ message: 'SKU ABC actualizado' });
    } else {
      const result = await run('INSERT INTO sku_abc(sku, producto, clase, frecuencia, motivo, activo, empresa_id, empresa_nombre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [sku, data.producto || '', data.clase || 'A', data.frecuencia || 'Diario', data.motivo || '', data.activo === false ? 0 : 1, req.company?.id || null, req.company?.name || null]);
      res.status(201).json({ id: result.id });
    }
  } catch (err) { next(err); }
}

export async function importAbc(req, res, next) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const deactivateMissing = Boolean(req.body?.deactivateMissing);
    if (!rows.length) return res.status(400).json({ message: 'No hay filas para importar' });
    const batch = `IMP-${Date.now()}`;
    const importedSkus = [];
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const sku = String(r.SKU || r.sku || r.Codigo || r.codigo || '').trim();
      if (!sku) continue;
      const clase = String(r.Categoria || r.categoria || r.ABC || r.abc || r.Clase || r.clase || 'A').trim().toUpperCase().slice(0, 1) || 'A';
      const producto = String(r.Producto || r.producto || r.Descripcion || r.descripcion || '').trim();
      const frecuencia = String(r.Frecuencia || r.frecuencia || (clase === 'A' ? 'Diario' : clase === 'B' ? 'Semanal' : 'Mensual')).trim();
      const motivo = String(r.Motivo || r.motivo || 'Importado por archivo').trim();
      importedSkus.push(sku);
      const existing = await get("SELECT id FROM sku_abc WHERE sku=? AND COALESCE(empresa_id, 'all') = COALESCE(?, 'all')", [sku, req.company?.id || null]);
      if (existing) {
        await run('UPDATE sku_abc SET producto=?, clase=?, frecuencia=?, motivo=?, activo=1, import_batch=?, actualizado_en=CURRENT_TIMESTAMP WHERE sku=?', [producto, clase, frecuencia, motivo, batch, sku]);
        updated += 1;
      } else {
        await run('INSERT INTO sku_abc(sku, producto, clase, frecuencia, motivo, activo, import_batch, empresa_id, empresa_nombre) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)', [sku, producto, clase, frecuencia, motivo, batch, req.company?.id || null, req.company?.name || null]);
        created += 1;
      }
    }
    let deactivated = 0;
    if (deactivateMissing && importedSkus.length) {
      const placeholders = importedSkus.map(() => '?').join(',');
      const result = await run(`UPDATE sku_abc SET activo=0, actualizado_en=CURRENT_TIMESTAMP WHERE sku NOT IN (${placeholders})`, importedSkus);
      deactivated = result.changes || 0;
    }
    res.json({ created, updated, deactivated, imported: importedSkus.length, batch });
  } catch (err) { next(err); }
}

export async function deleteAbc(req, res, next) {
  try { await run('DELETE FROM sku_abc WHERE id = ?', [req.params.id]); res.json({ message: 'SKU ABC eliminado' }); }
  catch (err) { next(err); }
}

export async function listReglas(_req, res, next) {
  try { res.json(await all('SELECT * FROM reglas_preventivas ORDER BY id ASC')); }
  catch (err) { next(err); }
}

export async function createRegla(req, res, next) {
  try {
    const d = req.body || {};
    if (!d.codigo || !d.nombre || !d.tipo) return res.status(400).json({ message: 'Codigo, nombre y tipo son requeridos' });
    const result = await run(`INSERT INTO reglas_preventivas(codigo, nombre, descripcion, tipo, umbral, dias, prioridad, activo, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [d.codigo, d.nombre, d.descripcion || '', d.tipo, Number(d.umbral || 0), Number(d.dias || 0), d.prioridad || 'Media', d.activo === false ? 0 : 1, d.config_json || '']);
    res.status(201).json({ id: result.id });
  } catch (err) { next(err); }
}

export async function updateRegla(req, res, next) {
  try {
    const current = await get('SELECT * FROM reglas_preventivas WHERE id=?', [req.params.id]);
    if (!current) return res.status(404).json({ message: 'Regla no encontrada' });
    const d = { ...current, ...(req.body || {}) };
    await run('UPDATE reglas_preventivas SET codigo=?, nombre=?, descripcion=?, tipo=?, umbral=?, dias=?, prioridad=?, activo=?, config_json=?, actualizado_en=CURRENT_TIMESTAMP WHERE id=?', [d.codigo, d.nombre, d.descripcion || '', d.tipo, Number(d.umbral || 0), Number(d.dias || 0), d.prioridad || 'Media', d.activo === false ? 0 : 1, d.config_json || '', req.params.id]);
    res.json({ message: 'Regla actualizada' });
  } catch (err) { next(err); }
}

export async function listDestinatarios(_req, res, next) {
  try { res.json(await all('SELECT * FROM destinatarios_alertas ORDER BY area, nombre')); }
  catch (err) { next(err); }
}

export async function saveDestinatario(req, res, next) {
  try {
    const d = req.body || {};
    if (!d.nombre) return res.status(400).json({ message: 'Nombre requerido' });
    const result = await run('INSERT INTO destinatarios_alertas(nombre, email, rol, area, prioridad_minima, activo) VALUES (?, ?, ?, ?, ?, ?)', [d.nombre, d.email || '', d.rol || '', d.area || '', d.prioridad_minima || 'Media', d.activo === false ? 0 : 1]);
    res.status(201).json({ id: result.id });
  } catch (err) { next(err); }
}

export async function listPicksIncompletos(req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getIncompleteLogisticTasks !== 'function') return res.json([]);
    const rows = await adapter.getIncompleteLogisticTasks({
      companyId: req.company?.id || null,
      companyName: req.company?.name || null,
      fechaDesde: req.query.fecha_desde || '',
      fechaHasta: req.query.fecha_hasta || '',
      q: req.query.q || '',
      sku: req.query.sku || '',
      ubicacion: req.query.ubicacion || '',
      pedido: req.query.pedido || '',
      dias: req.query.dias || 15,
      limit: req.query.limit || 500
    });
    res.json(rows);
  } catch (err) { next(err); }
}

export async function listPickOutDiferencias(req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getPickOutDifferences !== 'function') return res.json([]);
    const rows = await adapter.getPickOutDifferences({
      companyId: req.company?.id || null,
      companyName: req.company?.name || null,
      fechaDesde: req.query.fecha_desde || '',
      fechaHasta: req.query.fecha_hasta || '',
      q: req.query.q || '',
      sku: req.query.sku || '',
      pedido: req.query.pedido || '',
      limit: req.query.limit || 500
    });
    res.json(rows);
  } catch (err) { next(err); }
}
