import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { aiStatus, analizarInvestigacion, resumirHallazgo, redactarEmailHallazgo, informeGerencial } from '../controllers/aiController.js';

const router = Router();
router.use(authRequired);
router.get('/status', aiStatus);
router.post('/investigacion', analizarInvestigacion);
router.post('/hallazgos/:id/resumen', resumirHallazgo);
router.post('/hallazgos/:id/email', redactarEmailHallazgo);
router.post('/informe-gerencial', informeGerencial);
export default router;
