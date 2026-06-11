import { Router } from 'express';
import { changePassword, createUser, deleteUser, listRoles, listUsers, updateUser } from '../controllers/usersController.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
router.get('/', requireRole('Administrador', 'Jefe Auditoria'), listUsers);
router.post('/', requireRole('Administrador'), createUser);
router.put('/:id', requireRole('Administrador'), updateUser);
router.patch('/:id/password', requireRole('Administrador'), changePassword);
router.delete('/:id', requireRole('Administrador'), deleteUser);
router.get('/roles', requireRole('Administrador', 'Jefe Auditoria'), listRoles);
export default router;
