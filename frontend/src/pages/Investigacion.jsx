import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, FilePlus2, RefreshCw, Search, X } from 'lucide-react';
import { useCompany } from '../context/CompanyContext.jsx';
import { apiFetch } from '../services/api.js';

function fmt(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number.toString() : number.toFixed(2);
}

function labelSeveridad(severidad) {
  const s = String(severidad || '').toLowerCase();
  if (s === 'critica') return 'Critica';
  if (s === 'alta') return 'Alta';
  if (s === 'media') return 'Media';
  return 'Baja';
}

const initialFilters = {
  q: '',
  pedido: '',
  ubicacion: '',
  sku: '',
  lote: '',
  usuario: '',
  tipoMovimiento: 'todos',
  fechaDesde: '',
  fechaHasta: ''
};

export default function Investigacion() {
  const { company } = useCompany();
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [recientes, setRecientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const analisis = data?.analisis;
  const kpis = analisis?.kpis || {};
  const balanceVisible = useMemo(() => data?.resumen?.balance ?? kpis.balance ?? 0, [data, kpis.balance]);

  function updateFilter(name, value) {
    setFilters(prev => ({ ...prev, [name]: value }));
  }

  function clearFilters() {
    setFilters(initialFilters);
    setData(null);
    setError('');
  }

  const activeFilters = useMemo(() => Object.entries(filters).filter(([key, value]) => value && value !== 'todos' && key !== 'q'), [filters]);

  async function cargarRecientes() {
    try {
      const rows = await apiFetch('/investigacion/recientes');
      setRecientes(rows);
    } catch (_) {
      // No bloquea el uso del modulo.
    }
  }

  useEffect(() => { cargarRecientes(); }, [company?.id]);


  function applyRecent(row) {
    let parsed = null;
    try { parsed = row.filtros_json ? JSON.parse(row.filtros_json) : null; } catch (_) { parsed = null; }
    if (parsed) {
      const next = {
        ...initialFilters,
        q: parsed.q || '',
        pedido: parsed.pedido || '',
        ubicacion: parsed.ubicacion || '',
        sku: parsed.sku || '',
        lote: parsed.lote || '',
        usuario: parsed.usuario || '',
        tipoMovimiento: parsed.tipoMovimiento || 'todos',
        fechaDesde: parsed.fechaDesde || '',
        fechaHasta: parsed.fechaHasta || ''
      };
      setFilters(next);
      setTimeout(() => buscar(null, next), 0);
      return;
    }
    const text = row.consulta || '';
    const next = { ...initialFilters };
    for (const part of text.split('|')) {
      const [rawKey, ...rest] = part.split(':');
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key.includes('pedido')) next.pedido = value;
      else if (key.includes('ubic')) next.ubicacion = value;
      else if (key.includes('sku')) next.sku = value;
      else if (key.includes('lote')) next.lote = value;
      else if (key.includes('usuario')) next.usuario = value;
      else if (key.includes('texto')) next.q = value;
    }
    setFilters(next);
    setTimeout(() => buscar(null, next), 0);
  }

  async function buscar(e, overrideFilters = null) {
    e?.preventDefault();
    const params = new URLSearchParams();
    const current = overrideFilters || filters;
    if (current.q.trim()) params.set('q', current.q.trim());
    if (current.pedido?.trim()) params.set('pedido', current.pedido.trim());
    if (current.ubicacion.trim()) params.set('ubicacion', current.ubicacion.trim());
    if (current.sku.trim()) params.set('sku', current.sku.trim());
    if (current.lote.trim()) params.set('lote', current.lote.trim());
    if (current.usuario.trim()) params.set('usuario', current.usuario.trim());
    if (current.tipoMovimiento && current.tipoMovimiento !== 'todos') params.set('tipo_movimiento', current.tipoMovimiento);
    if (current.fechaDesde) params.set('fecha_desde', current.fechaDesde);
    if (current.fechaHasta) params.set('fecha_hasta', current.fechaHasta);
    params.set('tipo', 'avanzada');

    if (!params.toString().replace('tipo=avanzada', '').replace('&', '')) {
      setError('Ingresá al menos un criterio: pedido, ubicación, SKU, lote, usuario, fecha o texto libre.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/investigacion/buscar?${params.toString()}`);
      setData(res);
      cargarRecientes();
    } catch (err) {
      setData(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function analizarConIA() {
    if (!data) return;
    setAiLoading(true);
    setAiText('');
    try {
      const result = await apiFetch('/ia/investigacion', {
        method: 'POST',
        body: JSON.stringify({
          filtros: filters,
          resumen: data.resumen,
          analisis: data.analisis,
          muestra_movimientos: (data.timeline || []).slice(0, 60)
        })
      });
      setAiText(result.text || 'La IA no devolvió contenido.');
    } catch (err) {
      setAiText(err.message || 'No se pudo ejecutar el análisis con IA.');
    } finally {
      setAiLoading(false);
    }
  }

  async function crearHallazgoDesdeBusqueda() {
    if (!data) return;
    const sugerido = data.analisis?.hallazgo_sugerido || {};
    await apiFetch('/hallazgos', {
      method: 'POST',
      body: JSON.stringify({
        titulo: sugerido.titulo || `Hallazgo generado desde investigacion`,
        descripcion: sugerido.descripcion || `Se genero un hallazgo desde el Centro de Investigacion. Movimientos analizados: ${data.resumen?.movimientos || 0}.`,
        tipo: sugerido.tipo || 'Diferencia de stock',
        prioridad: sugerido.prioridad || (Math.abs(Number(balanceVisible || 0)) > 0 ? 'Alta' : 'Media'),
        pedido: filters.pedido || data.timeline?.[0]?.pedido || '',
        cliente: data.timeline?.[0]?.cliente || '',
        sku: filters.sku || data.timeline?.[0]?.sku || '',
        producto: data.timeline?.[0]?.producto || '',
        ubicacion: filters.ubicacion || '',
        lote: filters.lote || data.timeline?.[0]?.lote || '',
        cantidad: sugerido.cantidad || data.analisis?.kpis?.posible_diferencia || balanceVisible || 0,
        area_responsable: 'Deposito Central'
      })
    });
    alert('Hallazgo creado correctamente. Revisalo en el modulo Hallazgos.');
  }

  return (
    <section className="page">
      <div className="section-title">
        <div>
          <h3>Centro de Investigacion</h3>
          <p>Combiná ubicación, SKU, lote, usuario, fechas y tipo de movimiento para reconstruir una investigación.</p>
        </div>
      </div>

      <form className="advanced-investigation-panel" onSubmit={buscar}>
        <div className="advanced-title-row">
          <div><Search size={22} /><b>Investigación avanzada</b></div>
          <button type="button" className="ghost-button" onClick={clearFilters}><X size={16} /> Limpiar</button>
        </div>

        <div className="advanced-grid">
          <label>Pedido / documento<input value={filters.pedido} onChange={e => updateFilter('pedido', e.target.value)} placeholder="Ej: LHSA/PICK/235690, SO..." /></label>
          <label>Ubicación<input value={filters.ubicacion} onChange={e => updateFilter('ubicacion', e.target.value)} placeholder="Ej: AUDITORIA/C0-164-01" /></label>
          <label>SKU / Producto<input value={filters.sku} onChange={e => updateFilter('sku', e.target.value)} placeholder="Ej: 1004742" /></label>
          <label>Lote<input value={filters.lote} onChange={e => updateFilter('lote', e.target.value)} placeholder="Ej: P01080/09014" /></label>
          <label>Usuario<input value={filters.usuario} onChange={e => updateFilter('usuario', e.target.value)} placeholder="Ej: David, Carlos, Alan" /></label>
          <label>Desde<input type="date" value={filters.fechaDesde} onChange={e => updateFilter('fechaDesde', e.target.value)} /></label>
          <label>Hasta<input type="date" value={filters.fechaHasta} onChange={e => updateFilter('fechaHasta', e.target.value)} /></label>
          <label>Tipo de movimiento
            <select value={filters.tipoMovimiento} onChange={e => updateFilter('tipoMovimiento', e.target.value)}>
              <option value="todos">Todos</option>
              <option value="transferencia">Transferencia interna</option>
              <option value="venta">Venta / salida a cliente</option>
              <option value="ajuste">Ajuste de inventario</option>
              <option value="recepcion">Recepción / proveedor</option>
              <option value="auditoria">Movimientos AUDITORIA</option>
            </select>
          </label>
          <label>Texto libre<input value={filters.q} onChange={e => updateFilter('q', e.target.value)} placeholder="Documento, cliente, operación o referencia" /></label>
        </div>

        <div className="active-filter-row">
          <span>Empresa: <b>{company?.name || 'Todas'}</b></span>
          {activeFilters.map(([key, value]) => <span className="filter-chip" key={key}>{key}: {value}</span>)}
        </div>

        <div className="search-actions-row">
          <button disabled={loading}>{loading ? 'Analizando...' : 'Investigar'}</button>
        </div>
      </form>

      {error && <div className="error-box">{error}</div>}

      {data && (
        <>
          <div className="result-summary executive-summary">
            <div><span>Origen</span><strong>{data.provider}</strong></div>
            <div><span>Tipo</span><strong>{data.tipo || 'general'}</strong></div>
            <div><span>Movimientos</span><strong>{fmt(data.resumen.movimientos)}</strong></div>
            <div><span>Entradas</span><strong>{fmt(kpis.entradas ?? data.resumen.entradas)}</strong></div>
            <div><span>Salidas</span><strong>{fmt(kpis.salidas ?? data.resumen.salidas)}</strong></div>
            <div><span>Balance</span><strong>{fmt(balanceVisible)}</strong></div>
          </div>

          {data.filtros_aplicados && (
            <div className="panel compact-panel">
              <h4>Filtros aplicados</h4>
              <div className="mini-grid">
                {Object.entries(data.filtros_aplicados).filter(([, v]) => v && v !== 'todos').map(([k, v]) => <span key={k}>{k}: {v}</span>)}
              </div>
            </div>
          )}

          {analisis && (
            <div className="audit-grid">
              <div className="panel audit-main-card">
                <div className="audit-title-row">
                  <div>
                    <span className="audit-eyebrow">Resumen ejecutivo</span>
                    <h4>{analisis.estado}</h4>
                  </div>
                  <span className={`severity-pill ${String(analisis.severidad || '').toLowerCase()}`}>{labelSeveridad(analisis.severidad)}</span>
                </div>

                <div className="audit-kpi-grid">
                  <div><span>Ajustes +</span><strong>{fmt(kpis.ajustes_positivos)}</strong></div>
                  <div><span>Ajustes -</span><strong>{fmt(kpis.ajustes_negativos)}</strong></div>
                  <div><span>Diferencia ajustes</span><strong>{fmt(kpis.diferencia_neta_ajustes)}</strong></div>
                  <div><span>Posible diferencia</span><strong>{fmt(kpis.posible_diferencia)}</strong></div>
                  <div><span>Picks / cliente</span><strong>{fmt(kpis.picks_o_salidas_cliente)}</strong></div>
                  <div><span>Mov. analizados</span><strong>{fmt(kpis.movimientos_analizados)}</strong></div>
                </div>

                <div className="conclusion-box">
                  <BrainCircuit size={20} />
                  <div>
                    <b>Conclusion automatica</b>
                    <p>{analisis.conclusion}</p>
                  </div>
                </div>
              </div>

              <div className="panel interpretation-card">
                <h4>Interpretacion</h4>
                <ul>{analisis.interpretacion?.map((line, index) => <li key={index}>{line}</li>)}</ul>
              </div>
            </div>
          )}

          {analisis?.desglose_calculo?.items?.length > 0 && (
            <div className="panel breakdown-panel">
              <div className="panel-headline"><div><h4>Como se calculo el numero</h4><p className="muted">Desglose auditable de entradas, salidas y balance.</p></div></div>
              <div className="breakdown-formula">
                <div><span>Entradas explicadas</span><strong>{fmt(analisis.desglose_calculo.formula?.entradas)}</strong></div>
                <div><span>Salidas explicadas</span><strong>{fmt(analisis.desglose_calculo.formula?.salidas)}</strong></div>
                <div><span>Balance explicado</span><strong>{fmt(analisis.desglose_calculo.formula?.balance)}</strong></div>
              </div>
              <div className="table-wrap"><table><thead><tr><th>Categoria</th><th>Signo</th><th>Mov.</th><th>Cantidad</th><th>Ejemplo</th></tr></thead><tbody>{analisis.desglose_calculo.items.map(item => { const ex = item.ejemplos?.[0]; return <tr key={item.key}><td>{item.label}</td><td>{item.signo}</td><td>{fmt(item.movimientos)}</td><td><b>{fmt(item.cantidad)}</b></td><td>{ex ? `${ex.origen || '-'} → ${ex.destino || '-'} (${ex.documento || 'sin doc'})` : '-'}</td></tr>; })}</tbody></table></div>
            </div>
          )}

          {analisis?.timeline_agrupado?.length > 0 && (
            <div className="panel grouped-timeline-panel"><h4>Linea de tiempo agrupada</h4><div className="grouped-timeline">{analisis.timeline_agrupado.map((g, index) => <div className={`grouped-step ${g.tipo}`} key={`${g.titulo}-${index}`}><span>{g.fecha}</span><strong>{g.titulo}</strong><b>{fmt(g.cantidad)} u.</b><p>{g.detalle}</p></div>)}</div></div>
          )}

          <div className="panel action-panel">
            <div>
              <h4>{data.resumen.alerta}</h4>
              <p>Desde esta investigacion podes reportar una diferencia o crear un caso de seguimiento para Auditoria.</p>
              {analisis?.sugerir_hallazgo && <p className="warning-line"><AlertTriangle size={16} /> SGI sugiere crear un hallazgo para documentar esta diferencia.</p>}
            </div>
            <div className="row-actions"><button className="secondary" onClick={analizarConIA} disabled={aiLoading}><BrainCircuit size={17} /> {aiLoading ? 'Analizando IA...' : 'Analizar con IA'}</button><button className="secondary" onClick={crearHallazgoDesdeBusqueda}><FilePlus2 size={17} /> Crear hallazgo</button></div>
          </div>

          {aiText && <div className="panel interpretation-card"><h4>Análisis IA</h4><pre className="ai-output">{aiText}</pre></div>}

          <div className="panel compact-panel"><h4>Movimientos detallados</h4><p className="muted">Esta sección queda como evidencia operativa. El resumen superior es la lectura de auditoría.</p></div>

          <div className="timeline">
            {data.timeline?.length === 0 && <div className="empty-state">No se encontraron movimientos para esta consulta.</div>}
            {data.timeline?.map((m, index) => (
              <div className="timeline-item" key={m.id || `${m.fecha}-${m.documento}-${index}`}>
                <div className={`dot ${Number(m.cantidad) < 0 ? 'out' : 'in'}`} />
                <div className="timeline-card">
                  <div className="timeline-head"><strong>{m.tipo || 'Movimiento'}</strong><span>{m.fecha}</span></div>
                  <p><b>{m.origen || 'Sin origen'}</b> → <b>{m.destino || 'Sin destino'}</b></p>
                  <div className="tags">
                    <span>{m.pedido || 'Sin pedido'}</span><span>{m.cliente || 'Sin cliente'}</span><span>{m.sku || 'Sin SKU'}</span><span>{m.lote || 'Sin lote'}</span><span>Cant: {fmt(m.cantidad)}</span><span>{m.usuario || 'Sin usuario'}</span><span>{m.documento || 'Sin documento'}</span>{m.es_ajuste && <span>Ajuste</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!data && recientes.length > 0 && (
        <div className="panel recent-panel">
          <div className="panel-headline"><h4>Investigaciones recientes</h4><button className="secondary" onClick={cargarRecientes}><RefreshCw size={16} /> Actualizar</button></div>
          <table><thead><tr><th>Fecha</th><th>Consulta</th><th>Tipo</th><th>Usuario</th><th>Mov.</th><th>Balance</th><th>Acción</th></tr></thead><tbody>{recientes.map(r => <tr key={r.id}><td>{r.creado_en}</td><td>{r.consulta}</td><td>{r.tipo}</td><td>{r.usuario || '-'}</td><td>{r.movimientos}</td><td>{r.balance}</td><td><button className="small" onClick={() => applyRecent(r)}>Abrir</button></td></tr>)}</tbody></table>
        </div>
      )}
    </section>
  );
}
