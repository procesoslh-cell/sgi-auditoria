import { ErpAdapter } from './ErpAdapter.js';

const movements = [
  { id: 1, fecha: '2025-11-18 11:44:43', tipo: 'Transferencia interna', origen: '1-ALTZ1/C0-165-41', destino: 'AUDITORIA/C0-164-01', sku: 'SKU-DEMO-001', producto: 'Producto demo auditoria', lote: 'P01080/09014', cantidad: 1174, usuario: 'Sistema/Odoo', documento: 'TR-DEMO-001' },
  { id: 2, fecha: '2026-03-14 09:22:10', tipo: 'Ajuste positivo', origen: 'Virtual Locations/Inventory adjustment', destino: 'AUDITORIA/C0-164-01', sku: 'SKU-DEMO-001', producto: 'Producto demo auditoria', lote: 'P01080/09014', cantidad: 90, usuario: 'Agustina', documento: 'AJ-DEMO-090' },
  { id: 3, fecha: '2026-04-11 13:57:36', tipo: 'Ajuste negativo', origen: 'AUDITORIA/C0-164-01', destino: 'Virtual Locations/Inventory adjustment', sku: 'SKU-DEMO-001', producto: 'Producto demo auditoria', lote: 'P01080/09014', cantidad: -101, usuario: 'David Dellamea', documento: 'AJ-DEMO-101' },
  { id: 4, fecha: '2026-05-03 10:10:00', tipo: 'Pick-Pack-Out', origen: 'AUDITORIA/C0-164-01', destino: 'Partners/Customers', sku: 'SKU-DEMO-001', producto: 'Producto demo auditoria', lote: 'P01080/09014', cantidad: -1163, usuario: 'Operador Expedicion', documento: 'PICK-DEMO-001' }
];

export class MockAdapter extends ErpAdapter {
  async search(query) {
    const q = String(query || '').toLowerCase();
    const data = movements.filter(m => Object.values(m).some(v => String(v).toLowerCase().includes(q)));
    return this.buildResponse(query, data.length ? data : movements);
  }

  async getLocationHistory(location) {
    return this.buildResponse(location, movements.filter(m => m.origen === location || m.destino === location));
  }

  async getSkuHistory(sku) {
    return this.buildResponse(sku, movements.filter(m => m.sku === sku));
  }

  async getLotHistory(lot) {
    return this.buildResponse(lot, movements.filter(m => m.lote === lot));
  }

  buildResponse(query, rows) {
    const entradas = rows.filter(r => r.cantidad > 0).reduce((a, r) => a + Number(r.cantidad), 0);
    const salidas = rows.filter(r => r.cantidad < 0).reduce((a, r) => a + Math.abs(Number(r.cantidad)), 0);
    return {
      query,
      provider: 'mock',
      resumen: {
        movimientos: rows.length,
        entradas,
        salidas,
        balance: entradas - salidas,
        alerta: entradas - salidas === 0 ? 'Balance cerrado' : 'Revisar diferencia'
      },
      analisis: {
        estado: entradas - salidas === 0 ? 'Balance cerrado' : 'Diferencia detectada',
        severidad: Math.abs(entradas - salidas) > 50 ? 'alta' : 'media',
        kpis: {
          entradas,
          salidas,
          entradas_operativas: 1174,
          salidas_operativas: 1163,
          ajustes_positivos: 90,
          ajustes_negativos: 101,
          balance: entradas - salidas,
          diferencia_neta_ajustes: 11,
          posible_diferencia: 11,
          movimientos_analizados: rows.length,
          picks_o_salidas_cliente: 1
        },
        timeline_agrupado: [
          { titulo: 'Entrada inicial / transferencia', fecha: '2025-11-18', cantidad: 1174, detalle: 'Transferencia desde 1-ALTZ1/C0-165-41', tipo: 'entrada' },
          { titulo: 'Ajuste positivo / sobrante', fecha: '2026-03-14', cantidad: 90, detalle: 'Alta fisica detectada por auditoria', tipo: 'ajuste_positivo' },
          { titulo: 'Salidas por picks / despachos', fecha: '2026-03-14 a 2026-05-21', cantidad: 1163, detalle: 'Operaciones de venta/despacho agrupadas', tipo: 'salida' },
          { titulo: 'Ajuste negativo / faltante', fecha: '2026-05-21', cantidad: 101, detalle: 'Baja fisica por recuento ciclico', tipo: 'ajuste_negativo' }
        ],
        interpretacion: [
          'La ubicacion recibio una transferencia inicial y luego tuvo ajustes de auditoria.',
          'Los ajustes positivos y negativos no compensan exactamente: la diferencia neta es de 11 unidades.',
          'El análisis resume, interpreta y concluye antes de mostrar el detalle operativo.'
        ],
        conclusion: 'Aunque el balance cierre, existe una diferencia neta de ajustes por 11 unidades.',
        sugerir_hallazgo: true,
        hallazgo_sugerido: { tipo: 'Diferencia de inventario', prioridad: 'Media', cantidad: 11, titulo: `Diferencia detectada en ${query}`, descripcion: 'Diferencia neta de ajustes por 11 unidades.' }
      },
      timeline: rows.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    };
  }
}
