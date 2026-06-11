import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Download, Mail, MessageSquare, Plus, Save } from 'lucide-react';
import { useCompany } from '../context/CompanyContext.jsx';
import { apiFetch } from '../services/api.js';
import { exportRowsToExcel } from '../utils/exportExcel.js';

const initial = { titulo: '', descripcion: '', tipo: 'Diferencia de stock', prioridad: 'Media', estado: 'Abierto', sku: '', ubicacion: '', lote: '', pedido: '', cliente: '', cantidad: 0, area_responsable: 'Deposito Central', asignado_a: '', fecha_limite: '' };

export default function Hallazgos() {
  const { company } = useCompany();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initial);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [emailForm, setEmailForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const [message, setMessage] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  async function load() {
    const [h, u] = await Promise.all([apiFetch('/hallazgos'), apiFetch('/users')]);
    setItems(h); setUsers(u);
  }
  useEffect(() => { load().catch(() => {}); }, [company?.id]);
  const auditores = useMemo(() => users.filter(u => ['Auditor', 'Jefe Auditoria'].includes(u.rol)), [users]);

  async function openDetail(id) {
    setSelected(id);
    const d = await apiFetch(`/hallazgos/${id}`);
    setDetail(d);
    setAiText('');
    setEmailForm({ to: '', cc: '', subject: `SGI Auditoria - ${d.numero} - ${d.titulo}`, body: `Se informa hallazgo de Auditoria:\n\nNumero: ${d.numero}\nTitulo: ${d.titulo}\nTipo: ${d.tipo}\nPrioridad: ${d.prioridad}\nSKU: ${d.sku || '-'}\nUbicacion: ${d.ubicacion || '-'}\nPedido: ${d.pedido || '-'}
Cliente: ${d.cliente || '-'}
Cantidad: ${d.cantidad || 0}\n\nDescripcion:\n${d.descripcion || ''}\n\nSe solicita analisis/respuesta del area responsable.` });
  }

  async function submit(e) {
    e.preventDefault();
    await apiFetch('/hallazgos', { method: 'POST', body: JSON.stringify(form) });
    setForm(initial); setShow(false); await load();
  }

  async function updateDetail(patch) {
    await apiFetch(`/hallazgos/${detail.id}`, { method: 'PUT', body: JSON.stringify({ ...detail, ...patch }) });
    await openDetail(detail.id); await load();
  }

  async function saveDetail(e) {
    e.preventDefault();
    await updateDetail(detail);
    setMessage('Hallazgo actualizado.');
  }

  async function addComment(e, tipo = 'comentario') {
    e.preventDefault();
    if (!comment.trim()) return;
    await apiFetch(`/hallazgos/${detail.id}/comentarios`, { method: 'POST', body: JSON.stringify({ comentario: comment, tipo }) });
    setComment(''); await openDetail(detail.id);
  }


  async function generarResumenIA() {
    if (!detail) return;
    setAiLoading(true);
    try {
      const result = await apiFetch(`/ia/hallazgos/${detail.id}/resumen`, { method: 'POST', body: JSON.stringify({}) });
      setAiText(result.text || 'La IA no devolvió contenido.');
    } catch (err) {
      setAiText(err.message || 'No se pudo generar el resumen con IA.');
    } finally { setAiLoading(false); }
  }

  async function redactarEmailIA() {
    if (!detail) return;
    setAiLoading(true);
    try {
      const result = await apiFetch(`/ia/hallazgos/${detail.id}/email`, { method: 'POST', body: JSON.stringify({}) });
      setEmailForm(prev => ({ ...prev, body: result.text || prev.body }));
      setAiText(result.text || 'La IA no devolvió contenido.');
    } catch (err) {
      setAiText(err.message || 'No se pudo redactar el email con IA.');
    } finally { setAiLoading(false); }
  }

  async function prepareEmail(e) {
    e.preventDefault();
    const res = await apiFetch(`/hallazgos/${detail.id}/email`, { method: 'POST', body: JSON.stringify(emailForm) });
    window.location.href = res.mailto;
    setMessage('Email preparado. Se abrio tu cliente de correo.');
    await openDetail(detail.id);
  }

  return <section className="page hallazgos-page">
    <div className="section-title"><div><h3>Hallazgos</h3><p>Expediente de trabajo para investigar, comentar, asignar, comunicar y cerrar casos.</p></div><div className="row-actions"><button className="secondary" onClick={() => exportRowsToExcel('hallazgos.xlsx', items, 'Hallazgos')}><Download size={17}/> Exportar</button><button onClick={() => setShow(!show)}><Plus size={17}/> Nuevo hallazgo</button></div></div>
    {message && <div className="success-box">{message}</div>}
    {show && <form className="form-grid panel" onSubmit={submit}>
      <input placeholder="Titulo" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} required />
      <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option>Faltante</option><option>Sobrante</option><option>Diferencia de stock</option><option>Pick incompleto</option><option>Mercaderia detenida</option></select>
      <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select>
      <select value={form.asignado_a} onChange={e => setForm({ ...form, asignado_a: e.target.value })}><option value="">Asignar auditor...</option>{auditores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
      <input placeholder="Pedido / Documento" value={form.pedido} onChange={e => setForm({ ...form, pedido: e.target.value })}/><input placeholder="Cliente" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })}/><input placeholder="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}/><input placeholder="Ubicacion" value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })}/><input placeholder="Lote" value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })}/><input type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })}/><input placeholder="Area responsable" value={form.area_responsable} onChange={e => setForm({ ...form, area_responsable: e.target.value })}/><input type="date" value={form.fecha_limite} onChange={e => setForm({ ...form, fecha_limite: e.target.value })}/><textarea placeholder="Descripcion" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}/><button>Guardar hallazgo</button>
    </form>}

    <div className="split-view">
      <div className="table-card"><table><thead><tr><th>Nro</th><th>Titulo</th><th>Estado</th><th>Prioridad</th><th>Asignado</th><th>Pedido</th><th>Cliente</th><th>Ubicacion</th><th>SKU</th><th>Cantidad</th></tr></thead><tbody>{items.map(h => <tr key={h.id} className={selected === h.id ? 'selected-row' : ''} onClick={() => openDetail(h.id)}><td>{h.numero}</td><td><b>{h.titulo}</b><br/><small>{h.tipo}</small></td><td><span className="pill">{h.estado}</span></td><td>{h.prioridad}</td><td>{h.asignado_a_nombre || '-'}</td><td>{h.pedido || '-'}</td><td>{h.cliente || '-'}</td><td>{h.ubicacion}</td><td>{h.sku}</td><td>{h.cantidad}</td></tr>)}</tbody></table></div>
      {detail && <div className="panel detail-panel"><form onSubmit={saveDetail} className="form-stack"><div className="detail-head"><h4>{detail.numero}</h4><button className="small"><Save size={14}/> Guardar</button></div><input value={detail.titulo || ''} onChange={e => setDetail({ ...detail, titulo: e.target.value })}/><textarea value={detail.descripcion || ''} onChange={e => setDetail({ ...detail, descripcion: e.target.value })}/><div className="mini-form-grid"><input placeholder="Pedido / Documento" value={detail.pedido || ''} onChange={e => setDetail({ ...detail, pedido: e.target.value })}/><input placeholder="Cliente" value={detail.cliente || ''} onChange={e => setDetail({ ...detail, cliente: e.target.value })}/><select value={detail.estado || 'Abierto'} onChange={e => setDetail({ ...detail, estado: e.target.value })}><option>Abierto</option><option>En investigacion</option><option>Esperando respuesta</option><option>Pendiente validacion</option><option>Cerrado</option></select><select value={detail.prioridad || 'Media'} onChange={e => setDetail({ ...detail, prioridad: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select><select value={detail.asignado_a || ''} onChange={e => setDetail({ ...detail, asignado_a: e.target.value })}><option value="">Auditor...</option>{auditores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select><input type="date" value={detail.fecha_limite || ''} onChange={e => setDetail({ ...detail, fecha_limite: e.target.value })}/></div><textarea placeholder="Resolucion / feedback final" value={detail.feedback || ''} onChange={e => setDetail({ ...detail, feedback: e.target.value })}/></form>
        <div className="panel-sub"><h4><BrainCircuit size={16}/> Asistente IA</h4><div className="row-actions"><button type="button" className="secondary" onClick={generarResumenIA} disabled={aiLoading}>Generar resumen</button><button type="button" className="secondary" onClick={redactarEmailIA} disabled={aiLoading}>Redactar email</button></div>{aiText && <pre className="ai-output">{aiText}</pre>}</div><div className="panel-sub"><h4><MessageSquare size={16}/> Comentarios y feedback</h4><form className="comment-form" onSubmit={(e) => addComment(e)}><textarea placeholder="Dejar comentario o avance de investigacion..." value={comment} onChange={e => setComment(e.target.value)}/><div className="row-actions"><button>Comentar</button><button type="button" className="secondary" onClick={(e) => addComment(e, 'feedback')}>Guardar como feedback</button></div></form>{(detail.comentarios || []).map(c => <div className="comment" key={c.id}><b>{c.usuario_nombre}</b> <small>{c.creado_en}</small><p>{c.comentario}</p></div>)}</div>
        <div className="panel-sub"><h4><Mail size={16}/> Enviar email al responsable</h4><form className="form-stack" onSubmit={prepareEmail}><input placeholder="Para" value={emailForm.to} onChange={e => setEmailForm({ ...emailForm, to: e.target.value })} required/><input placeholder="CC" value={emailForm.cc} onChange={e => setEmailForm({ ...emailForm, cc: e.target.value })}/><input placeholder="Asunto" value={emailForm.subject} onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}/><textarea value={emailForm.body} onChange={e => setEmailForm({ ...emailForm, body: e.target.value })}/><button><Mail size={16}/> Preparar email</button></form></div>
        <div className="panel-sub"><h4>Historial</h4>{(detail.historial || []).map(h => <div className="history" key={h.id}><b>{h.accion}</b> <small>{h.creado_en} - {h.usuario_nombre || 'Sistema'}</small><p>{h.detalle}</p></div>)}</div>
      </div>}
    </div>
  </section>;
}
