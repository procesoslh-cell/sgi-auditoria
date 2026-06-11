import { env } from '../config/env.js';
import { getErpProviderName, hasOdooConfig, getErpDebugInfo, getErpAdapter } from '../services/erpService.js';

export function getErpStatus(req, res) {
  const provider = getErpProviderName();
  const debug = getErpDebugInfo();
  res.json({
    provider,
    configured: provider === 'odoo' ? hasOdooConfig() : true,
    requestedProvider: env.erpProvider,
    database: provider === 'odoo' ? env.odoo.database : null,
    user: provider === 'odoo' ? env.odoo.user : null,
    label: provider === 'odoo' ? `Odoo conectado (${env.odoo.database || 'sin base'})` : provider === 'mock' ? 'Modo demostración' : 'NetSuite preparado',
    debug
  });
}

export async function getCompanies(_req, res, next) {
  try {
    const adapter = getErpAdapter();
    if (typeof adapter.getCompanies === 'function') return res.json(await adapter.getCompanies());
    res.json([{ id: 'all', name: 'Todas', analizable: true }, { id: 'LH', name: 'LH', analizable: true }, { id: 'GRAM SAS', name: 'GRAM SAS', analizable: true }, { id: 'RODAMAX', name: 'RODAMAX', analizable: true }, { id: 'BICI', name: 'BICI', analizable: false }]);
  } catch (err) { next(err); }
}
