import bcrypt from 'bcryptjs';
import { all, get, run } from '../db/database.js';

export async function listUsers(req, res) {
  const users = await all(`SELECT u.id, u.nombre, u.email, u.activo, u.creado_en, r.nombre as rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.activo DESC, u.id DESC`);
  res.json(users);
}

export async function createUser(req, res) {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !rol) return res.status(400).json({ message: 'Faltan campos requeridos' });
  const role = await get('SELECT id FROM roles WHERE nombre = ?', [rol]);
  if (!role) return res.status(400).json({ message: 'Rol invalido' });
  const exists = await get('SELECT id FROM usuarios WHERE lower(email) = lower(?)', [email]);
  if (exists) return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
  const hash = await bcrypt.hash(password, 10);
  const result = await run('INSERT INTO usuarios(nombre, email, password_hash, rol_id, activo) VALUES (?, ?, ?, ?, 1)', [nombre, email, hash, role.id]);
  res.status(201).json({ id: result.id, nombre, email, rol, activo: 1 });
}

export async function updateUser(req, res) {
  const { nombre, email, rol, activo } = req.body || {};
  const user = await get('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  const role = await get('SELECT id FROM roles WHERE nombre = ?', [rol || 'Auditor']);
  if (!role) return res.status(400).json({ message: 'Rol invalido' });
  await run('UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=? WHERE id=?', [nombre || user.nombre, email || user.email, role.id, activo === false || activo === 0 ? 0 : 1, req.params.id]);
  res.json({ message: 'Usuario actualizado' });
}

export async function changePassword(req, res) {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
  const user = await get('SELECT id FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  const hash = await bcrypt.hash(password, 10);
  await run('UPDATE usuarios SET password_hash=? WHERE id=?', [hash, req.params.id]);
  res.json({ message: 'Contraseña actualizada' });
}

export async function deleteUser(req, res) {
  const user = await get('SELECT id FROM usuarios WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  if (Number(req.params.id) === Number(req.user?.id)) return res.status(400).json({ message: 'No podés eliminar tu propio usuario' });
  try {
    await run('DELETE FROM usuarios WHERE id=?', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (_) {
    await run('UPDATE usuarios SET activo=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Usuario desactivado porque tiene actividad asociada' });
  }
}

export async function listRoles(req, res) {
  res.json(await all('SELECT * FROM roles ORDER BY id'));
}
