import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { listLotes, listProductos, listUbicaciones } from '../controllers/catalogController.js';

const router = Router();
router.use(authRequired);
router.get('/ubicaciones', listUbicaciones);
router.get('/productos', listProductos);
router.get('/lotes', listLotes);
export default router;
