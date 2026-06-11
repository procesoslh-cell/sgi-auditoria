import { env } from '../config/env.js';

function compact(value, max = 12000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...contenido reducido...` : text;
}

function buildPrompt(task, payload = {}) {
  return `Sos un asistente de auditoría operativa para inventario y logística.\nRespondé en español argentino, claro y accionable.\nNo inventes datos: usá únicamente la información entregada.\nSi falta información, indicalo.\n\nTarea: ${task}\n\nDatos del sistema:\n${compact(payload)}\n\nFormato esperado:\n- Resumen breve\n- Posible causa\n- Riesgo operativo\n- Recomendación\n- Próxima acción sugerida`;
}

async function callOllama(endpoint, body, headers = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`IA no disponible (${response.status}). ${detail}`.trim());
  }
  return response.json();
}

export async function runAiTask(task, payload = {}) {
  if (!env.ai.enabled) {
    const err = new Error('IA desactivada. Configurar AI_ENABLED=true en backend/.env.');
    err.statusCode = 400;
    throw err;
  }
  const prompt = buildPrompt(task, payload);
  const provider = env.ai.provider;
  const model = env.ai.model;

  if (provider === 'ollama-cloud') {
    if (!env.ai.apiKey) {
      const err = new Error('Falta AI_API_KEY para Ollama Cloud.');
      err.statusCode = 400;
      throw err;
    }
    const data = await callOllama(`${env.ai.ollamaCloudUrl.replace(/\/$/, '')}/api/generate`, {
      model,
      prompt,
      stream: false
    }, { Authorization: `Bearer ${env.ai.apiKey}` });
    return { provider, model, text: data.response || '' };
  }

  const data = await callOllama(`${env.ai.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
    model,
    prompt,
    stream: false
  });
  return { provider: 'ollama-local', model, text: data.response || '' };
}

export function buildEmailPrompt(hallazgo = {}) {
  return `Redactá un email profesional para solicitar respuesta sobre este hallazgo.\nDebe ser claro, breve y editable por el auditor.\nNo agregues destinatarios inventados.\nIncluí pedido, cliente, SKU, ubicación y cantidad si existen.`;
}
