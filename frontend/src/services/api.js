const VITE_API_URL=https://sgi-auditoria.onrender.com/api

export default API_URL;

export const COMPANIES = [
  { id: 'all', name: 'Todas', analizable: true },
  { id: 'LH', name: 'LH', analizable: true },
  { id: 'GRAM SAS', name: 'GRAM SAS', analizable: true },
  { id: 'RODAMAX', name: 'RODAMAX', analizable: true },
  { id: 'BICI', name: 'BICI', analizable: false }
];

export function getSelectedCompany() {
  try { return JSON.parse(localStorage.getItem('sgi_auditoria_company') || '{\"id\":\"all\",\"name\":\"Todas\"}'); } catch (_) { return { id: 'all', name: 'Todas' }; }
}

function addCompanyToPath(path) {
  const company = getSelectedCompany();
  if (!company || !company.id || company.id === 'all') return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}company_id=${encodeURIComponent(company.id)}&company_name=${encodeURIComponent(company.name || company.id)}`;
}

export function getToken() {
  return localStorage.getItem('sgi_auditoria_token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const finalPath = addCompanyToPath(path);
  const company = getSelectedCompany();
  const res = await fetch(`${API_URL}${finalPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(company?.id && company.id !== 'all' ? { 'X-Company-Id': String(company.id), 'X-Company-Name': String(company.name || company.id) } : {}),
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Error de comunicacion con la API');
  return data;
}
