import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get } from '../db/database.js';
import { env } from '../config/env.js';

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email y password son requeridos' });

  const user = await get(`SELECT u.*, r.nombre as rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.email = ?`, [email]);
  if (!user || !user.activo) return res.status(401).json({ message: 'Credenciales invalidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Credenciales invalidas' });

  const payload = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: '10h' });
  res.json({ token, user: payload });
}

export function me(req, res) {
  res.json({ user: req.user });
}
