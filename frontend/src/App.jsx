import React, { useEffect, useState } from 'react';
import { BarChart3, BellRing, CalendarCheck, ClipboardList, LogOut, MapPin, PackageSearch, Search, Settings, ShieldAlert, Users, Route } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { apiFetch } from './services/api.js';
import { useCompany } from './context/CompanyContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Investigacion from './pages/Investigacion.jsx';
import Hallazgos from './pages/Hallazgos.jsx';
import Admin from './pages/Admin.jsx';
import MonitorPreventivo from './pages/MonitorPreventivo.jsx';
import AuditoriasProgramadas from './pages/AuditoriasProgramadas.jsx';
import ErroresLogisticos from './pages/ErroresLogisticos.jsx';
import Placeholder from './pages/Placeholder.jsx';
import CatalogoAuditoria from './pages/CatalogoAuditoria.jsx';

const menu = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'investigacion', label: 'Centro de Investigacion', icon: Search },
  { key: 'hallazgos', label: 'Hallazgos', icon: ShieldAlert },
  { key: 'monitor', label: 'Monitor Preventivo', icon: BellRing },
  { key: 'auditorias', label: 'Auditorias Programadas', icon: CalendarCheck },
  { key: 'errores-logisticos', label: 'Errores Logisticos', icon: Route },
  { key: 'ubicaciones', label: 'Ubicaciones', icon: MapPin },
  { key: 'productos', label: 'Productos', icon: PackageSearch },
  { key: 'lotes', label: 'Lotes', icon: ClipboardList },
  { key: 'admin', label: 'Administracion', icon: Users, admin: true }
];

export default function App() {
  const { user, logout } = useAuth();
  const { company, setCompany, companies, updateCompanies } = useCompany();
  const [active, setActive] = useState('dashboard');
  const [erpStatus, setErpStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    apiFetch('/erp/status').then(setErpStatus).catch(() => setErpStatus({ label: 'ERP no disponible' }));
    apiFetch('/erp/companies').then(updateCompanies).catch(() => {});
  }, [user, company?.id]);

  if (!user) return <Login />;

  const visibleMenu = menu.filter(item => !item.admin || user.rol === 'Administrador' || user.rol === 'Jefe Auditoria');

  function renderPage() {
    if (active === 'dashboard') return <Dashboard />;
    if (active === 'investigacion') return <Investigacion />;
    if (active === 'hallazgos') return <Hallazgos />;
    if (active === 'monitor') return <MonitorPreventivo />;
    if (active === 'auditorias') return <AuditoriasProgramadas />;
    if (active === 'errores-logisticos') return <ErroresLogisticos />;
    if (active === 'ubicaciones') return <CatalogoAuditoria type="ubicaciones" />;
    if (active === 'productos') return <CatalogoAuditoria type="productos" />;
    if (active === 'lotes') return <CatalogoAuditoria type="lotes" />;
    if (active === 'admin') return <Admin />;
    return <Placeholder title={visibleMenu.find(m => m.key === active)?.label || 'Modulo'} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SGI</div>
          <div>
            <h1>Auditoria</h1>
            <span>Gestion Integral</span>
          </div>
        </div>
        <nav>
          {visibleMenu.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.key} onClick={() => setActive(item.key)} className={active === item.key ? 'active' : ''}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <strong>{user.nombre}</strong>
            <small>{user.rol}</small>
          </div>
          <button className="logout" onClick={logout}><LogOut size={16} /> Salir</button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Sistema de Gestion Integral</p>
            <h2>SGI Auditoria Operativa</h2>
          </div>
          <div className="topbar-actions">
            <label className="company-filter">
              <span>Empresa</span>
              <select value={company?.id || 'all'} onChange={e => setCompany(e.target.value)}>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.analizable === false ? ' - sin stock' : ''}</option>)}
              </select>
            </label>
            <div className="erp-badge"><Settings size={16} /> {erpStatus?.label || 'Verificando...'}</div>
          </div>
        </header>
        {renderPage()}
      </main>
    </div>
  );
}
