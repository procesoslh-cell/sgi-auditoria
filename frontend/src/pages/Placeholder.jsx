import React from 'react';

export default function Placeholder({ title }) {
  return (
    <section className="page">
      <div className="section-title"><div><h3>{title}</h3><p>Modulo preparado para la siguiente iteracion del .</p></div></div>
      <div className="panel empty-state">
        <h4>Proxima version</h4>
        <p>Este modulo quedo reservado para profundizar trazabilidad, saldos, lotes y reportes cuando conectemos Odoo con datos reales.</p>
      </div>
    </section>
  );
}
