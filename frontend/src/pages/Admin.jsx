import React, { useEffect, useState } from 'react';
import { KeyRound, Trash2, UserPlus, Save } from 'lucide-react';
import { apiFetch } from '../services/api.js';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'Auditor' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [odooStatus, setOdooStatus] = useState(null);
  const [testingOdoo, setTestingOdoo] = useState(false);
  const [editing, setEditing] = useState({});
  const [passwords, setPasswords] = useState({});

  function load() {
    apiFetch('/users').then(rows => {
      setUsers(rows);
      const map = {};
      for (const u of rows) map[u.id] = { nombre: u.nombre, email: u.email, rol: u.rol, activo: Boolean(u.activo) };
      setEditing(map);
    }).catch(() => setUsers([]));
    apiFetch('/users/roles').then(setRoles).catch(() => setRoles([]));
  }
  useEffect(load, []);

  async function create(e) {
    e.preventDefault(); setError(''); setMessage('');
    try {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ nombre: '', email: '', password: '', rol: 'Auditor' });
      setMessage('Usuario creado correctamente.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function saveUser(id) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(editing[id]) });
      setMessage('Usuario actualizado.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function changePassword(id) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password: passwords[id] || '' }) });
      setPasswords(prev => ({ ...prev, [id]: '' }));
      setMessage('Contraseña actualizada.');
    } catch (err) { setError(err.message); }
  }

  async function deleteUser(id) {
    if (!confirm('¿Eliminar o desactivar este usuario?')) return;
    setError(''); setMessage('');
    try {
      const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
      setMessage(res.message || 'Usuario eliminado.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function testOdoo() {
    setTestingOdoo(true);
    setOdooStatus(null);
    try {
      const result = await apiFetch('/odoo/test');
      setOdooStatus({ ok: true, text: `Conexión ERP OK - Base: ${result.database} - Usuario: ${result.user}` });
    } catch (err) {
      setOdooStatus({ ok: false, text: err.message });
    } finally {
      setTestingOdoo(false);
    }
  }

  function edit(id, key, value) {
    setEditing(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  }

  return (
    <section className="page">
      <div className="section-title"><div><h3>Administración</h3><p>Gestión de usuarios, roles y conexión de datos.</p></div></div>
      {message && <div className="success-box">{message}</div>}
      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        <h4>Conexión ERP</h4>
        <p className="muted">Verificación de conectividad con la fuente de datos.</p>
        <button type="button" onClick={testOdoo} disabled={testingOdoo}>{testingOdoo ? 'Verificando...' : 'Verificar conexión'}</button>
        {odooStatus && <div className={odooStatus.ok ? 'success-box' : 'error-box'}>{odooStatus.text}</div>}
      </div>

      <div className="panel">
        <h4><UserPlus size={18}/> Crear usuario</h4>
        <form className="form-grid" onSubmit={create}>
          <input placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Contraseña" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>{roles.map(r => <option key={r.id}>{r.nombre}</option>)}</select>
          <button>Crear</button>
        </form>
      </div>

      <div className="table-card users-admin-table">
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Activo</th><th>Cambiar contraseña</th><th>Acciones</th></tr></thead>
          <tbody>{users.map(u => <tr key={u.id}>
            <td><input value={editing[u.id]?.nombre || ''} onChange={e => edit(u.id, 'nombre', e.target.value)} /></td>
            <td><input value={editing[u.id]?.email || ''} onChange={e => edit(u.id, 'email', e.target.value)} /></td>
            <td><select value={editing[u.id]?.rol || u.rol} onChange={e => edit(u.id, 'rol', e.target.value)}>{roles.map(r => <option key={r.id}>{r.nombre}</option>)}</select></td>
            <td><select value={editing[u.id]?.activo ? '1' : '0'} onChange={e => edit(u.id, 'activo', e.target.value === '1')}><option value="1">Sí</option><option value="0">No</option></select></td>
            <td><div className="inline-actions"><input type="password" placeholder="Nueva contraseña" value={passwords[u.id] || ''} onChange={e => setPasswords(prev => ({ ...prev, [u.id]: e.target.value }))}/><button className="small secondary" onClick={() => changePassword(u.id)} type="button"><KeyRound size={14}/> Cambiar</button></div></td>
            <td><div className="inline-actions"><button className="small" type="button" onClick={() => saveUser(u.id)}><Save size={14}/> Guardar</button><button className="small secondary danger-button" type="button" onClick={() => deleteUser(u.id)}><Trash2 size={14}/> Eliminar</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
