import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { testOdoo, listOdooLocations, listOdooProducts } from '../controllers/odooController.js';

const router = Router();
router.use(authRequired);
router.get('/test', requireRole('Administrador'), testOdoo);
router.get('/locations', listOdooLocations);
router.get('/products', listOdooProducts);

export default router;
