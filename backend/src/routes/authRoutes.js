import { Router } from 'express';
import { login, me } from '../controllers/authController.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.post('/login', login);
router.get('/me', authRequired, me);
export default router;
