import { getErpAdapter } from '../services/erpService.js';

function opts(req) {
  return {
    companyId: req.company?.id || null,
    companyName: req.company?.name || null,
    q: String(req.query.q || '').trim(),
    sku: String(req.query.sku || '').trim(),
    ubicacion: String(req.query.ubicacion || '').trim(),
    lote: String(req.query.lote || '').trim(),
    limit: Math.min(Number(req.query.limit || 100), 500)
  };
}

export async function listUbicaciones(req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getUbicacionesModulo !== 'function') return res.json({ rows: [], resumen: {} });
    res.json(await adapter.getUbicacionesModulo(opts(req)));
  } catch (err) { next(err); }
}

export async function listProductos(req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getProductosModulo !== 'function') return res.json({ rows: [], resumen: {} });
    res.json(await adapter.getProductosModulo(opts(req)));
  } catch (err) { next(err); }
}

export async function listLotes(req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getLotesModulo !== 'function') return res.json({ rows: [], resumen: {} });
    res.json(await adapter.getLotesModulo(opts(req)));
  } catch (err) { next(err); }
}
