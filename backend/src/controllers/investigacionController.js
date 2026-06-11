import { all, run } from '../db/database.js';
import { getErpAdapter } from '../services/erpService.js';

export async function searchInvestigation(req, res, next) {
  try {
    const {
      q = '',
      tipo = 'auto',
      pedido = '',
      ubicacion = '',
      sku = '',
      lote = '',
      usuario = '',
      tipo_movimiento = '',
      fecha_desde = '',
      fecha_hasta = ''
    } = req.query;

    const filtros = {
      q: String(q || '').trim(),
      pedido: String(pedido || '').trim(),
      ubicacion: String(ubicacion || '').trim(),
      sku: String(sku || '').trim(),
      lote: String(lote || '').trim(),
      usuario: String(usuario || '').trim(),
      tipoMovimiento: String(tipo_movimiento || '').trim(),
      fechaDesde: String(fecha_desde || '').trim(),
      fechaHasta: String(fecha_hasta || '').trim()
    };

    const tieneFiltroAvanzado = Object.values(filtros).some(Boolean);
    if (!tieneFiltroAvanzado) return res.status(400).json({ message: 'Ingresá al menos un criterio de investigación' });

    const adapter = getErpAdapter();
    const result = await adapter.search(filtros.q || filtros.pedido || filtros.ubicacion || filtros.sku || filtros.lote || 'investigacion', tipo, {
      companyId: req.company?.id,
      companyName: req.company?.name,
      filtros
    });

    const consultaTexto = [
      filtros.q && `Texto: ${filtros.q}`,
      filtros.pedido && `Pedido: ${filtros.pedido}`,
      filtros.ubicacion && `Ubicación: ${filtros.ubicacion}`,
      filtros.sku && `SKU: ${filtros.sku}`,
      filtros.lote && `Lote: ${filtros.lote}`,
      filtros.usuario && `Usuario: ${filtros.usuario}`,
      filtros.tipoMovimiento && `Movimiento: ${filtros.tipoMovimiento}`,
      filtros.fechaDesde && `Desde: ${filtros.fechaDesde}`,
      filtros.fechaHasta && `Hasta: ${filtros.fechaHasta}`
    ].filter(Boolean).join(' | ');

    await run(
      `INSERT INTO investigaciones (usuario_id, consulta, tipo, provider, movimientos, balance, empresa_id, empresa_nombre, filtros_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user?.id || null, consultaTexto, result.tipo || tipo, result.provider || 'desconocido', result.resumen?.movimientos || 0, result.resumen?.balance || 0, req.company?.id || null, req.company?.name || null, JSON.stringify(filtros)]
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function recentInvestigations(req, res, next) {
  try {
    const rows = await all(`
      SELECT i.*, u.nombre AS usuario
      FROM investigaciones i
      LEFT JOIN usuarios u ON u.id = i.usuario_id
      ${req.company?.id ? 'WHERE i.empresa_id = ?' : ''}
      ORDER BY i.creado_en DESC
      LIMIT 20
    `, req.company?.id ? [req.company.id] : []);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
