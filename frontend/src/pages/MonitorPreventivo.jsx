// Filtro Empresa: LH, GRAM SAS, RODAMAX, BICI
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ClipboardPlus, Download, FileUp, Play, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useCompany } from '../context/CompanyContext.jsx';
import { apiFetch } from '../services/api.js';
import { exportRowsToExcel, readExcelFile } from '../utils/exportExcel.js';

function fmt(n) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n || 0)); }
function priorityClass(p) { return String(p || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

export default function MonitorPreventivo() {
  const { company } = useCompany();
  const [resumen, setResumen] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [abc, setAbc] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('alertas');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [abcForm, setAbcForm] = useState({ sku: '', producto: '', clase: 'A', frecuencia: 'Diario', motivo: '' });
  const [reglaForm, setReglaForm] = useState({ codigo: '', nombre: '', descripcion: '', tipo: 'ajuste_grande', umbral: 50, dias: 0, prioridad: 'Alta', activo: true });
  const [destForm, setDestForm] = useState({ nombre: '', email: '', rol: 'Jefe Deposito', area: 'Logistica', prioridad_minima: 'Media' });
  const [assign, setAssign] = useState({});

  async function load() {
    const [r, a, b, rules, dest, us] = await Promise.all([
      apiFetch('/monitor/resumen'), apiFetch('/monitor/alertas'), apiFetch('/monitor/abc'), apiFetch('/monitor/reglas'), apiFetch('/monitor/destinatarios'), apiFetch('/users')
    ]);
    setResumen(r); setAlertas(a); setAbc(b); setReglas(rules); setDestinatarios(dest); setUsers(us);
  }
  useEffect(() => { load().catch(() => {}); }, [company?.id]);

  const auditores = useMemo(() => users.filter(u => ['Auditor', 'Jefe Auditoria'].includes(u.rol)), [users]);
  const abiertas = useMemo(() => alertas.filter(a => a.estado !== 'Cerrada'), [alertas]);

  async function ejecutarBarrido() {
    setLoading(true); setMessage('');
    try {
      const result = await apiFetch('/monitor/barrido', { method: 'POST', body: JSON.stringify({}) });
      setMessage(`Barrido finalizado. Detectadas: ${result.alertas_detectadas}. Nuevas: ${result.alertas_generadas}. Actualizadas: ${result.alertas_actualizadas}.`);
      await load();
    } catch (err) { setMessage(err.message || 'No se pudo ejecutar el barrido'); }
    finally { setLoading(false); }
  }

  async function cambiarEstado(alerta, estado) {
    await apiFetch(`/monitor/alertas/${alerta.id}`, { method: 'PUT', body: JSON.stringify({ estado }) });
    await load();
  }

  async function crearHallazgo(alerta) {
    const res = await apiFetch(`/monitor/alertas/${alerta.id}/hallazgo`, { method: 'POST', body: JSON.stringify({ asignado_a: assign[alerta.id] || alerta.asignado_a || null }) });
    setMessage(`Hallazgo creado: ${res.numero}`);
    await load();
  }

  async function asignarAlerta(alerta) {
    const auditor_id = assign[alerta.id] || alerta.asignado_a;
    if (!auditor_id) return setMessage('Selecciona un auditor para asignar la alerta.');
    const res = await apiFetch(`/monitor/alertas/${alerta.id}/asignar`, { method: 'POST', body: JSON.stringify({ auditor_id }) });
    setMessage(`Auditoria programada creada: ${res.numero}`);
    await load();
  }

  async function guardarAbc(e) {
    e.preventDefault();
    await apiFetch('/monitor/abc', { method: 'POST', body: JSON.stringify(abcForm) });
    setAbcForm({ sku: '', producto: '', clase: 'A', frecuencia: 'Diario', motivo: '' });
    await load();
  }

  async function importarAbc(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('Importando ABC...');
    try {
      const rows = await readExcelFile(file);
      const result = await apiFetch('/monitor/abc/import', { method: 'POST', body: JSON.stringify({ rows, deactivateMissing: false }) });
      setMessage(`ABC importado. Creados: ${result.created}. Actualizados: ${result.updated}. Filas leidas: ${result.imported}.`);
      await load();
    } catch (err) { setMessage(err.message || 'No se pudo importar el archivo ABC'); }
    finally { e.target.value = ''; }
  }

  async function eliminarAbc(id) { await apiFetch(`/monitor/abc/${id}`, { method: 'DELETE' }); await load(); }
  async function guardarDestinatario(e) { e.preventDefault(); await apiFetch('/monitor/destinatarios', { method: 'POST', body: JSON.stringify(destForm) }); setDestForm({ nombre: '', email: '', rol: 'Jefe Deposito', area: 'Logistica', prioridad_minima: 'Media' }); await load(); }
  async function guardarRegla(e) { e.preventDefault(); await apiFetch('/monitor/reglas', { method: 'POST', body: JSON.stringify(reglaForm) }); setReglaForm({ codigo: '', nombre: '', descripcion: '', tipo: 'ajuste_grande', umbral: 50, dias: 0, prioridad: 'Alta', activo: true }); await load(); }
  async function updateRegla(regla, patch) { await apiFetch(`/monitor/reglas/${regla.id}`, { method: 'PUT', body: JSON.stringify({ ...regla, ...patch }) }); await load(); }

  return (
    <section className="page monitor-page">
      <div className="section-title">
        <div><h3>Monitor Preventivo</h3><p>Motor de barrido, asignacion de alertas y reglas editables para Auditoria.</p></div>
        <div className="row-actions"><button className="secondary" onClick={() => exportRowsToExcel('monitor-preventivo-alertas.xlsx', alertas, 'Alertas')}><Download size={17} /> Exportar</button><button onClick={ejecutarBarrido} disabled={loading}><Play size={17} /> {loading ? 'Ejecutando...' : 'Ejecutar barrido'}</button></div>
      </div>
      {message && <div className="success-box">{message}</div>}

      <div className="kpi-grid monitor-kpis">
        <Kpi icon={BellRing} label="Alertas abiertas" value={resumen?.total_alertas || abiertas.length} />
        <Kpi icon={AlertTriangle} label="Criticas" value={resumen?.criticas || 0} tone="danger" />
        <Kpi icon={AlertTriangle} label="Altas" value={resumen?.altas || 0} tone="warning" />
        <Kpi icon={CheckCircle2} label="SKU ABC activos" value={(resumen?.sku_abc || []).reduce((a, x) => a + Number(x.total || 0), 0)} tone="success" />
        <Kpi icon={RefreshCw} label="Ultimo barrido" value={resumen?.ultimo_barrido?.creado_en ? resumen.ultimo_barrido.creado_en.slice(0, 10) : 'Sin datos'} />
        <Kpi icon={ClipboardPlus} label="Generadas" value={resumen?.ultimo_barrido?.alertas_generadas || 0} />
      </div>

      <div className="monitor-tabs panel">
        {['alertas', 'abc', 'reglas', 'avisos'].map(t => <button key={t} className={tab === t ? 'active' : 'secondary'} onClick={() => setTab(t)}>{t === 'abc' ? 'ABC de SKU' : t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>

      {tab === 'alertas' && <div className="table-card monitor-table"><table><thead><tr><th>Prioridad</th><th>Tipo</th><th>Pedido</th><th>Cliente</th><th>SKU</th><th>Ubicacion</th><th>Cant.</th><th>Motivo</th><th>Asignar</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {alertas.map(a => <tr key={a.id}><td><span className={`priority ${priorityClass(a.prioridad)}`}>{a.prioridad}</span></td><td>{a.tipo}</td><td>{a.pedido || '-'}</td><td>{a.cliente || '-'}</td><td>{a.sku || '-'}</td><td>{a.ubicacion || '-'}</td><td><b>{fmt(a.cantidad)}</b></td><td><b>{a.motivo}</b><br/><small>{a.detalle}</small></td><td><select value={assign[a.id] || a.asignado_a || ''} onChange={e => setAssign({ ...assign, [a.id]: e.target.value })}><option value="">Auditor...</option>{auditores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>{a.asignado_a_nombre && <small>Asignado: {a.asignado_a_nombre}</small>}</td><td><span className="pill">{a.estado}</span></td><td className="row-actions"><button className="small" onClick={() => asignarAlerta(a)}>Asignar</button>{a.estado !== 'Convertida en hallazgo' && <button className="small" onClick={() => crearHallazgo(a)}>Hallazgo</button>}{a.estado !== 'Cerrada' && <button className="small secondary" onClick={() => cambiarEstado(a, 'Cerrada')}>Cerrar</button>}</td></tr>)}
        {alertas.length === 0 && <tr><td colSpan="11">Todavia no hay alertas. Ejecuta el primer barrido preventivo.</td></tr>}
      </tbody></table></div>}

      {tab === 'abc' && <div className="monitor-grid"><form className="panel form-stack" onSubmit={guardarAbc}><h4>Cargar SKU prioritario</h4><label className="file-button"><FileUp size={16}/> Importar Excel/CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={importarAbc}/></label><small className="muted">Columnas esperadas: SKU y Categoria/ABC. Opcionales: Producto, Frecuencia, Motivo.</small><input placeholder="SKU" value={abcForm.sku} onChange={e => setAbcForm({ ...abcForm, sku: e.target.value })} required/><input placeholder="Producto / descripcion" value={abcForm.producto} onChange={e => setAbcForm({ ...abcForm, producto: e.target.value })}/><select value={abcForm.clase} onChange={e => setAbcForm({ ...abcForm, clase: e.target.value })}><option>A</option><option>B</option><option>C</option></select><select value={abcForm.frecuencia} onChange={e => setAbcForm({ ...abcForm, frecuencia: e.target.value })}><option>Diario</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option></select><textarea placeholder="Motivo" value={abcForm.motivo} onChange={e => setAbcForm({ ...abcForm, motivo: e.target.value })}/><button>Guardar SKU ABC</button></form><div className="table-card"><div className="table-actions"><button className="small secondary" onClick={() => exportRowsToExcel('abc-sku.xlsx', abc, 'ABC')}>Exportar ABC</button></div><table><thead><tr><th>SKU</th><th>Clase</th><th>Frecuencia</th><th>Motivo</th><th></th></tr></thead><tbody>{abc.map(item => <tr key={item.id}><td>{item.sku}<br/><small>{item.producto}</small></td><td><b>{item.clase}</b></td><td>{item.frecuencia}</td><td>{item.motivo}</td><td><button className="small secondary" onClick={() => eliminarAbc(item.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></div>}

      {tab === 'reglas' && <div className="monitor-grid"><form className="panel form-stack" onSubmit={guardarRegla}><h4>Crear regla preventiva</h4><input placeholder="Codigo" value={reglaForm.codigo} onChange={e => setReglaForm({ ...reglaForm, codigo: e.target.value })} required/><input placeholder="Nombre" value={reglaForm.nombre} onChange={e => setReglaForm({ ...reglaForm, nombre: e.target.value })} required/><select value={reglaForm.tipo} onChange={e => setReglaForm({ ...reglaForm, tipo: e.target.value })}><option value="ajuste_grande">Ajuste grande</option><option value="ubicacion_auditoria">Ubicacion auditoria</option><option value="stock_detenido">Stock detenido</option><option value="circuito_incompleto">Circuito incompleto</option><option value="sku_abc">SKU ABC</option></select><input type="number" placeholder="Umbral" value={reglaForm.umbral} onChange={e => setReglaForm({ ...reglaForm, umbral: e.target.value })}/><input type="number" placeholder="Dias" value={reglaForm.dias} onChange={e => setReglaForm({ ...reglaForm, dias: e.target.value })}/><select value={reglaForm.prioridad} onChange={e => setReglaForm({ ...reglaForm, prioridad: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select><textarea placeholder="Descripcion" value={reglaForm.descripcion} onChange={e => setReglaForm({ ...reglaForm, descripcion: e.target.value })}/><button>Crear regla</button></form><div className="table-card"><table><thead><tr><th>Codigo</th><th>Regla</th><th>Umbral</th><th>Dias</th><th>Prioridad</th><th>Estado</th><th>Accion</th></tr></thead><tbody>{reglas.map(r => <tr key={r.id}><td>{r.codigo}</td><td><b>{r.nombre}</b><br/><small>{r.descripcion}</small></td><td><input className="inline-input" type="number" defaultValue={r.umbral} onBlur={e => updateRegla(r, { umbral: e.target.value })}/></td><td><input className="inline-input" type="number" defaultValue={r.dias} onBlur={e => updateRegla(r, { dias: e.target.value })}/></td><td><select defaultValue={r.prioridad} onChange={e => updateRegla(r, { prioridad: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select></td><td>{r.activo ? 'Activa' : 'Inactiva'}</td><td><button className="small secondary" onClick={() => updateRegla(r, { activo: !r.activo })}><Settings2 size={14}/> {r.activo ? 'Pausar' : 'Activar'}</button></td></tr>)}</tbody></table></div></div>}

      {tab === 'avisos' && <div className="monitor-grid"><form className="panel form-stack" onSubmit={guardarDestinatario}><h4>Destinatario de avisos</h4><input placeholder="Nombre" value={destForm.nombre} onChange={e => setDestForm({ ...destForm, nombre: e.target.value })} required/><input placeholder="Email" value={destForm.email} onChange={e => setDestForm({ ...destForm, email: e.target.value })}/><input placeholder="Rol" value={destForm.rol} onChange={e => setDestForm({ ...destForm, rol: e.target.value })}/><input placeholder="Area" value={destForm.area} onChange={e => setDestForm({ ...destForm, area: e.target.value })}/><select value={destForm.prioridad_minima} onChange={e => setDestForm({ ...destForm, prioridad_minima: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select><button>Guardar destinatario</button></form><div className="table-card"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Area</th><th>Prioridad</th></tr></thead><tbody>{destinatarios.map(d => <tr key={d.id}><td>{d.nombre}</td><td>{d.email || '-'}</td><td>{d.rol || '-'}</td><td>{d.area || '-'}</td><td>{d.prioridad_minima}</td></tr>)}</tbody></table><p className="muted notification-note">: los avisos quedan configurados. En Hallazgos se genera email manual con mailto.</p></div></div>}
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone = '' }) { return <div className={`kpi ${tone}`}><Icon size={24}/><span>{label}</span><strong>{value}</strong></div>; }
