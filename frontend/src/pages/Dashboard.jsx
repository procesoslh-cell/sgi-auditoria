import React, { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock, MapPin, Package, ShieldAlert } from 'lucide-react';
import { useCompany } from '../context/CompanyContext.jsx';
import { apiFetch } from '../services/api.js';

export default function Dashboard() {
  const { company } = useCompany();
  const [hallazgos, setHallazgos] = useState([]);
  const [monitor, setMonitor] = useState(null);
  useEffect(() => {
    apiFetch('/hallazgos').then(setHallazgos).catch(() => setHallazgos([]));
    apiFetch('/monitor/resumen').then(setMonitor).catch(() => setMonitor(null));
  }, [company?.id]);

  const abiertos = hallazgos.filter(h => h.estado !== 'Cerrado').length;
  const criticos = hallazgos.filter(h => h.prioridad === 'Critica' || h.prioridad === 'Alta').length;
  const skuAbc = (monitor?.sku_abc || []).reduce((a, x) => a + Number(x.total || 0), 0);

  return (
    <section className="page">
      <div className="section-title">
        <div><h3>Dashboard ejecutivo</h3><p>Vision general de Auditoria Operativa y Monitor Preventivo.</p></div>
      </div>
      <div className="kpi-grid">
        <Kpi icon={ShieldAlert} label="Hallazgos abiertos" value={abiertos} tone="danger" />
        <Kpi icon={AlertTriangle} label="Hallazgos criticos/altos" value={criticos} tone="warning" />
        <Kpi icon={BellRing} label="Alertas preventivas" value={monitor?.total_alertas || 0} tone="warning" />
        <Kpi icon={AlertTriangle} label="Alertas criticas" value={monitor?.criticas || 0} tone="danger" />
        <Kpi icon={Package} label="SKU ABC activos" value={skuAbc} />
        <Kpi icon={CheckCircle2} label="ERP" value="Odoo" tone="success" />
      </div>
      <div className="panel two-col">
        <div>
          <h4>Gestion preventiva de Auditoria</h4>
          <p>Alertas, hallazgos y auditorias programadas integradas en un mismo flujo de trabajo.</p>
          <p className="muted">Ultimo barrido: {monitor?.ultimo_barrido?.creado_en || 'sin barridos ejecutados'}</p>
        </div>
        <div className="mini-flow">
          <span>Odoo</span><b>→</b><span>Reglas</span><b>→</b><span>Alertas</span><b>→</b><span>Hallazgo</span>
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone = '' }) {
  return <div className={`kpi ${tone}`}><Icon size={24} /><span>{label}</span><strong>{value}</strong></div>;
}
