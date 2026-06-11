import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useCompany } from '../context/CompanyContext.jsx';
import { apiFetch } from '../services/api.js';
import { exportRowsToExcel } from '../utils/exportExcel.js';

const initial = { titulo: '', descripcion: '', tipo: 'Revision preventiva', prioridad: 'Media', estado: 'Pendiente', sku: '', ubicacion: '', lote: '', pedido: '', cliente: '', cantidad: 0, auditor_id: '', fecha_limite: '' };

export default function AuditoriasProgramadas() {
  const { company } = useCompany();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initial);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const [a, u] = await Promise.all([apiFetch('/auditorias'), apiFetch('/users')]);
    setItems(a); setUsers(u);
  }
  useEffect(() => { load().catch(() => {}); }, [company?.id]);
  const auditores = useMemo(() => users.filter(u => ['Auditor', 'Jefe Auditoria'].includes(u.rol)), [users]);

  async function submit(e) {
    e.preventDefault();
    await apiFetch('/auditorias', { method: 'POST', body: JSON.stringify(form) });
    setForm(initial); setShow(false); setMessage('Auditoria programada creada.'); await load();
  }

  async function update(item, patch) {
    await apiFetch(`/auditorias/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, ...patch }) });
    await load();
  }

  async function crearHallazgo(item) {
    const res = await apiFetch(`/auditorias/${item.id}/hallazgo`, { method: 'POST', body: JSON.stringify({}) });
    setMessage(`Hallazgo creado: ${res.numero}`); await load();
  }

  return <section className="page">
    <div className="section-title"><div><h3>Auditorias Programadas</h3><p>Planificacion de tareas para David, Carlos y el equipo de Auditoria.</p></div><div className="row-actions"><button className="secondary" onClick={() => exportRowsToExcel('auditorias-programadas.xlsx', items, 'Auditorias')}><Download size={17}/> Exportar</button><button onClick={() => setShow(!show)}><Plus size={17}/> Nueva auditoria</button></div></div>
    {message && <div className="success-box">{message}</div>}
    {show && <form className="form-grid panel" onSubmit={submit}>
      <input placeholder="Titulo" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} required />
      <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option>Revision preventiva</option><option>Diferencia de stock</option><option>Recuento ciclico</option><option>Pick incompleto</option><option>Mercaderia detenida</option></select>
      <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}><option>Baja</option><option>Media</option><option>Alta</option><option>Critica</option></select>
      <select value={form.auditor_id} onChange={e => setForm({ ...form, auditor_id: e.target.value })}><option value="">Asignar auditor...</option>{auditores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
      <input placeholder="Pedido / Documento" value={form.pedido} onChange={e => setForm({ ...form, pedido: e.target.value })}/>
      <input placeholder="Cliente" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })}/>
      <input placeholder="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}/>
      <input placeholder="Ubicacion" value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })}/>
      <input placeholder="Lote" value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })}/>
      <input type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })}/>
      <input type="date" value={form.fecha_limite} onChange={e => setForm({ ...form, fecha_limite: e.target.value })}/>
      <textarea placeholder="Descripcion / instrucciones" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}/>
      <button>Programar auditoria</button>
    </form>}
    <div className="table-card"><table><thead><tr><th>Nro</th><th>Tarea</th><th>Auditor</th><th>Prioridad</th><th>Estado</th><th>Pedido</th><th>Cliente</th><th>SKU</th><th>Ubicacion</th><th>Vence</th><th>Acciones</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.numero}</td><td><b>{item.titulo}</b><br/><small>{item.descripcion}</small></td><td>{item.auditor_nombre || '-'}</td><td>{item.prioridad}</td><td><select value={item.estado} onChange={e => update(item, { estado: e.target.value })}><option>Pendiente</option><option>En curso</option><option>Esperando respuesta</option><option>Resuelto</option><option>Cerrado</option></select></td><td>{item.pedido || '-'}</td><td>{item.cliente || '-'}</td><td>{item.sku || '-'}</td><td>{item.ubicacion || '-'}</td><td>{item.fecha_limite || '-'}</td><td className="row-actions"><select value={item.auditor_id || ''} onChange={e => update(item, { auditor_id: e.target.value })}><option value="">Auditor...</option>{auditores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>{!item.hallazgo_id && <button className="small" onClick={() => crearHallazgo(item)}>Hallazgo</button>}</td></tr>)}</tbody></table></div>
  </section>;
}
