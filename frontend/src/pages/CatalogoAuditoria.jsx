import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Filter, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../services/api.js';
import { exportRowsToExcel } from '../utils/exportExcel.js';
import { useCompany } from '../context/CompanyContext.jsx';

function fmt(n) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n || 0)); }

const config = {
  ubicaciones: {
    title: 'Ubicaciones',
    subtitle: 'Análisis de ubicaciones, stock actual, dispersión de SKU y accesos rápidos a investigación.',
    endpoint: '/catalog/ubicaciones',
    mainFilter: 'ubicacion',
    mainPlaceholder: 'Ej: AUDITORIA/C0-164-01, MUELLE, SALIDA-M',
    exportName: 'ubicaciones-auditoria.xlsx',
    columns: ['ubicacion', 'tipo', 'stock_actual', 'skus', 'estado_auditoria', 'ultima_actualizacion'],
    labels: { ubicacion: 'Ubicación', tipo: 'Tipo', stock_actual: 'Stock', skus: 'SKU distintos', estado_auditoria: 'Estado', ultima_actualizacion: 'Última actualización' }
  },
  productos: {
    title: 'Productos',
    subtitle: 'Control de SKU, stock total, ubicaciones con stock y posibles señales de dispersión.',
    endpoint: '/catalog/productos',
    mainFilter: 'sku',
    mainPlaceholder: 'Ej: 1004742 o descripción del producto',
    exportName: 'productos-auditoria.xlsx',
    columns: ['sku', 'producto', 'stock_actual', 'ubicaciones_con_stock', 'estado_auditoria', 'ubicaciones'],
    labels: { sku: 'SKU', producto: 'Producto', stock_actual: 'Stock', ubicaciones_con_stock: 'Ubicaciones', estado_auditoria: 'Estado', ubicaciones: 'Detalle ubicaciones' }
  },
  lotes: {
    title: 'Lotes',
    subtitle: 'Trazabilidad por lote, SKU asociado, stock actual y ubicaciones donde se encuentra.',
    endpoint: '/catalog/lotes',
    mainFilter: 'lote',
    mainPlaceholder: 'Ej: P01080/09014',
    exportName: 'lotes-auditoria.xlsx',
    columns: ['lote', 'sku', 'producto', 'stock_actual', 'ubicaciones_con_stock', 'estado_auditoria', 'ubicaciones'],
    labels: { lote: 'Lote', sku: 'SKU', producto: 'Producto', stock_actual: 'Stock', ubicaciones_con_stock: 'Ubicaciones', estado_auditoria: 'Estado', ubicaciones: 'Detalle ubicaciones' }
  }
};

export default function CatalogoAuditoria({ type }) {
  const cfg = config[type];
  const { company } = useCompany();
  const [rows, setRows] = useState([]);
  const [resumen, setResumen] = useState({});
  const [filters, setFilters] = useState({ q: '', ubicacion: '', sku: '', lote: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => rows, [rows]);

  function update(name, value) { setFilters(prev => ({ ...prev, [name]: value })); }

  async function load(e) {
    e?.preventDefault();
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k,v]) => { if (String(v || '').trim()) params.set(k, String(v).trim()); });
      params.set('limit', '200');
      const data = await apiFetch(`${cfg.endpoint}?${params.toString()}`);
      setRows(data.rows || []);
      setResumen(data.resumen || {});
    } catch (err) {
      setError(err.message || 'No se pudo cargar la información');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [company?.id, type]);

  function investigar(row) {
    const base = new URLSearchParams();
    if (type === 'ubicaciones') base.set('ubicacion', row.ubicacion || '');
    if (type === 'productos') base.set('sku', row.sku || '');
    if (type === 'lotes') {
      base.set('lote', row.lote || '');
      if (row.sku) base.set('sku', row.sku);
    }
    window.dispatchEvent(new CustomEvent('sgi-open-investigacion', { detail: Object.fromEntries(base.entries()) }));
    alert('Usá Centro de Investigación con los datos sugeridos: ' + base.toString().replaceAll('&', ' | '));
  }

  return (
    <section className="page">
      <div className="section-title">
        <div><h3>{cfg.title}</h3><p>{cfg.subtitle}</p></div>
        <div className="row-actions">
          <button className="secondary" onClick={() => exportRowsToExcel(cfg.exportName, filtered, cfg.title)}><Download size={17}/> Exportar</button>
          <button onClick={load} disabled={loading}><RefreshCw size={17}/> {loading ? 'Actualizando...' : 'Actualizar'}</button>
        </div>
      </div>

      <form className="advanced-investigation-panel" onSubmit={load}>
        <div className="advanced-title-row"><div><Filter size={20}/><b>Filtros de análisis</b></div></div>
        <div className="advanced-grid">
          <label>{cfg.labels[cfg.mainFilter] || 'Filtro'}<input value={filters[cfg.mainFilter]} onChange={e => update(cfg.mainFilter, e.target.value)} placeholder={cfg.mainPlaceholder}/></label>
          <label>SKU / Producto<input value={filters.sku} onChange={e => update('sku', e.target.value)} placeholder="SKU o descripción" /></label>
          <label>Ubicación<input value={filters.ubicacion} onChange={e => update('ubicacion', e.target.value)} placeholder="Rack, auditoría, muelle" /></label>
          <label>Lote<input value={filters.lote} onChange={e => update('lote', e.target.value)} placeholder="Lote / serie" /></label>
          <label>Texto libre<input value={filters.q} onChange={e => update('q', e.target.value)} placeholder="Buscar en todos los campos" /></label>
        </div>
        <div className="active-filter-row"><span>Empresa: <b>{company?.name || 'Todas'}</b></span></div>
        <div className="search-actions-row"><button><Search size={17}/> Analizar</button></div>
      </form>

      {error && <div className="error-box">{error}</div>}

      <div className="kpi-grid monitor-kpis">
        <div className="kpi"><span>Registros</span><strong>{fmt(rows.length)}</strong></div>
        <div className="kpi"><span>Stock total</span><strong>{fmt(resumen.stock_total)}</strong></div>
        <div className="kpi"><span>Ubicaciones</span><strong>{fmt(resumen.ubicaciones)}</strong></div>
        <div className="kpi warning"><span>Alertas potenciales</span><strong>{fmt(resumen.alta_dispersion || resumen.auditoria || 0)}</strong></div>
      </div>

      <div className="table-card">
        <table>
          <thead><tr>{cfg.columns.map(c => <th key={c}>{cfg.labels[c] || c}</th>)}<th>Acciones</th></tr></thead>
          <tbody>
            {filtered.map((row, idx) => <tr key={row.id || idx}>
              {cfg.columns.map(c => <td key={c}>{c.includes('stock') ? <b>{fmt(row[c])}</b> : String(row[c] ?? '-').slice(0, 240)}</td>)}
              <td><button className="small secondary" onClick={() => investigar(row)}><Eye size={15}/> Investigar</button></td>
            </tr>)}
            {filtered.length === 0 && <tr><td colSpan={cfg.columns.length + 1}>No hay datos para los filtros actuales.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
