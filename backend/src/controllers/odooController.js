import { OdooAdapter } from '../adapters/erp/OdooAdapter.js';

export async function testOdoo(req, res) {
  const adapter = new OdooAdapter();
  const result = await adapter.testConnection();
  res.status(result.ok ? 200 : 400).json(result);
}

export async function listOdooLocations(req, res) {
  const adapter = new OdooAdapter();
  const limit = Number(req.query.limit || 50);
  const q = String(req.query.q || '');
  res.json(await adapter.getLocations(limit, q));
}

export async function listOdooProducts(req, res) {
  const adapter = new OdooAdapter();
  const limit = Number(req.query.limit || 50);
  const q = String(req.query.q || '');
  res.json(await adapter.getProducts(limit, q));
}
