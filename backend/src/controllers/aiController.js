import { get } from '../db/database.js';
import { runAiTask, buildEmailPrompt } from '../services/aiService.js';

export async function aiStatus(_req, res) {
  res.json({ ok: true, enabled: process.env.AI_ENABLED === 'true', provider: process.env.AI_PROVIDER || 'ollama-local', model: process.env.AI_MODEL || 'llama3.1:8b' });
}

export async function analizarInvestigacion(req, res, next) {
  try {
    const result = await runAiTask('Analizar una investigación de auditoría y generar una conclusión operativa.', req.body || {});
    res.json(result);
  } catch (err) { next(err); }
}

export async function resumirHallazgo(req, res, next) {
  try {
    const hallazgo = await get('SELECT * FROM hallazgos WHERE id = ?', [req.params.id]);
    if (!hallazgo) return res.status(404).json({ message: 'Hallazgo no encontrado' });
    const result = await runAiTask('Resumir un hallazgo para auditoría y sugerir próximos pasos.', hallazgo);
    res.json(result);
  } catch (err) { next(err); }
}

export async function redactarEmailHallazgo(req, res, next) {
  try {
    const hallazgo = await get('SELECT * FROM hallazgos WHERE id = ?', [req.params.id]);
    if (!hallazgo) return res.status(404).json({ message: 'Hallazgo no encontrado' });
    const result = await runAiTask(buildEmailPrompt(hallazgo), { hallazgo, instrucciones: req.body?.instrucciones || '' });
    res.json(result);
  } catch (err) { next(err); }
}

export async function informeGerencial(req, res, next) {
  try {
    const result = await runAiTask('Generar un informe gerencial semanal de auditoría en formato ejecutivo.', req.body || {});
    res.json(result);
  } catch (err) { next(err); }
}
