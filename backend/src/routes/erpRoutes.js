import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getErpStatus, getCompanies } from '../controllers/erpController.js';

const router = Router();
router.use(authRequired);
router.get('/status', getErpStatus);
router.get('/companies', getCompanies);
export default router;
