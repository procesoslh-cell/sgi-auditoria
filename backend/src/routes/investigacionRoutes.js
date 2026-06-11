import { Router } from 'express';
import { recentInvestigations, searchInvestigation } from '../controllers/investigacionController.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
router.get('/buscar', searchInvestigation);
router.get('/recientes', recentInvestigations);
export default router;
