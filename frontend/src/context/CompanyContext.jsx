import React, { createContext, useContext, useMemo, useState } from 'react';
import { COMPANIES, getSelectedCompany } from '../services/api.js';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState(COMPANIES);
  const [company, setCompanyState] = useState(getSelectedCompany());

  function setCompany(next) {
    const selected = companies.find(c => String(c.id) === String(next)) || COMPANIES.find(c => String(c.id) === String(next)) || companies[0] || COMPANIES[0];
    setCompanyState(selected);
    localStorage.setItem('sgi_auditoria_company', JSON.stringify(selected));
    window.dispatchEvent(new CustomEvent('sgi-company-change', { detail: selected }));
  }

  function updateCompanies(list = []) {
    if (!Array.isArray(list) || !list.length) return;
    setCompanies(list);
    const current = getSelectedCompany();
    const exists = list.find(c => String(c.id) === String(current.id));
    if (!exists) setCompanyState(list[0]);
  }

  const value = useMemo(() => ({ company, setCompany, companies, updateCompanies }), [company, companies]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  return useContext(CompanyContext);
}
