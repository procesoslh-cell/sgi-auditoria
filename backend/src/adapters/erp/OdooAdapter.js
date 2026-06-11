import pg from 'pg';
import { ErpAdapter } from './ErpAdapter.js';
import { env } from '../../config/env.js';

function assertConfigured() {
  const missing = [];
  if (!env.odoo.host) missing.push('ODOO_DB_HOST');
  if (!env.odoo.database) missing.push('ODOO_DB_NAME');
  if (!env.odoo.user) missing.push('ODOO_DB_USER');
  if (!env.odoo.password) missing.push('ODOO_DB_PASSWORD');
  return missing;
}

function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortDate(value) {
  const d = asDate(value);
  if (!d) return value || '-';
  return d.toISOString().slice(0, 10);
}

function inText(row, words) {
  const haystack = `${row.tipo || ''} ${row.origen || ''} ${row.destino || ''} ${row.documento || ''}`.toLowerCase();
  return words.some(w => haystack.includes(w.toLowerCase()));
}

function isAdjustment(row) {
  return !!row.es_ajuste || inText(row, ['inventory adjustment', 'ajuste', 'virtual locations']);
}

function isCustomerExit(row) {
  return row.direccion === 'salida' && inText(row, ['partners/customers', 'customer', 'out', 'despachar', 'pick']);
}


function classifyAuditRow(row) {
  const cantidad = n(row.cantidad);
  const abs = Math.abs(cantidad);
  const text = `${row.tipo || ''} ${row.origen || ''} ${row.destino || ''} ${row.documento || ''}`.toLowerCase();
  const customer = !!row.involucra_cliente || text.includes('partners/customers') || text.includes('customer') || text.includes('/out') || text.includes('despachar');
  const supplier = !!row.involucra_proveedor || text.includes('partners/vendors') || text.includes('vendor') || text.includes('recepcion');
  const adjustment = isAdjustment(row);

  if (adjustment && cantidad > 0) return { key: 'ajuste_positivo', label: 'Ajustes positivos / sobrantes', signo: '+', countAs: 'entrada', amount: abs };
  if (adjustment && cantidad < 0) return { key: 'ajuste_negativo', label: 'Ajustes negativos / faltantes', signo: '-', countAs: 'salida', amount: abs };
  if (supplier && cantidad > 0) return { key: 'recepcion_proveedor', label: 'Recepciones proveedor / compras', signo: '+', countAs: 'entrada', amount: abs };
  if (customer && cantidad < 0) return { key: 'salida_cliente', label: 'Salidas a cliente / despachos', signo: '-', countAs: 'salida', amount: abs };
  if (cantidad > 0) return { key: 'transferencia_entrada', label: 'Transferencias / entradas internas', signo: '+', countAs: 'entrada', amount: abs };
  if (cantidad < 0) return { key: 'transferencia_salida', label: 'Transferencias / salidas internas', signo: '-', countAs: 'salida', amount: abs };
  return { key: 'sin_movimiento', label: 'Movimientos sin cantidad', signo: '0', countAs: 'neutro', amount: 0 };
}

function buildBreakdown(rows) {
  const order = ['recepcion_proveedor', 'transferencia_entrada', 'ajuste_positivo', 'salida_cliente', 'transferencia_salida', 'ajuste_negativo', 'sin_movimiento'];
  const map = new Map();
  for (const row of rows || []) {
    const c = classifyAuditRow(row);
    if (!map.has(c.key)) {
      map.set(c.key, {
        key: c.key,
        label: c.label,
        signo: c.signo,
        count_as: c.countAs,
        movimientos: 0,
        cantidad: 0,
        ejemplos: []
      });
    }
    const item = map.get(c.key);
    item.movimientos += 1;
    item.cantidad += c.amount;
    if (item.ejemplos.length < 5) {
      item.ejemplos.push({
        fecha: row.fecha,
        origen: row.origen,
        destino: row.destino,
        documento: row.documento,
        usuario: row.usuario,
        cantidad: row.cantidad,
        sku: row.sku,
        lote: row.lote
      });
    }
  }
  const items = [...map.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const entradas = items.filter(i => i.count_as === 'entrada').reduce((a, i) => a + i.cantidad, 0);
  const salidas = items.filter(i => i.count_as === 'salida').reduce((a, i) => a + i.cantidad, 0);
  return {
    items,
    formula: {
      entradas,
      salidas,
      balance: entradas - salidas,
      entradas_detalle: items.filter(i => i.count_as === 'entrada').map(i => `${i.label}: ${i.cantidad}`),
      salidas_detalle: items.filter(i => i.count_as === 'salida').map(i => `${i.label}: ${i.cantidad}`)
    },
    nota: 'Este desglose muestra exactamente que tipos de movimientos alimentan cada total. En busquedas por SKU, las transferencias internas pueden aparecer como entradas operativas porque no existe una ubicacion puntual contra la cual netearlas; para auditoria fina conviene cruzar SKU + ubicacion o lote.'
  };
}

function buildAuditAnalysis(rows, query, tipo = 'general') {
  const normalized = (rows || []).map(r => ({ ...r, cantidad: n(r.cantidad), cantidad_abs: n(r.cantidad_abs || Math.abs(r.cantidad)) }));
  const asc = [...normalized].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  const desglose = buildBreakdown(asc);
  const positive = asc.filter(r => n(r.cantidad) > 0);
  const negative = asc.filter(r => n(r.cantidad) < 0);
  const adjPos = asc.filter(r => isAdjustment(r) && n(r.cantidad) > 0);
  const adjNeg = asc.filter(r => isAdjustment(r) && n(r.cantidad) < 0);
  const opPos = asc.filter(r => !isAdjustment(r) && n(r.cantidad) > 0);
  const opNeg = asc.filter(r => !isAdjustment(r) && n(r.cantidad) < 0);
  const customerExits = asc.filter(isCustomerExit);

  const entradas = positive.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const salidas = negative.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const ajustesPositivos = adjPos.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const ajustesNegativos = adjNeg.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const entradasOperativas = opPos.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const salidasOperativas = opNeg.reduce((a, r) => a + Math.abs(n(r.cantidad)), 0);
  const balance = entradas - salidas;
  const diferenciaAjustes = ajustesNegativos - ajustesPositivos;
  const absBalance = Math.abs(balance);
  const absDiferenciaAjustes = Math.abs(diferenciaAjustes);
  const impacto = Math.max(absBalance, absDiferenciaAjustes);

  let estado = 'Balance cerrado';
  let severidad = 'baja';
  if (absBalance > 0 || absDiferenciaAjustes > 0) {
    estado = 'Diferencia detectada';
    severidad = impacto >= 100 ? 'critica' : impacto >= 25 ? 'alta' : impacto >= 5 ? 'media' : 'baja';
  }

  const timelineAgrupado = [];
  if (opPos.length) {
    timelineAgrupado.push({
      titulo: 'Entradas operativas / transferencias',
      fecha: `${shortDate(opPos[0].fecha)}${opPos.length > 1 ? ` a ${shortDate(opPos[opPos.length - 1].fecha)}` : ''}`,
      cantidad: entradasOperativas,
      detalle: `${opPos.length} movimiento(s) de entrada no asociados a ajustes`,
      tipo: 'entrada'
    });
  }
  if (adjPos.length) {
    timelineAgrupado.push({
      titulo: 'Ajustes positivos / sobrantes',
      fecha: `${shortDate(adjPos[0].fecha)}${adjPos.length > 1 ? ` a ${shortDate(adjPos[adjPos.length - 1].fecha)}` : ''}`,
      cantidad: ajustesPositivos,
      detalle: `${adjPos.length} ajuste(s) positivo(s) registrados`,
      tipo: 'ajuste_positivo'
    });
  }
  if (opNeg.length) {
    timelineAgrupado.push({
      titulo: customerExits.length ? 'Salidas por picks / despachos' : 'Salidas operativas / transferencias',
      fecha: `${shortDate(opNeg[0].fecha)}${opNeg.length > 1 ? ` a ${shortDate(opNeg[opNeg.length - 1].fecha)}` : ''}`,
      cantidad: salidasOperativas,
      detalle: `${opNeg.length} movimiento(s) de salida. ${customerExits.length ? `${customerExits.length} con destino cliente/pick.` : ''}`.trim(),
      tipo: 'salida'
    });
  }
  if (adjNeg.length) {
    timelineAgrupado.push({
      titulo: 'Ajustes negativos / faltantes',
      fecha: `${shortDate(adjNeg[0].fecha)}${adjNeg.length > 1 ? ` a ${shortDate(adjNeg[adjNeg.length - 1].fecha)}` : ''}`,
      cantidad: ajustesNegativos,
      detalle: `${adjNeg.length} ajuste(s) negativo(s) registrados`,
      tipo: 'ajuste_negativo'
    });
  }

  const interpretacion = [];
  if (entradasOperativas) interpretacion.push(`Se registraron ${entradasOperativas} unidades de entrada operativa o transferencia para la consulta ${query}. Revisar el panel "Como se calculo" para ver que categorias componen ese numero.`);
  if (ajustesPositivos) interpretacion.push(`Se detectaron ajustes positivos por ${ajustesPositivos} unidades, interpretables como sobrantes físicos o altas de inventario.`);
  if (salidasOperativas) interpretacion.push(`Se registraron salidas operativas por ${salidasOperativas} unidades${customerExits.length ? `, incluyendo ${customerExits.length} movimiento(s) asociados a picks/despachos/clientes` : ''}.`);
  if (ajustesNegativos) interpretacion.push(`Se detectaron ajustes negativos por ${ajustesNegativos} unidades, interpretables como faltantes físicos o bajas de inventario.`);
  if (!interpretacion.length) interpretacion.push('No se encontraron movimientos suficientes para construir una interpretación automática.');
  if (absDiferenciaAjustes > 0) interpretacion.push(`La diferencia neta entre ajustes positivos y negativos es de ${absDiferenciaAjustes} unidad(es)${diferenciaAjustes > 0 ? ' con más faltantes que sobrantes' : ' con más sobrantes que faltantes'}.`);
  if (absBalance > 0) interpretacion.push(`El balance operativo calculado queda en ${balance} unidad(es), por lo que la investigación no cierra matemáticamente.`);
  if (absBalance === 0 && absDiferenciaAjustes === 0 && normalized.length) interpretacion.push('El balance cierra matemáticamente y no se detecta diferencia neta de ajustes.');

  const conclusion = absBalance !== 0
    ? `Revisar diferencia de balance por ${absBalance} unidad(es).`
    : absDiferenciaAjustes !== 0
      ? `Aunque el balance cierre, existe una diferencia neta de ajustes por ${absDiferenciaAjustes} unidad(es). Conviene revisar el período entre el primer ajuste positivo y el último ajuste negativo.`
      : normalized.length
        ? 'No se detecta diferencia neta con las reglas actuales.'
        : 'Sin datos suficientes para concluir.';

  return {
    tipo,
    estado,
    severidad,
    kpis: {
      entradas,
      salidas,
      entradas_operativas: entradasOperativas,
      salidas_operativas: salidasOperativas,
      ajustes_positivos: ajustesPositivos,
      ajustes_negativos: ajustesNegativos,
      balance,
      diferencia_neta_ajustes: diferenciaAjustes,
      posible_diferencia: impacto,
      movimientos_analizados: normalized.length,
      picks_o_salidas_cliente: customerExits.length
    },
    timeline_agrupado: timelineAgrupado,
    desglose_calculo: desglose,
    interpretacion,
    conclusion,
    sugerir_hallazgo: impacto > 0,
    hallazgo_sugerido: impacto > 0 ? {
      tipo: 'Diferencia de inventario',
      prioridad: severidad === 'critica' || severidad === 'alta' ? 'Alta' : severidad === 'media' ? 'Media' : 'Baja',
      cantidad: impacto,
      titulo: `Diferencia detectada en ${query}`,
      descripcion: `${conclusion}\n\n${interpretacion.join('\n')}`
    } : null
  };
}



function normalizeCompanyOption(options = {}) {
  const raw = options.companyId || options.company_id || null;
  if (!raw || raw === 'all' || raw === 'Todas') return null;
  return raw;
}

export class OdooAdapter extends ErpAdapter {
  constructor() {
    super();
    this.configErrors = assertConfigured();
    this.pool = this.configErrors.length ? null : new pg.Pool({
      host: env.odoo.host,
      port: env.odoo.port,
      database: env.odoo.database,
      user: env.odoo.user,
      password: env.odoo.password,
      ssl: env.odoo.ssl ? { rejectUnauthorized: false } : false,
      max: 6,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 7000
    });
    this.schemaCache = new Map();
  }

  async getCompanies() {
    this.ensureReady();
    if (!(await this.hasTable('res_company'))) {
      return [{ id: 'all', name: 'Todas', analizable: true }, { id: 'LH', name: 'LH', analizable: true }, { id: 'GRAM SAS', name: 'GRAM SAS', analizable: true }, { id: 'RODAMAX', name: 'RODAMAX', analizable: true }, { id: 'BICI', name: 'BICI', analizable: false }];
    }
    const nameExpr = await this.getTranslatedNameExpression('res_company', 'name', 'rc');
    const result = await this.pool.query(`SELECT rc.id, ${nameExpr} AS name FROM res_company rc ORDER BY ${nameExpr}`);
    const rows = result.rows.map(r => ({ id: r.id, name: r.name, analizable: !String(r.name || '').toUpperCase().includes('BICI') }));
    return [{ id: 'all', name: 'Todas', analizable: true }, ...rows];
  }

  async addCompanyFilter(params, aliases = []) {
    const companyId = normalizeCompanyOption({ companyId: aliases.companyId });
    return '';
  }

  async buildCompanyFilter(params, companyId, candidates = []) {
    const raw = normalizeCompanyOption({ companyId });
    if (!raw) return '';
    const numeric = Number(raw);
    const isNumeric = Number.isFinite(numeric) && String(raw).trim() !== '';
    const value = isNumeric ? numeric : `%${String(raw).trim()}%`;
    const clauses = [];
    let companyNameExpr = null;
    if (!isNumeric && await this.hasTable('res_company')) {
      companyNameExpr = await this.getTranslatedNameExpression('res_company', 'name', 'rcf');
    }
    for (const c of candidates) {
      if (!c.table || !c.alias) continue;
      if (!(await this.hasColumn(c.table, 'company_id'))) continue;
      if (isNumeric || !companyNameExpr) clauses.push(`${c.alias}.company_id = $${params.length + 1}`);
      else clauses.push(`${c.alias}.company_id IN (SELECT rcf.id FROM res_company rcf WHERE ${companyNameExpr} ILIKE $${params.length + 1})`);
    }
    if (!clauses.length) return '';
    params.push(value);
    return ` AND (${clauses.join(' OR ')})`;
  }

  ensureReady() {
    if (this.configErrors.length) {
      const err = new Error(`Faltan variables en .env: ${this.configErrors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
  }

  async testConnection() {
    this.ensureReady();
    const result = await this.pool.query('SELECT current_database() AS database, current_user AS user, NOW() AS server_time');
    return { ok: true, provider: 'odoo', ...result.rows[0] };
  }

  async hasTable(table) {
    const key = `table:${table}`;
    if (this.schemaCache.has(key)) return this.schemaCache.get(key);
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists
    `, [table]);
    const exists = !!result.rows[0]?.exists;
    this.schemaCache.set(key, exists);
    return exists;
  }

  async hasColumn(table, column) {
    const key = `column:${table}.${column}`;
    if (this.schemaCache.has(key)) return this.schemaCache.get(key);
    const result = await this.pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists
    `, [table, column]);
    const exists = !!result.rows[0]?.exists;
    this.schemaCache.set(key, exists);
    return exists;
  }


  async getColumnDataType(table, column) {
    const key = `type:${table}.${column}`;
    if (this.schemaCache.has(key)) return this.schemaCache.get(key);
    const result = await this.pool.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1
    `, [table, column]);
    const type = result.rows[0]?.data_type || null;
    this.schemaCache.set(key, type);
    return type;
  }

  async getTranslatedNameExpression(table, column = 'name', alias = '') {
    const dataType = await this.getColumnDataType(table, column);
    const ref = alias ? `${alias}.${column}` : column;
    if (dataType === 'jsonb' || dataType === 'json') {
      return `COALESCE(${ref}->>'es_AR', ${ref}->>'es_ES', ${ref}->>'en_US', ${ref}->>'es_UY', ${ref}->>'es', ${ref}->>'en', ${ref}::text)`;
    }
    return `${ref}::text`;
  }

  async getProductNameExpression(alias = 'pt') {
    return this.getTranslatedNameExpression('product_template', 'name', alias);
  }

  async getPickingTypeNameExpression(alias = 'spt') {
    if (!(await this.hasTable('stock_picking_type'))) return `'Movimiento'::text`;
    if (!(await this.hasColumn('stock_picking_type', 'name'))) return `'Movimiento'::text`;
    return this.getTranslatedNameExpression('stock_picking_type', 'name', alias);
  }

  async getLotTableName() {
    if (await this.hasTable('stock_lot')) return 'stock_lot';
    if (await this.hasTable('stock_production_lot')) return 'stock_production_lot';
    return null;
  }

  async getQtyExpression() {
    const candidates = ['qty_done', 'quantity', 'product_uom_qty', 'reserved_uom_qty'];
    const available = [];
    for (const col of candidates) {
      if (await this.hasColumn('stock_move_line', col)) available.push(`sml.${col}`);
    }
    if (await this.hasColumn('stock_move', 'product_uom_qty')) available.push('sm.product_uom_qty');
    return `COALESCE(${available.length ? available.join(', ') : '0'}, 0)`;
  }

  async getDateExpression() {
    const parts = [];
    if (await this.hasColumn('stock_move_line', 'date')) parts.push('sml.date');
    if (await this.hasColumn('stock_move', 'date')) parts.push('sm.date');
    if (await this.hasColumn('stock_picking', 'scheduled_date')) parts.push('sp.scheduled_date');
    if (await this.hasColumn('stock_move_line', 'create_date')) parts.push('sml.create_date');
    return `COALESCE(${parts.length ? parts.join(', ') : 'NOW()'})`;
  }

  getPedidoExpression() {
    return `COALESCE(
      NULLIF(sp.origin::text, ''),
      NULLIF(sm.origin::text, ''),
      NULLIF(regexp_replace(COALESCE(sp.name::text, sm.reference::text, ''), '/(PICK|PACK|OUT|INT|RECEP|RECEPCION|DESPACHO|IN).*$', '', 'i'), ''),
      NULLIF(sp.name::text, ''),
      NULLIF(sm.reference::text, ''),
      'SIN-PEDIDO'
    )`;
  }

  getDocumentoExpression() {
    return `COALESCE(sp.name::text, sm.reference::text, sm.origin::text, 'SIN-DOCUMENTO')`;
  }

  async getLocations(limit = 80, q = '', options = {}) {
    this.ensureReady();
    const params = [];
    const hasActive = await this.hasColumn('stock_location', 'active');
    let where = hasActive ? 'WHERE active IS DISTINCT FROM false' : 'WHERE 1=1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (complete_name ILIKE $${params.length} OR name ILIKE $${params.length})`;
    }
    where += await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_location', alias: 'stock_location' }]);
    params.push(limit);
    const result = await this.pool.query(`
      SELECT id, name, complete_name, usage${hasActive ? ', active' : ', true AS active'}
      FROM stock_location
      ${where}
      ORDER BY complete_name
      LIMIT $${params.length}
    `, params);
    return result.rows;
  }

  async getProducts(limit = 80, q = '', options = {}) {
    this.ensureReady();
    const params = [];
    const hasActive = await this.hasColumn('product_template', 'active');
    const productNameExpr = await this.getProductNameExpression('pt');
    let where = hasActive ? 'WHERE pt.active IS DISTINCT FROM false' : 'WHERE 1=1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (pp.default_code ILIKE $${params.length} OR ${productNameExpr} ILIKE $${params.length})`;
    }
    where += await this.buildCompanyFilter(params, options.companyId, [{ table: 'product_template', alias: 'pt' }, { table: 'product_product', alias: 'pp' }]);
    params.push(limit);
    const result = await this.pool.query(`
      SELECT pp.id, pp.default_code AS sku, ${productNameExpr} AS producto${hasActive ? ', pt.active' : ', true AS active'}
      FROM product_product pp
      JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${where}
      ORDER BY pp.default_code NULLS LAST, ${productNameExpr}
      LIMIT $${params.length}
    `, params);
    return result.rows;
  }

  async getLocationInvestigation(query, options = {}) {
    this.ensureReady();
    const locations = await this.getLocations(20, query, options);
    const ids = locations.map(l => l.id);
    if (!ids.length) {
      return {
        provider: 'odoo', tipo: 'ubicacion', query,
        ubicaciones: [], resumen: { movimientos: 0, entradas: 0, salidas: 0, ajustes: 0, balance: 0, alerta: 'No se encontro la ubicacion en Odoo' },
        timeline: []
      };
    }

    const qtyExpr = await this.getQtyExpression();
    const dateExpr = await this.getDateExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const pickingTypeNameExpr = await this.getPickingTypeNameExpression('spt');
    const lotTable = await this.getLotTableName();
    const hasLotId = await this.hasColumn('stock_move_line', 'lot_id');
    const lotJoin = lotTable && hasLotId ? `LEFT JOIN ${lotTable} spl ON spl.id = sml.lot_id` : '';
    const lotSelect = lotTable && hasLotId ? 'spl.name AS lote' : 'NULL::text AS lote';

    const params = [ids];
    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);
    const result = await this.pool.query(`
      SELECT
        sml.id,
        ${dateExpr} AS fecha,
        COALESCE(${pickingTypeNameExpr}, sm.reference::text, sm.origin::text, 'Movimiento') AS tipo,
        sl_src.complete_name AS origen,
        sl_dst.complete_name AS destino,
        pp.default_code AS sku,
        ${productNameExpr} AS producto,
        ${lotSelect},
        ${qtyExpr} AS cantidad_abs,
        CASE
          WHEN sml.location_dest_id = ANY($1::int[]) THEN ${qtyExpr}
          WHEN sml.location_id = ANY($1::int[]) THEN -${qtyExpr}
          ELSE 0
        END AS cantidad,
        CASE
          WHEN sml.location_dest_id = ANY($1::int[]) THEN 'entrada'
          WHEN sml.location_id = ANY($1::int[]) THEN 'salida'
          ELSE 'otro'
        END AS direccion,
        CASE
          WHEN sl_src.usage = 'inventory' OR sl_dst.usage = 'inventory' OR sl_src.complete_name ILIKE '%Inventory adjustment%' OR sl_dst.complete_name ILIKE '%Inventory adjustment%' THEN true
          ELSE false
        END AS es_ajuste,
        ru.login AS usuario,
        ${this.getPedidoExpression()} AS pedido,
        rp.name AS cliente,
        ${this.getDocumentoExpression()} AS documento
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN stock_picking_type spt ON spt.id = sp.picking_type_id
      LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${lotJoin}
      LEFT JOIN res_users ru ON ru.id = COALESCE(sml.write_uid, sml.create_uid, sm.write_uid, sm.create_uid)
      LEFT JOIN res_partner rp ON rp.id = sp.partner_id
      WHERE (sml.location_id = ANY($1::int[]) OR sml.location_dest_id = ANY($1::int[])) ${companyFilter}
      ORDER BY ${dateExpr} DESC
      LIMIT 400000
    `, params);

    const rows = result.rows.map(r => ({ ...r, cantidad: n(r.cantidad), cantidad_abs: n(r.cantidad_abs) }));
    const entradas = rows.filter(r => r.direccion === 'entrada').reduce((a, r) => a + Math.abs(r.cantidad), 0);
    const salidas = rows.filter(r => r.direccion === 'salida').reduce((a, r) => a + Math.abs(r.cantidad), 0);
    const ajustes = rows.filter(r => r.es_ajuste).reduce((a, r) => a + r.cantidad, 0);
    const balance = rows.reduce((a, r) => a + r.cantidad, 0);

    return {
      provider: 'odoo',
      tipo: 'ubicacion',
      query,
      ubicaciones: locations,
      resumen: {
        movimientos: rows.length,
        entradas,
        salidas,
        ajustes,
        balance,
        alerta: rows.length ? 'Movimientos reales leidos desde Odoo' : 'Ubicacion encontrada sin movimientos recientes'
      },
      analisis: buildAuditAnalysis(rows, query, 'ubicacion'),
      timeline: rows
    };
  }

  async getProductInvestigation(query, options = {}) {
    this.ensureReady();
    const products = await this.getProducts(20, query, options);
    const ids = products.map(p => p.id);
    if (!ids.length) {
      return { provider: 'odoo', tipo: 'producto', query, productos: [], resumen: { movimientos: 0, entradas: 0, salidas: 0, balance: 0, alerta: 'No se encontro el SKU/producto en Odoo' }, timeline: [] };
    }
    return this.getMovementSearch(query, { productIds: ids, tipo: 'producto', extra: { productos: products }, companyId: options.companyId });
  }

  async getLotInvestigation(query, options = {}) {
    this.ensureReady();
    const lotTable = await this.getLotTableName();
    if (!lotTable || !(await this.hasColumn('stock_move_line', 'lot_id'))) {
      return { provider: 'odoo', tipo: 'lote', query, resumen: { movimientos: 0, entradas: 0, salidas: 0, balance: 0, alerta: 'No se encontro tabla/campo de lotes en Odoo' }, timeline: [] };
    }
    const lotResult = await this.pool.query(`SELECT id, name FROM ${lotTable} WHERE name ILIKE $1 ORDER BY name LIMIT 20`, [`%${query}%`]);
    const ids = lotResult.rows.map(l => l.id);
    if (!ids.length) return { provider: 'odoo', tipo: 'lote', query, lotes: [], resumen: { movimientos: 0, entradas: 0, salidas: 0, balance: 0, alerta: 'No se encontro el lote en Odoo' }, timeline: [] };
    return this.getMovementSearch(query, { lotIds: ids, tipo: 'lote', extra: { lotes: lotResult.rows }, companyId: options.companyId });
  }

  async getMovementSearch(query, options = {}) {
    const qtyExpr = await this.getQtyExpression();
    const dateExpr = await this.getDateExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const pickingTypeNameExpr = await this.getPickingTypeNameExpression('spt');
    const lotTable = await this.getLotTableName();
    const hasLotId = await this.hasColumn('stock_move_line', 'lot_id');
    const lotJoin = lotTable && hasLotId ? `LEFT JOIN ${lotTable} spl ON spl.id = sml.lot_id` : '';
    const lotSelect = lotTable && hasLotId ? 'spl.name AS lote' : 'NULL::text AS lote';

    const params = [];
    const filters = [];
    if (options.productIds?.length) {
      params.push(options.productIds);
      filters.push(`sml.product_id = ANY($${params.length}::int[])`);
    }
    if (options.lotIds?.length) {
      params.push(options.lotIds);
      filters.push(`sml.lot_id = ANY($${params.length}::int[])`);
    }
    if (!filters.length) {
      params.push(`%${query}%`);
      const p = `$${params.length}`;
      filters.push(`(pp.default_code ILIKE ${p} OR ${productNameExpr} ILIKE ${p} OR sl_src.complete_name ILIKE ${p} OR sl_dst.complete_name ILIKE ${p} OR ${lotTable && hasLotId ? `spl.name ILIKE ${p} OR` : ''} sp.name ILIKE ${p})`);
    }

    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);
    const result = await this.pool.query(`
      SELECT
        sml.id,
        ${dateExpr} AS fecha,
        COALESCE(${pickingTypeNameExpr}, sm.reference::text, sm.origin::text, 'Movimiento') AS tipo,
        sl_src.complete_name AS origen,
        sl_dst.complete_name AS destino,
        pp.default_code AS sku,
        ${productNameExpr} AS producto,
        ${lotSelect},
        ${qtyExpr} AS cantidad,
        sl_src.usage AS origen_usage,
        sl_dst.usage AS destino_usage,
        CASE WHEN sl_src.usage = 'customer' OR sl_dst.usage = 'customer' THEN true ELSE false END AS involucra_cliente,
        CASE WHEN sl_src.usage = 'supplier' OR sl_dst.usage = 'supplier' THEN true ELSE false END AS involucra_proveedor,
        CASE
          WHEN sl_src.usage = 'inventory' OR sl_dst.usage = 'inventory' OR sl_src.complete_name ILIKE '%Inventory adjustment%' OR sl_dst.complete_name ILIKE '%Inventory adjustment%' THEN true
          ELSE false
        END AS es_ajuste,
        CASE
          WHEN sl_dst.usage = 'supplier' OR sl_dst.usage = 'customer' THEN -${qtyExpr}
          WHEN sl_src.usage = 'supplier' THEN ${qtyExpr}
          ELSE ${qtyExpr}
        END AS cantidad_auditada,
        ru.login AS usuario,
        ${this.getPedidoExpression()} AS pedido,
        rp.name AS cliente,
        ${this.getDocumentoExpression()} AS documento
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN stock_picking_type spt ON spt.id = sp.picking_type_id
      LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${lotJoin}
      LEFT JOIN res_users ru ON ru.id = COALESCE(sml.write_uid, sml.create_uid, sm.write_uid, sm.create_uid)
      LEFT JOIN res_partner rp ON rp.id = sp.partner_id
      WHERE ${filters.join(' AND ')} ${companyFilter}
      ORDER BY ${dateExpr} DESC
      LIMIT 400000
    `, params);

    const rows = result.rows.map(r => ({ ...r, cantidad: n(r.cantidad_auditada ?? r.cantidad), cantidad_original: n(r.cantidad) }));
    const entradas = rows.filter(r => r.involucra_proveedor).reduce((a, r) => a + Math.abs(r.cantidad), 0);
    const salidas = rows.filter(r => r.involucra_cliente).reduce((a, r) => a + Math.abs(r.cantidad), 0);
    return {
      provider: 'odoo',
      tipo: options.tipo || 'general',
      query,
      ...(options.extra || {}),
      resumen: {
        movimientos: rows.length,
        entradas,
        salidas,
        balance: entradas - salidas,
        alerta: rows.length ? 'Movimientos reales leidos desde Odoo' : 'No se encontraron movimientos'
      },
      analisis: buildAuditAnalysis(rows, query, options.tipo || 'general'),
      timeline: rows
    };
  }


  async getPreventiveAlerts(config = {}) {
    this.ensureReady();
    const alerts = [];
    const adjustmentThreshold = Number(config.ajusteUmbral || 50);
    const diasDetenido = Number(config.diasDetenido || 30);
    const diasCircuito = Number(config.diasCircuito || 7);
    const dateExpr = await this.getDateExpression();
    const qtyExpr = await this.getQtyExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const pickingTypeNameExpr = await this.getPickingTypeNameExpression('spt');
    const lotTable = await this.getLotTableName();
    const hasLotId = await this.hasColumn('stock_move_line', 'lot_id');
    const lotJoin = lotTable && hasLotId ? `LEFT JOIN ${lotTable} spl ON spl.id = sml.lot_id` : '';
    const lotSelect = lotTable && hasLotId ? 'spl.name AS lote' : 'NULL::text AS lote';

    const baseJoins = `
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN stock_picking_type spt ON spt.id = sp.picking_type_id
      LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${lotJoin}
      LEFT JOIN res_users ru ON ru.id = COALESCE(sml.write_uid, sml.create_uid, sm.write_uid, sm.create_uid)
    `;
    const companyCandidates = [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }];

    // REG-001: ajustes grandes.
    const ajusteParams = [adjustmentThreshold];
    const ajusteCompanyFilter = await this.buildCompanyFilter(ajusteParams, config.companyId, companyCandidates);
    const ajustes = await this.pool.query(`
      SELECT sml.id, ${dateExpr} AS fecha, pp.default_code AS sku, ${productNameExpr} AS producto,
             sl_src.complete_name AS origen, sl_dst.complete_name AS destino, ${lotSelect}, ${qtyExpr} AS cantidad,
             COALESCE(sp.name::text, sm.reference::text, sm.origin::text) AS documento, ru.login AS usuario
      ${baseJoins}
      WHERE (sl_src.usage = 'inventory' OR sl_dst.usage = 'inventory' OR sl_src.complete_name ILIKE '%Inventory adjustment%' OR sl_dst.complete_name ILIKE '%Inventory adjustment%')
        AND ABS(${qtyExpr}) >= $1 ${ajusteCompanyFilter}
      ORDER BY ${dateExpr} DESC
      LIMIT 150
    `, ajusteParams);
    for (const r of ajustes.rows) {
      const salida = String(r.origen || '').toLowerCase().includes('inventory adjustment') || String(r.origen || '').toLowerCase().includes('virtual locations');
      alerts.push({
        regla_codigo: 'REG-001',
        tipo: 'Ajuste grande',
        prioridad: Math.abs(Number(r.cantidad || 0)) >= adjustmentThreshold * 3 ? 'Critica' : 'Alta',
        sku: r.sku,
        producto: r.producto,
        ubicacion: salida ? r.destino : r.origen,
        lote: r.lote,
        cantidad: Math.abs(Number(r.cantidad || 0)),
        motivo: `Ajuste por ${Math.abs(Number(r.cantidad || 0))} unidades supera el umbral ${adjustmentThreshold}.`,
        detalle: `${r.fecha} | ${r.origen || '-'} -> ${r.destino || '-'} | ${r.documento || 'sin documento'} | usuario ${r.usuario || '-'}`,
        firma: `REG-001|${r.id}`,
        documento: r.documento
      });
    }

    // REG-002: movimientos en AUDITORIA.
    const auditoriaParams = [];
    const auditoriaCompanyFilter = await this.buildCompanyFilter(auditoriaParams, config.companyId, companyCandidates);
    const auditoria = await this.pool.query(`
      SELECT sml.id, ${dateExpr} AS fecha, pp.default_code AS sku, ${productNameExpr} AS producto,
             sl_src.complete_name AS origen, sl_dst.complete_name AS destino, ${lotSelect}, ${qtyExpr} AS cantidad,
             COALESCE(sp.name::text, sm.reference::text, sm.origin::text) AS documento, ru.login AS usuario
      ${baseJoins}
      WHERE (sl_src.complete_name ILIKE '%AUDITORIA%' OR sl_dst.complete_name ILIKE '%AUDITORIA%') ${auditoriaCompanyFilter}
      ORDER BY ${dateExpr} DESC
      LIMIT 150
    `, auditoriaParams);
    for (const r of auditoria.rows) {
      alerts.push({
        regla_codigo: 'REG-002',
        tipo: 'Movimiento en AUDITORIA',
        prioridad: 'Alta',
        sku: r.sku,
        producto: r.producto,
        ubicacion: String(r.destino || '').toUpperCase().includes('AUDITORIA') ? r.destino : r.origen,
        lote: r.lote,
        cantidad: Math.abs(Number(r.cantidad || 0)),
        motivo: 'Movimiento detectado en ubicación marcada como AUDITORIA.',
        detalle: `${r.fecha} | ${r.origen || '-'} -> ${r.destino || '-'} | ${r.documento || 'sin documento'} | usuario ${r.usuario || '-'}`,
        firma: `REG-002|${r.id}`,
        documento: r.documento
      });
    }

    // REG-003: mercaderia detenida usando stock_quant cuando existe.
    if (await this.hasTable('stock_quant')) {
      const quantQty = (await this.hasColumn('stock_quant', 'quantity')) ? 'sq.quantity' : '0';
      const stockParams = [diasDetenido];
      const stockCompanyFilter = await this.buildCompanyFilter(stockParams, config.companyId, [{ table: 'stock_quant', alias: 'sq' }]);
      const stockDetenido = await this.pool.query(`
        WITH ult AS (
          SELECT product_id, location_id, MAX(COALESCE(date, create_date)) AS ultimo_mov
          FROM stock_move_line
          GROUP BY product_id, location_id
        )
        SELECT sq.id, pp.default_code AS sku, ${productNameExpr} AS producto, sl.complete_name AS ubicacion,
               ${quantQty} AS cantidad, ult.ultimo_mov
        FROM stock_quant sq
        LEFT JOIN product_product pp ON pp.id = sq.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        LEFT JOIN stock_location sl ON sl.id = sq.location_id
        LEFT JOIN ult ON ult.product_id = sq.product_id AND ult.location_id = sq.location_id
        WHERE ${quantQty} > 0
          AND (sl.complete_name ILIKE '%CONTROL%' OR sl.complete_name ILIKE '%REMISION%' OR sl.complete_name ILIKE '%MUELLE%' OR sl.complete_name ILIKE '%SALIDA-M%' OR sl.complete_name ILIKE '%SALIDA-D%')
          AND (ult.ultimo_mov IS NULL OR ult.ultimo_mov < NOW() - ($1::int || ' days')::interval) ${stockCompanyFilter}
        ORDER BY ${quantQty} DESC
        LIMIT 150
      `, stockParams);
      for (const r of stockDetenido.rows) {
        alerts.push({
          regla_codigo: 'REG-003',
          tipo: 'Mercaderia detenida',
          prioridad: Math.abs(Number(r.cantidad || 0)) >= 100 ? 'Alta' : 'Media',
          sku: r.sku,
          producto: r.producto,
          ubicacion: r.ubicacion,
          cantidad: Math.abs(Number(r.cantidad || 0)),
          motivo: `Stock en ubicación intermedia sin movimiento por más de ${diasDetenido} días.`,
          detalle: `Ultimo movimiento: ${r.ultimo_mov || 'sin registro'} | cantidad actual: ${r.cantidad}`,
          firma: `REG-003|${r.sku || ''}|${r.ubicacion || ''}`
        });
      }
    }

    // REG-004: circuito incompleto heuristico.
    const circuitoParams = [diasCircuito];
    const circuitoCompanyFilter = await this.buildCompanyFilter(circuitoParams, config.companyId, companyCandidates);
    const circuito = await this.pool.query(`
      SELECT sml.id, ${dateExpr} AS fecha, pp.default_code AS sku, ${productNameExpr} AS producto,
             sl_src.complete_name AS origen, sl_dst.complete_name AS destino, ${lotSelect}, ${qtyExpr} AS cantidad,
             COALESCE(sp.name::text, sm.reference::text, sm.origin::text) AS documento, ru.login AS usuario
      ${baseJoins}
      WHERE (sl_dst.complete_name ILIKE '%CONTROL%' OR sl_dst.complete_name ILIKE '%REMISION%' OR sl_dst.complete_name ILIKE '%MUELLE%' OR sl_dst.complete_name ILIKE '%SALIDA-M%' OR sl_dst.complete_name ILIKE '%SALIDA-D%')
        AND ${dateExpr} < NOW() - ($1::int || ' days')::interval ${circuitoCompanyFilter}
        AND NOT EXISTS (
          SELECT 1 FROM stock_move_line sml2
          LEFT JOIN stock_location dst2 ON dst2.id = sml2.location_dest_id
          WHERE sml2.product_id = sml.product_id
            AND COALESCE(sml2.date, sml2.create_date) > ${dateExpr}
            AND (dst2.usage = 'customer' OR dst2.complete_name ILIKE '%Partners/Customers%')
          LIMIT 1
        )
      ORDER BY ${dateExpr} DESC
      LIMIT 150
    `, circuitoParams);
    for (const r of circuito.rows) {
      alerts.push({
        regla_codigo: 'REG-004',
        tipo: 'Circuito incompleto',
        prioridad: 'Alta',
        sku: r.sku,
        producto: r.producto,
        ubicacion: r.destino,
        lote: r.lote,
        cantidad: Math.abs(Number(r.cantidad || 0)),
        motivo: `Movimiento a ubicación intermedia sin salida posterior a cliente luego de ${diasCircuito} días.`,
        detalle: `${r.fecha} | ${r.origen || '-'} -> ${r.destino || '-'} | ${r.documento || 'sin documento'} | usuario ${r.usuario || '-'}`,
        firma: `REG-004|${r.id}`,
        documento: r.documento
      });
    }

    // REG-005: barrido ABC: prioriza SKU cargados y usa el motor de investigación existente.
    for (const sku of config.skuAbc || []) {
      try {
        const result = await this.getProductInvestigation(sku.sku, { companyId: config.companyId });
        const analysis = result.analisis;
        const impacto = Number(analysis?.kpis?.posible_diferencia || 0);
        const ajustesPos = Number(analysis?.kpis?.ajustes_positivos || 0);
        const ajustesNeg = Number(analysis?.kpis?.ajustes_negativos || 0);
        if (impacto > 0 || ajustesPos >= adjustmentThreshold || ajustesNeg >= adjustmentThreshold) {
          alerts.push({
            regla_codigo: 'REG-005',
            tipo: 'SKU ABC en riesgo',
            prioridad: sku.clase === 'A' ? 'Alta' : sku.clase === 'B' ? 'Media' : 'Baja',
            sku: sku.sku,
            producto: result.productos?.[0]?.producto || sku.producto || '',
            cantidad: impacto || Math.max(ajustesPos, ajustesNeg),
            motivo: `SKU clase ${sku.clase} con señales de riesgo: impacto ${impacto}, ajustes +${ajustesPos}, ajustes -${ajustesNeg}.`,
            detalle: analysis?.conclusion || 'Revisar movimientos y desglose del SKU.',
            firma: `REG-005|${sku.sku}`
          });
        }
      } catch (_) {
        // Un SKU con error no debe interrumpir todo el barrido preventivo.
      }
    }

    try {
      const crossAlerts = await this.getCrossDimensionRisks(config);
      alerts.push(...crossAlerts);
    } catch (_) {
      // Los cruces preventivos no deben interrumpir el barrido principal.
    }

    return alerts;
  }


  async advancedSearch(filters = {}, options = {}) {
    this.ensureReady();
    const qtyExpr = await this.getQtyExpression();
    const dateExpr = await this.getDateExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const pickingTypeNameExpr = await this.getPickingTypeNameExpression('spt');
    const lotTable = await this.getLotTableName();
    const hasLotId = await this.hasColumn('stock_move_line', 'lot_id');
    const lotJoin = lotTable && hasLotId ? `LEFT JOIN ${lotTable} spl ON spl.id = sml.lot_id` : '';
    const lotSelect = lotTable && hasLotId ? 'spl.name AS lote' : 'NULL::text AS lote';

    const params = [];
    const where = [];
    const addLike = (value, columns) => {
      if (!value) return;
      params.push(`%${value}%`);
      const p = `$${params.length}`;
      where.push(`(${columns.map(c => `${c} ILIKE ${p}`).join(' OR ')})`);
    };

    addLike(filters.q, [`pp.default_code`, productNameExpr, `sl_src.complete_name`, `sl_dst.complete_name`, lotTable && hasLotId ? `spl.name` : `''`, `sp.name`, `COALESCE(sm.reference::text, '')`, `COALESCE(sm.origin::text, '')`, `COALESCE(sp.origin::text, '')`, `COALESCE(rp.name, '')`]);
    addLike(filters.pedido, [`COALESCE(sp.origin::text, '')`, `COALESCE(sm.origin::text, '')`, `COALESCE(sp.name::text, '')`, `COALESCE(sm.reference::text, '')`]);
    addLike(filters.ubicacion, [`sl_src.complete_name`, `sl_dst.complete_name`]);
    addLike(filters.sku, [`pp.default_code`, productNameExpr]);
    addLike(filters.lote, [lotTable && hasLotId ? `spl.name` : `''`]);
    addLike(filters.usuario, [`COALESCE(ru.login, '')`]);

    if (filters.fechaDesde) {
      params.push(filters.fechaDesde);
      where.push(`${dateExpr} >= $${params.length}::timestamp`);
    }
    if (filters.fechaHasta) {
      params.push(filters.fechaHasta);
      where.push(`${dateExpr} < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const tipoMov = String(filters.tipoMovimiento || '').toLowerCase();
    if (tipoMov && tipoMov !== 'todos') {
      if (tipoMov === 'ajuste') {
        where.push(`(sl_src.usage = 'inventory' OR sl_dst.usage = 'inventory' OR sl_src.complete_name ILIKE '%Inventory adjustment%' OR sl_dst.complete_name ILIKE '%Inventory adjustment%')`);
      } else if (tipoMov === 'venta') {
        where.push(`(sl_dst.usage = 'customer' OR sl_dst.complete_name ILIKE '%Partners/Customers%')`);
      } else if (tipoMov === 'recepcion') {
        where.push(`(sl_src.usage = 'supplier' OR sl_src.complete_name ILIKE '%Partners/Vendors%' OR sl_dst.complete_name ILIKE '%RECEPCION%')`);
      } else if (tipoMov === 'transferencia') {
        where.push(`(sl_src.usage = 'internal' AND sl_dst.usage = 'internal')`);
      } else if (tipoMov === 'auditoria') {
        where.push(`(sl_src.complete_name ILIKE '%AUDITORIA%' OR sl_dst.complete_name ILIKE '%AUDITORIA%')`);
      }
    }

    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);
    const baseWhere = where.length ? where.join(' AND ') : '1=1';

    const result = await this.pool.query(`
      SELECT
        sml.id,
        ${dateExpr} AS fecha,
        COALESCE(${pickingTypeNameExpr}, sm.reference::text, sm.origin::text, 'Movimiento') AS tipo,
        sl_src.complete_name AS origen,
        sl_dst.complete_name AS destino,
        sl_src.usage AS origen_usage,
        sl_dst.usage AS destino_usage,
        pp.default_code AS sku,
        ${productNameExpr} AS producto,
        ${lotSelect},
        ${qtyExpr} AS cantidad_original,
        CASE WHEN sl_src.usage = 'customer' OR sl_dst.usage = 'customer' THEN true ELSE false END AS involucra_cliente,
        CASE WHEN sl_src.usage = 'supplier' OR sl_dst.usage = 'supplier' THEN true ELSE false END AS involucra_proveedor,
        CASE
          WHEN sl_src.usage = 'inventory' OR sl_dst.usage = 'inventory' OR sl_src.complete_name ILIKE '%Inventory adjustment%' OR sl_dst.complete_name ILIKE '%Inventory adjustment%' THEN true
          ELSE false
        END AS es_ajuste,
        ru.login AS usuario,
        ${this.getPedidoExpression()} AS pedido,
        rp.name AS cliente,
        ${this.getDocumentoExpression()} AS documento
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN stock_picking_type spt ON spt.id = sp.picking_type_id
      LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${lotJoin}
      LEFT JOIN res_users ru ON ru.id = COALESCE(sml.write_uid, sml.create_uid, sm.write_uid, sm.create_uid)
      LEFT JOIN res_partner rp ON rp.id = sp.partner_id
      WHERE ${baseWhere} ${companyFilter}
      ORDER BY ${dateExpr} DESC
      LIMIT 400000
    `, params);

    const loc = String(filters.ubicacion || '').toLowerCase();
    const rows = result.rows.map(r => {
      const absQty = Math.abs(n(r.cantidad_original));
      let cantidad = n(r.cantidad_original);
      if (loc) {
        const origenMatch = String(r.origen || '').toLowerCase().includes(loc);
        const destinoMatch = String(r.destino || '').toLowerCase().includes(loc);
        if (destinoMatch && !origenMatch) cantidad = absQty;
        else if (origenMatch && !destinoMatch) cantidad = -absQty;
        else cantidad = 0;
      } else if (r.destino_usage === 'supplier' || r.destino_usage === 'customer') cantidad = -absQty;
      else if (r.origen_usage === 'supplier') cantidad = absQty;
      else cantidad = n(r.cantidad_original);
      return { ...r, cantidad, cantidad_abs: absQty };
    });

    const entradas = loc
      ? rows.filter(r => r.cantidad > 0).reduce((a, r) => a + Math.abs(r.cantidad), 0)
      : rows.filter(r => r.involucra_proveedor || r.cantidad > 0).reduce((a, r) => a + Math.abs(r.cantidad), 0);
    const salidas = loc
      ? rows.filter(r => r.cantidad < 0).reduce((a, r) => a + Math.abs(r.cantidad), 0)
      : rows.filter(r => r.involucra_cliente || r.cantidad < 0).reduce((a, r) => a + Math.abs(r.cantidad), 0);
    const balance = rows.reduce((a, r) => a + n(r.cantidad), 0);
    const tipo = loc ? 'investigacion avanzada / ubicacion' : 'investigacion avanzada';
    const query = [filters.pedido && `Pedido ${filters.pedido}`, filters.ubicacion && `Ubicación ${filters.ubicacion}`, filters.sku && `SKU ${filters.sku}`, filters.lote && `Lote ${filters.lote}`, filters.q && `Texto ${filters.q}`].filter(Boolean).join(' | ') || 'Investigación avanzada';

    return {
      provider: 'odoo',
      tipo,
      query,
      filtros_aplicados: filters,
      resumen: {
        movimientos: rows.length,
        entradas,
        salidas,
        balance,
        alerta: rows.length ? 'Movimientos filtrados desde Odoo' : 'No se encontraron movimientos con los filtros aplicados'
      },
      analisis: buildAuditAnalysis(rows, query, tipo),
      timeline: rows
    };
  }




  async getIncompleteLogisticTasks(options = {}) {
    this.ensureReady();
    const rows = await this.getLogisticMovementsForAnalysis(options);
    const dias = Number(options.dias || 15);
    const limit = Math.min(Number(options.limit || 500), 2000);
    const groups = new Map();

    for (const r of rows) {
      const key = `${r.pedido || 'SIN-PEDIDO'}|${r.sku || 'SIN-SKU'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          pedido: r.pedido || 'SIN-PEDIDO', cliente: r.cliente || '-', sku: r.sku || '-', producto: r.producto || '-',
          documentos: new Set(), ubicaciones: new Set(), cantidad_intermedia: 0, cantidad_out: 0, fecha_fin: null
        });
      }
      const g = groups.get(key);
      if (r.documento) g.documentos.add(r.documento);
      const dest = String(r.destino || '').toUpperCase();
      const doc = String(r.documento || '').toUpperCase();
      const qty = Math.abs(n(r.cantidad));
      const esMuelle = dest.includes('MUELLE') || dest.includes('SALIDA-M') || dest.includes('SALIDA-D') || dest.includes('DARSENA') || dest.includes('DÁRSENA');
      const esOut = r.destino_usage === 'customer' || dest.includes('PARTNERS/CUSTOMERS') || doc.includes('/OUT/') || doc.endsWith('/OUT') || doc.includes('OUT');
      if (esMuelle) {
        g.cantidad_intermedia += qty;
        if (r.destino) g.ubicaciones.add(r.destino);
      }
      if (esOut) g.cantidad_out += qty;
      if (!g.fecha_fin || new Date(r.fecha) > new Date(g.fecha_fin)) g.fecha_fin = r.fecha;
    }

    const now = Date.now();
    return [...groups.values()].map(g => {
      const cantidad = Math.max(g.cantidad_intermedia - g.cantidad_out, 0);
      const dias_pendiente = g.fecha_fin ? Math.floor((now - new Date(g.fecha_fin).getTime()) / 86400000) : 0;
      return {
        pedido: g.pedido, cliente: g.cliente, documento: [...g.documentos].join(' | '), sku: g.sku, producto: g.producto,
        ubicacion: [...g.ubicaciones].join(' | ') || '-', fecha: g.fecha_fin, cantidad,
        cantidad_intermedia: g.cantidad_intermedia, cantidad_out: g.cantidad_out,
        dias_pendiente, tipo: 'Mercadería detenida'
      };
    }).filter(r => r.cantidad > 0 && r.dias_pendiente >= dias)
      .sort((a,b) => (b.dias_pendiente - a.dias_pendiente) || (b.cantidad - a.cantidad))
      .slice(0, limit);
  }

  async getPickOutDifferences(options = {}) {
    this.ensureReady();
    const rows = await this.getLogisticMovementsForAnalysis(options);
    const limit = Math.min(Number(options.limit || 500), 2000);
    const groups = new Map();

    for (const r of rows) {
      const key = `${r.pedido || 'SIN-PEDIDO'}|${r.sku || 'SIN-SKU'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          pedido: r.pedido || 'SIN-PEDIDO', cliente: r.cliente || '-', sku: r.sku || '-', producto: r.producto || '-',
          documentos: new Set(), cantidad_pick: 0, cantidad_reapro: 0, cantidad_pack: 0, cantidad_out: 0, fecha_fin: null
        });
      }
      const g = groups.get(key);
      if (r.documento) g.documentos.add(r.documento);
      const doc = String(r.documento || '').toUpperCase();
      const dest = String(r.destino || '').toUpperCase();
      const qty = Math.abs(n(r.cantidad));
      const esOut = r.destino_usage === 'customer' || dest.includes('PARTNERS/CUSTOMERS') || doc.includes('/OUT/') || doc.endsWith('/OUT') || doc.includes('OUT');
      const esReapro = doc.includes('REAPRO') || doc.includes('REAP');
      const esPack = doc.includes('PACK');
      const esPick = doc.includes('PICK') && !esReapro && !esPack && !esOut;
      if (esOut) g.cantidad_out += qty;
      else if (esReapro) g.cantidad_reapro += qty;
      else if (esPack) g.cantidad_pack += qty;
      else if (esPick) g.cantidad_pick += qty;
      if (!g.fecha_fin || new Date(r.fecha) > new Date(g.fecha_fin)) g.fecha_fin = r.fecha;
    }

    return [...groups.values()].map(g => {
      const cantidad_control = Math.max(g.cantidad_pick, g.cantidad_reapro, g.cantidad_pack);
      const diferencia = cantidad_control - g.cantidad_out;
      const dias_pendiente = g.fecha_fin ? Math.floor((Date.now() - new Date(g.fecha_fin).getTime()) / 86400000) : 0;
      return {
        pedido: g.pedido, cliente: g.cliente, documento: [...g.documentos].join(' | '), sku: g.sku, producto: g.producto,
        cantidad_pick: g.cantidad_pick, cantidad_reapro: g.cantidad_reapro, cantidad_pack: g.cantidad_pack,
        cantidad_control, cantidad_out: g.cantidad_out, diferencia, cantidad: diferencia,
        fecha_fin: g.fecha_fin, dias_pendiente
      };
    }).filter(r => r.cantidad_control > 0 && r.diferencia > 0)
      .sort((a,b) => (b.diferencia - a.diferencia) || new Date(b.fecha_fin || 0) - new Date(a.fecha_fin || 0))
      .slice(0, limit);
  }

  async getLogisticMovementsForAnalysis(options = {}) {
    const qtyExpr = await this.getQtyExpression();
    const dateExpr = await this.getDateExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const hasSale = await this.hasTable('sale_order_line') && await this.hasTable('sale_order') && await this.hasColumn('stock_move', 'sale_line_id');
    const saleJoin = hasSale ? `
      LEFT JOIN sale_order_line sol ON sol.id = sm.sale_line_id
      LEFT JOIN sale_order so ON so.id = sol.order_id
      LEFT JOIN res_partner rpso ON rpso.id = so.partner_id
      LEFT JOIN res_partner rpsop ON rpsop.id = rpso.parent_id
    ` : '';
    const pedidoExpr = hasSale ? `COALESCE(NULLIF(so.name::text, ''), ${this.getPedidoExpression()})` : this.getPedidoExpression();
    const clienteExpr = hasSale
      ? `COALESCE(NULLIF(rpsop.name::text, ''), NULLIF(rpso.name::text, ''), NULLIF(rpp.name::text, ''), NULLIF(rp.name::text, ''), '-')`
      : `COALESCE(NULLIF(rpp.name::text, ''), NULLIF(rp.name::text, ''), '-')`;
    const documentoExpr = this.getDocumentoExpression();
    const params = [];
    const where = [];
    if (options.fechaDesde) { params.push(options.fechaDesde); where.push(`${dateExpr} >= $${params.length}::timestamp`); }
    else where.push(`${dateExpr} >= NOW() - INTERVAL '30 days'`);
    if (options.fechaHasta) { params.push(options.fechaHasta); where.push(`${dateExpr} < ($${params.length}::date + INTERVAL '1 day')`); }
    if (options.sku) { params.push(`%${options.sku}%`); where.push(`(pp.default_code ILIKE $${params.length} OR ${productNameExpr} ILIKE $${params.length})`); }
    if (options.ubicacion) { params.push(`%${options.ubicacion}%`); where.push(`(sl_src.complete_name ILIKE $${params.length} OR sl_dst.complete_name ILIKE $${params.length})`); }
    if (options.pedido) { params.push(`%${options.pedido}%`); where.push(`(${pedidoExpr} ILIKE $${params.length} OR ${documentoExpr} ILIKE $${params.length})`); }
    if (options.q) { params.push(`%${options.q}%`); where.push(`(pp.default_code ILIKE $${params.length} OR ${productNameExpr} ILIKE $${params.length} OR ${documentoExpr} ILIKE $${params.length} OR ${pedidoExpr} ILIKE $${params.length} OR ${clienteExpr} ILIKE $${params.length})`); }
    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);
    params.push(Math.min(Math.max(Number(options.limit || 500) * 40, 5000), 50000));

    const result = await this.pool.query(`
      SELECT
        ${pedidoExpr} AS pedido,
        ${documentoExpr} AS documento,
        ${clienteExpr} AS cliente,
        pp.default_code AS sku,
        ${productNameExpr} AS producto,
        ${dateExpr} AS fecha,
        ABS(${qtyExpr}) AS cantidad,
        sl_src.complete_name AS origen,
        sl_dst.complete_name AS destino,
        sl_dst.usage AS destino_usage
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN res_partner rp ON rp.id = sp.partner_id
      LEFT JOIN res_partner rpp ON rpp.id = rp.parent_id
      ${saleJoin}
      LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      WHERE ${where.join(' AND ')} ${companyFilter}
        AND (
          ${documentoExpr} ILIKE '%PICK%' OR ${documentoExpr} ILIKE '%PACK%' OR ${documentoExpr} ILIKE '%REAPRO%' OR ${documentoExpr} ILIKE '%REAP%' OR ${documentoExpr} ILIKE '%OUT%'
          OR sl_dst.usage = 'customer'
          OR sl_dst.complete_name ILIKE '%MUELLE%' OR sl_dst.complete_name ILIKE '%SALIDA-M%' OR sl_dst.complete_name ILIKE '%SALIDA-D%' OR sl_dst.complete_name ILIKE '%DARSENA%' OR sl_dst.complete_name ILIKE '%DÁRSENA%'
        )
      ORDER BY ${dateExpr} DESC
      LIMIT $${params.length}
    `, params);
    return result.rows;
  }

  async getCrossDimensionRisks(config = {}) {
    this.ensureReady();
    const alerts = [];
    const dateExpr = await this.getDateExpression();
    const productNameExpr = await this.getProductNameExpression('pt');
    const qtyExpr = await this.getQtyExpression();
    const params = [];
    const companyFilter = await this.buildCompanyFilter(params, config.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);

    const multiSku = await this.pool.query(`
      SELECT sl_dst.complete_name AS ubicacion,
             COUNT(DISTINCT pp.default_code) AS skus_distintos,
             COUNT(*) AS movimientos,
             MAX(${dateExpr}) AS ultima_fecha
      FROM stock_move_line sml
      LEFT JOIN stock_move sm ON sm.id = sml.move_id
      LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
      LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
      LEFT JOIN product_product pp ON pp.id = sml.product_id
      WHERE ${dateExpr} >= NOW() - INTERVAL '180 days'
        AND sl_dst.usage = 'internal'
        AND sl_dst.complete_name IS NOT NULL ${companyFilter}
      GROUP BY sl_dst.complete_name
      HAVING COUNT(DISTINCT pp.default_code) >= 8
      ORDER BY skus_distintos DESC, movimientos DESC
      LIMIT 80
    `, params);
    for (const r of multiSku.rows) {
      alerts.push({
        regla_codigo: 'REG-006', tipo: 'Ubicación con alta variación de SKU', prioridad: Number(r.skus_distintos) >= 20 ? 'Alta' : 'Media',
        ubicacion: r.ubicacion, cantidad: Number(r.skus_distintos || 0),
        motivo: `La ubicación tuvo ${r.skus_distintos} SKU distintos en los últimos 180 días.`,
        detalle: `Movimientos: ${r.movimientos}. Último movimiento: ${r.ultima_fecha}. Recomendado investigar por ubicación + SKU/lote.`,
        firma: `REG-006|${config.companyId || 'all'}|${r.ubicacion}`
      });
    }

    for (const sku of config.skuAbc || []) {
      const p = [`%${sku.sku}%`];
      const cf = await this.buildCompanyFilter(p, config.companyId, [{ table: 'stock_move_line', alias: 'sml' }, { table: 'stock_move', alias: 'sm' }, { table: 'stock_picking', alias: 'sp' }]);
      const disperse = await this.pool.query(`
        SELECT pp.default_code AS sku, ${productNameExpr} AS producto,
               COUNT(DISTINCT COALESCE(sl_src.complete_name, '') || '|' || COALESCE(sl_dst.complete_name, '')) AS rutas,
               COUNT(DISTINCT CASE WHEN sl_src.usage='internal' THEN sl_src.complete_name END) + COUNT(DISTINCT CASE WHEN sl_dst.usage='internal' THEN sl_dst.complete_name END) AS ubicaciones,
               SUM(ABS(${qtyExpr})) AS cantidad,
               MAX(${dateExpr}) AS ultima_fecha
        FROM stock_move_line sml
        LEFT JOIN stock_move sm ON sm.id = sml.move_id
        LEFT JOIN stock_picking sp ON sp.id = sml.picking_id
        LEFT JOIN stock_location sl_src ON sl_src.id = sml.location_id
        LEFT JOIN stock_location sl_dst ON sl_dst.id = sml.location_dest_id
        LEFT JOIN product_product pp ON pp.id = sml.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        WHERE ${dateExpr} >= NOW() - INTERVAL '180 days'
          AND (pp.default_code ILIKE $1 OR ${productNameExpr} ILIKE $1) ${cf}
        GROUP BY pp.default_code, ${productNameExpr}
        HAVING COUNT(DISTINCT CASE WHEN sl_src.usage='internal' THEN sl_src.complete_name END) + COUNT(DISTINCT CASE WHEN sl_dst.usage='internal' THEN sl_dst.complete_name END) >= 6
        LIMIT 20
      `, p);
      for (const r of disperse.rows) {
        alerts.push({
          regla_codigo: 'REG-007', tipo: 'SKU ABC con alta dispersión', prioridad: sku.clase === 'A' ? 'Alta' : 'Media',
          sku: r.sku || sku.sku, producto: r.producto || sku.producto || '', cantidad: Number(r.ubicaciones || 0),
          motivo: `SKU clase ${sku.clase} pasó por ${r.ubicaciones} ubicaciones internas en 180 días.`,
          detalle: `Rutas distintas: ${r.rutas}. Cantidad movilizada: ${Number(r.cantidad || 0)}. Último movimiento: ${r.ultima_fecha}.`,
          firma: `REG-007|${config.companyId || 'all'}|${sku.sku}`
        });
      }
    }
    return alerts;
  }


  async getUbicacionesModulo(options = {}) {
    this.ensureReady();
    const q = options.q || options.ubicacion || '';
    const limit = Math.min(Number(options.limit || 100), 500);
    const locations = await this.getLocations(limit, q, { companyId: options.companyId });
    const ids = locations.map(l => l.id);
    if (!ids.length) return { rows: [], resumen: { ubicaciones: 0, stock_total: 0, skus: 0 } };
    const productNameExpr = await this.getProductNameExpression('pt');
    const params = [ids];
    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_quant', alias: 'sq' }]);
    const hasQuant = await this.hasTable('stock_quant');
    let stockRows = [];
    if (hasQuant) {
      const res = await this.pool.query(`
        SELECT sl.id, sl.complete_name AS ubicacion, sl.usage,
               COALESCE(SUM(sq.quantity),0) AS stock_actual,
               COUNT(DISTINCT pp.default_code) AS skus,
               MAX(sq.write_date) AS ultima_actualizacion,
               STRING_AGG(DISTINCT pp.default_code, ', ' ORDER BY pp.default_code) FILTER (WHERE pp.default_code IS NOT NULL) AS ejemplos_sku
        FROM stock_location sl
        LEFT JOIN stock_quant sq ON sq.location_id = sl.id
        LEFT JOIN product_product pp ON pp.id = sq.product_id
        LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
        WHERE sl.id = ANY($1::int[]) ${companyFilter}
        GROUP BY sl.id, sl.complete_name, sl.usage
        ORDER BY sl.complete_name
      `, params);
      stockRows = res.rows;
    }
    const map = new Map(stockRows.map(r => [Number(r.id), r]));
    const rows = locations.map(l => {
      const r = map.get(Number(l.id)) || {};
      const stock = n(r.stock_actual);
      return {
        id: l.id,
        ubicacion: l.complete_name || l.name,
        tipo: l.usage || r.usage || '',
        stock_actual: stock,
        skus: Number(r.skus || 0),
        ultima_actualizacion: r.ultima_actualizacion || null,
        ejemplos_sku: r.ejemplos_sku || '',
        estado_auditoria: String(l.complete_name || '').toUpperCase().includes('AUDITORIA') ? 'Ubicación en auditoría' : stock > 0 ? 'Con stock' : 'Sin stock'
      };
    });
    return {
      rows,
      resumen: {
        ubicaciones: rows.length,
        stock_total: rows.reduce((a,r)=>a+n(r.stock_actual),0),
        skus: rows.reduce((a,r)=>a+Number(r.skus||0),0),
        auditoria: rows.filter(r => r.estado_auditoria === 'Ubicación en auditoría').length
      }
    };
  }

  async getProductosModulo(options = {}) {
    this.ensureReady();
    const q = options.q || options.sku || '';
    const limit = Math.min(Number(options.limit || 100), 500);
    const products = await this.getProducts(limit, q, { companyId: options.companyId });
    const ids = products.map(p => p.id);
    if (!ids.length) return { rows: [], resumen: { productos: 0, stock_total: 0, ubicaciones: 0 } };
    const params = [ids];
    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: 'stock_quant', alias: 'sq' }]);
    const res = await this.pool.query(`
      SELECT pp.id, pp.default_code AS sku,
             COALESCE(SUM(sq.quantity),0) AS stock_actual,
             COUNT(DISTINCT sq.location_id) FILTER (WHERE COALESCE(sq.quantity,0) <> 0) AS ubicaciones_con_stock,
             MAX(sq.write_date) AS ultima_actualizacion,
             STRING_AGG(DISTINCT sl.complete_name, ' | ' ORDER BY sl.complete_name) FILTER (WHERE COALESCE(sq.quantity,0) <> 0) AS ubicaciones
      FROM product_product pp
      LEFT JOIN stock_quant sq ON sq.product_id = pp.id
      LEFT JOIN stock_location sl ON sl.id = sq.location_id
      WHERE pp.id = ANY($1::int[]) ${companyFilter}
      GROUP BY pp.id, pp.default_code
    `, params);
    const map = new Map(res.rows.map(r => [Number(r.id), r]));
    const rows = products.map(p => {
      const r = map.get(Number(p.id)) || {};
      return {
        id: p.id,
        sku: p.sku || p.default_code || '',
        producto: p.producto || '',
        stock_actual: n(r.stock_actual),
        ubicaciones_con_stock: Number(r.ubicaciones_con_stock || 0),
        ubicaciones: r.ubicaciones || '',
        ultima_actualizacion: r.ultima_actualizacion || null,
        estado_auditoria: Number(r.ubicaciones_con_stock || 0) >= 6 ? 'Alta dispersión' : n(r.stock_actual) > 0 ? 'Con stock' : 'Sin stock'
      };
    });
    return {
      rows,
      resumen: {
        productos: rows.length,
        stock_total: rows.reduce((a,r)=>a+n(r.stock_actual),0),
        ubicaciones: rows.reduce((a,r)=>a+Number(r.ubicaciones_con_stock||0),0),
        alta_dispersion: rows.filter(r => r.estado_auditoria === 'Alta dispersión').length
      }
    };
  }

  async getLotesModulo(options = {}) {
    this.ensureReady();
    const lotTable = await this.getLotTableName();
    if (!lotTable) return { rows: [], resumen: { lotes: 0, stock_total: 0 } };
    const productNameExpr = await this.getProductNameExpression('pt');
    const hasQuantLot = await this.hasColumn('stock_quant', 'lot_id');
    const params = [];
    const where = [];
    if (options.q || options.lote) { params.push(`%${options.q || options.lote}%`); where.push(`l.name ILIKE $${params.length}`); }
    if (options.sku) { params.push(`%${options.sku}%`); where.push(`(pp.default_code ILIKE $${params.length} OR ${productNameExpr} ILIKE $${params.length})`); }
    const companyFilter = await this.buildCompanyFilter(params, options.companyId, [{ table: lotTable, alias: 'l' }, ...(hasQuantLot ? [{ table: 'stock_quant', alias: 'sq' }] : [])]);
    params.push(Math.min(Number(options.limit || 100), 500));
    const quantJoin = hasQuantLot ? 'LEFT JOIN stock_quant sq ON sq.lot_id = l.id LEFT JOIN stock_location sl ON sl.id = sq.location_id' : 'LEFT JOIN stock_quant sq ON false LEFT JOIN stock_location sl ON false';
    const res = await this.pool.query(`
      SELECT l.id, l.name AS lote, pp.default_code AS sku, ${productNameExpr} AS producto,
             COALESCE(SUM(sq.quantity),0) AS stock_actual,
             COUNT(DISTINCT sq.location_id) FILTER (WHERE COALESCE(sq.quantity,0) <> 0) AS ubicaciones_con_stock,
             STRING_AGG(DISTINCT sl.complete_name, ' | ' ORDER BY sl.complete_name) FILTER (WHERE COALESCE(sq.quantity,0) <> 0) AS ubicaciones,
             MAX(sq.write_date) AS ultima_actualizacion
      FROM ${lotTable} l
      LEFT JOIN product_product pp ON pp.id = l.product_id
      LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
      ${quantJoin}
      ${where.length ? 'WHERE ' + where.join(' AND ') : 'WHERE 1=1'} ${companyFilter}
      GROUP BY l.id, l.name, pp.default_code, ${productNameExpr}
      ORDER BY l.name DESC
      LIMIT $${params.length}
    `, params);
    const rows = res.rows.map(r => ({ ...r, stock_actual: n(r.stock_actual), ubicaciones_con_stock: Number(r.ubicaciones_con_stock || 0), estado_auditoria: n(r.stock_actual) > 0 ? 'Con stock' : 'Sin stock' }));
    return {
      rows,
      resumen: {
        lotes: rows.length,
        stock_total: rows.reduce((a,r)=>a+n(r.stock_actual),0),
        ubicaciones: rows.reduce((a,r)=>a+Number(r.ubicaciones_con_stock||0),0)
      }
    };
  }

  async search(query, tipo = 'auto', options = {}) {
    this.ensureReady();
    const q = String(query || '').trim();
    if (!q) throw new Error('Parametro de busqueda requerido');

    if (options.filtros && Object.values(options.filtros).some(Boolean)) return this.advancedSearch(options.filtros, options);

    if (tipo === 'ubicacion') return this.getLocationInvestigation(q, options);
    if (tipo === 'producto') return this.getProductInvestigation(q, options);
    if (tipo === 'lote') return this.getLotInvestigation(q, options);

    if (q.includes('/') || q.toUpperCase().startsWith('AUDITORIA') || q.includes('-')) {
      const byLocation = await this.getLocationInvestigation(q, options);
      if (byLocation.ubicaciones?.length) return byLocation;
    }

    const byLot = await this.getLotInvestigation(q, options);
    if (byLot.lotes?.length) return byLot;

    const byProduct = await this.getProductInvestigation(q, options);
    if (byProduct.productos?.length) return byProduct;

    return this.getMovementSearch(q, { tipo: 'general', companyId: options.companyId });
  }
}

