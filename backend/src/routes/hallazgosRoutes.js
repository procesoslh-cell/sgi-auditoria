import { Router } from 'express';
import { addComment, createHallazgo, getHallazgo, listHallazgos, prepareEmail, updateHallazgo } from '../controllers/hallazgosController.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
router.get('/', listHallazgos);
router.post('/', createHallazgo);
router.get('/:id', getHallazgo);
router.put('/:id', updateHallazgo);
router.post('/:id/comentarios', addComment);
router.post('/:id/email', prepareEmail);
export default router;
