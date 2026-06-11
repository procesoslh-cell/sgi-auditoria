import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../services/api.js';
import { exportRowsToExcel } from '../utils/exportExcel.js';
import { useCompany } from '../context/CompanyContext.jsx';

function fmt(n) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n || 0)); }
function todayOffset(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }

export default function ErroresLogisticos() {
  const { company } = useCompany();
  const [tab, setTab] = useState('muelle');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ fechaDesde: todayOffset(-30), fechaHasta: todayOffset(0), dias: 15, q: '', sku: '', pedido: '', ubicacion: '', limit: 500 });

  const endpoint = tab === 'muelle' ? '/monitor/picks-incompletos' : '/monitor/picks-diferencias';

  function update(name, value) { setFilters(prev => ({ ...prev, [name]: value })); }

  async function load(e) {
    e?.preventDefault();
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filters.fechaDesde) params.set('fecha_desde', filters.fechaDesde);
      if (filters.fechaHasta) params.set('fecha_hasta', filters.fechaHasta);
      if (filters.dias) params.set('dias', filters.dias);
      if (filters.q) params.set('q', filters.q);
      if (filters.sku) params.set('sku', filters.sku);
      if (filters.pedido) params.set('pedido', filters.pedido);
      if (filters.ubicacion) params.set('ubicacion', filters.ubicacion);
      params.set('limit', filters.limit || 500);
      const data = await apiFetch(`${endpoint}?${params.toString()}`);
      setRows(data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los errores logísticos');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [company?.id, tab]);

  const resumen = useMemo(() => ({
    total: rows.length,
    cantidad: rows.reduce((a,r)=>a + Number(r.cantidad || r.diferencia || 0),0),
    mayorDemora: Math.max(0, ...rows.map(r => Number(r.dias_pendiente || 0)))
  }), [rows]);

  return (
    <section className="page">
      <div className="section-title">
        <div>
          <h3>Errores Logísticos</h3>
          <p>Control de mercadería detenida y procesos incompletos entre preparación, muelle y salida a cliente.</p>
        </div>
        <div className="row-actions">
          <button className="secondary" onClick={() => exportRowsToExcel(`errores-logisticos-${tab}.xlsx`, rows, tab === 'muelle' ? 'Mercaderia detenida' : 'Pick vs Out')}><Download size={17}/> Exportar</button>
          <button onClick={load} disabled={loading}><RefreshCw size={17}/> {loading ? 'Analizando...' : 'Actualizar'}</button>
        </div>
      </div>

      <div className="panel monitor-tabs">
        <button className={tab === 'muelle' ? 'active' : 'secondary'} onClick={() => setTab('muelle')}>Mercadería en muelle / intermedia</button>
        <button className={tab === 'pickout' ? 'active' : 'secondary'} onClick={() => setTab('pickout')}>Pick incompleto vs OUT</button>
      </div>

      <form className="advanced-investigation-panel" onSubmit={load}>
        <div className="advanced-title-row"><div><Search size={20}/><b>Filtros obligatorios para evitar consultas pesadas</b></div></div>
        <div className="advanced-grid">
          <label>Desde<input type="date" value={filters.fechaDesde} onChange={e => update('fechaDesde', e.target.value)} /></label>
          <label>Hasta<input type="date" value={filters.fechaHasta} onChange={e => update('fechaHasta', e.target.value)} /></label>
          <label>Días detenida<input type="number" min="1" value={filters.dias} onChange={e => update('dias', e.target.value)} /></label>
          <label>SKU<input value={filters.sku} onChange={e => update('sku', e.target.value)} placeholder="SKU opcional" /></label>
          <label>Pedido<input value={filters.pedido} onChange={e => update('pedido', e.target.value)} placeholder="Pedido o documento" /></label>
          <label>Ubicación<input value={filters.ubicacion} onChange={e => update('ubicacion', e.target.value)} placeholder="MUELLE, SALIDA-M, DARSENA" /></label>
          <label>Texto libre<input value={filters.q} onChange={e => update('q', e.target.value)} placeholder="Documento, operación, producto" /></label>
          <label>Límite<select value={filters.limit} onChange={e => update('limit', e.target.value)}><option value="200">200</option><option value="500">500</option><option value="1000">1000</option></select></label>
        </div>
        <div className="active-filter-row"><span>Empresa: <b>{company?.name || 'Todas'}</b></span></div>
        <div className="search-actions-row"><button disabled={loading}>Analizar</button></div>
      </form>

      {error && <div className="error-box">{error}</div>}

      <div className="kpi-grid monitor-kpis">
        <div className="kpi danger"><AlertTriangle size={24}/><span>Casos detectados</span><strong>{fmt(resumen.total)}</strong></div>
        <div className="kpi"><span>Empresa</span><strong>{company?.name || 'Todas'}</strong></div>
        <div className="kpi warning"><span>{tab === 'muelle' ? 'Cantidad pendiente' : 'Diferencia real'}</span><strong>{fmt(resumen.cantidad)}</strong></div>
        <div className="kpi"><span>Mayor demora</span><strong>{resumen.mayorDemora} días</strong></div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            {tab === 'muelle' ? (
              <tr><th>Último mov.</th><th>Pedido</th><th>Cliente</th><th>SKU</th><th>Producto</th><th>Ubicación detenida</th><th>Pendiente</th><th>Intermedia</th><th>Out</th><th>Días</th><th>Referencia</th></tr>
            ) : (
              <tr><th>Pedido</th><th>Cliente</th><th>Documentos</th><th>SKU</th><th>Producto</th><th>Pick</th><th>Reapro</th><th>Pack</th><th>Base</th><th>Out</th><th>Diferencia</th><th>Último mov.</th></tr>
            )}
          </thead>
          <tbody>
            {rows.map((r, idx) => tab === 'muelle' ? <tr key={r.id || idx}>
              <td>{r.fecha || '-'}</td><td><b>{r.pedido || '-'}</b></td><td>{r.cliente || '-'}</td><td>{r.sku || '-'}</td><td>{r.producto || '-'}</td><td><b>{r.ubicacion || r.destino || '-'}</b></td><td><b>{fmt(r.cantidad)}</b></td><td>{fmt(r.cantidad_intermedia)}</td><td>{fmt(r.cantidad_out)}</td><td><span className="priority alta">{r.dias_pendiente || 0}</span></td><td>{r.documento || '-'}</td>
            </tr> : <tr key={r.documento + r.sku + idx}>
              <td><b>{r.pedido || '-'}</b></td><td>{r.cliente || '-'}</td><td>{r.documento || '-'}</td><td>{r.sku || '-'}</td><td>{r.producto || '-'}</td><td><b>{fmt(r.cantidad_pick)}</b></td><td>{fmt(r.cantidad_reapro)}</td><td>{fmt(r.cantidad_pack)}</td><td><b>{fmt(r.cantidad_control)}</b></td><td><b>{fmt(r.cantidad_out)}</b></td><td><span className="priority critica">{fmt(r.diferencia)}</span></td><td>{r.fecha_fin || '-'}</td>
            </tr>)}
            {rows.length === 0 && <tr><td colSpan="12">No hay casos con los filtros actuales.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
