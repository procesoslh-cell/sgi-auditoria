import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import hallazgosRoutes from './routes/hallazgosRoutes.js';
import investigacionRoutes from './routes/investigacionRoutes.js';
import odooRoutes from './routes/odooRoutes.js';
import erpRoutes from './routes/erpRoutes.js';
import monitorRoutes from './routes/monitorRoutes.js';
import auditoriasRoutes from './routes/auditoriasRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

export const app = express();
app.use(cors({ origin: (origin, cb) => {
  if (!origin || origin === env.corsOrigin || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return cb(null, true);
  return cb(null, false);
}, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use((req, _res, next) => {
  req.company = {
    id: req.query.company_id || req.headers['x-company-id'] || null,
    name: req.query.company_name || req.headers['x-company-name'] || null
  };
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'SGI Auditoria', version: '0.9.1' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/hallazgos', hallazgosRoutes);
app.use('/api/investigacion', investigacionRoutes);
app.use('/api/odoo', odooRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/auditorias', auditoriasRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/ia', aiRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Error interno', detail: err.message });
});
