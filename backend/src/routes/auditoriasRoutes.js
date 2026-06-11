import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createAuditoria, createHallazgoFromAuditoria, listAuditorias, updateAuditoria } from '../controllers/auditoriasController.js';

const router = Router();
router.use(authRequired);
router.get('/', listAuditorias);
router.post('/', createAuditoria);
router.put('/:id', updateAuditoria);
router.post('/:id/hallazgo', createHallazgoFromAuditoria);
export default router;
