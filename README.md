# SGI Auditoría Operativa

Sistema de auditoría operativa con investigación avanzada, monitor preventivo, hallazgos, auditorías programadas, errores logísticos y asistencia IA opcional.

## Instalación

```powershell
npm install
npm run seed
npm run dev
```

## IA opcional

Para usar IA local con Ollama:

```env
AI_ENABLED=true
AI_PROVIDER=ollama-local
AI_MODEL=llama3.1:8b
OLLAMA_URL=http://localhost:11434
```

Para Ollama Cloud:

```env
AI_ENABLED=true
AI_PROVIDER=ollama-cloud
AI_MODEL=gpt-oss:120b
AI_API_KEY=PEGAR_CLAVE_NUEVA
OLLAMA_CLOUD_URL=https://ollama.com
```

No se incluyen claves reales en el paquete.
