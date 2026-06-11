import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import {
  assignAlerta,
  createHallazgoFromAlerta,
  createRegla,
  deleteAbc,
  ejecutarBarrido,
  getMonitorResumen,
  listAbc,
  listAlertas,
  importAbc,
  listDestinatarios,
  listReglas,
  saveAbc,
  saveDestinatario,
  updateAlerta,
  updateRegla,
  listPicksIncompletos,
  listPickOutDiferencias
} from '../controllers/monitorController.js';

const router = Router();
router.use(authRequired);
router.get('/resumen', getMonitorResumen);
router.get('/alertas', listAlertas);
router.get('/picks-incompletos', listPicksIncompletos);
router.get('/picks-diferencias', listPickOutDiferencias);
router.put('/alertas/:id', updateAlerta);
router.post('/alertas/:id/hallazgo', createHallazgoFromAlerta);
router.post('/alertas/:id/asignar', assignAlerta);
router.post('/barrido', ejecutarBarrido);
router.get('/abc', listAbc);
router.post('/abc', saveAbc);
router.post('/abc/import', importAbc);
router.delete('/abc/:id', deleteAbc);
router.get('/reglas', listReglas);
router.post('/reglas', createRegla);
router.put('/reglas/:id', updateRegla);
router.get('/destinatarios', listDestinatarios);
router.post('/destinatarios', saveDestinatario);
export default router;
