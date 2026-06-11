import { env } from '../config/env.js';
import { MockAdapter } from '../adapters/erp/MockAdapter.js';
import { OdooAdapter } from '../adapters/erp/OdooAdapter.js';
import { NetSuiteAdapter } from '../adapters/erp/NetSuiteAdapter.js';

export function hasOdooConfig() {
  return !!(env.odoo.host && env.odoo.database && env.odoo.user && env.odoo.password);
}

export function getErpProviderName() {
  const requested = String(env.erpProvider || 'auto').toLowerCase().trim();

  if (requested === 'netsuite') return 'netsuite';
  if (requested === 'odoo') return 'odoo';
  if (hasOdooConfig()) return 'odoo';
  return 'mock';
}

export function getErpAdapter() {
  const provider = getErpProviderName();
  if (provider === 'odoo') return new OdooAdapter();
  if (provider === 'netsuite') return new NetSuiteAdapter();
  return new MockAdapter();
}

export function getErpDebugInfo() {
  const provider = getErpProviderName();
  return {
    provider,
    requestedProvider: env.erpProvider,
    odooConfigured: hasOdooConfig(),
    odooDatabase: env.odoo.database || null,
    odooUser: env.odoo.user || null
  };
}
