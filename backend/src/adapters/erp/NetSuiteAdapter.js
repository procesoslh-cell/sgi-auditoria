import { ErpAdapter } from './ErpAdapter.js';

export class NetSuiteAdapter extends ErpAdapter {
  async search(query) {
    return {
      provider: 'netsuite',
      query,
      resumen: { movimientos: 0, entradas: 0, salidas: 0, balance: 0, alerta: 'NetSuiteAdapter preparado para futura migracion' },
      timeline: []
    };
  }
}
