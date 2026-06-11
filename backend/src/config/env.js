import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4001),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  dbPath: process.env.DB_PATH || './data/sgi-auditoria.sqlite',
  // auto: si hay variables Odoo, usa Odoo; si no, usa mock.
  erpProvider: process.env.ERP_PROVIDER || 'auto',
  odoo: {
    host: process.env.ODOO_DB_HOST,
    port: Number(process.env.ODOO_DB_PORT || 5432),
    database: process.env.ODOO_DB_NAME,
    user: process.env.ODOO_DB_USER,
    password: process.env.ODOO_DB_PASSWORD,
    ssl: process.env.ODOO_DB_SSL === 'true'
  },
  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'ollama-local',
    model: process.env.AI_MODEL || 'llama3.1:8b',
    apiKey: process.env.AI_API_KEY || process.env.OLLAMA_API_KEY || '',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaCloudUrl: process.env.OLLAMA_CLOUD_URL || 'https://ollama.com'
  }
};
