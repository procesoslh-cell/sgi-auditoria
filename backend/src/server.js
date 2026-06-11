import { app } from './app.js';
import { env } from './config/env.js';
import { initSchema } from './db/schema.js';

await initSchema();
app.listen(env.port, () => {
  console.log(`SGI Auditoria API escuchando en http://localhost:${env.port}`);
});
