import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-hero">
          <div className="hero-icon"><ShieldCheck size={42} /></div>
          <h1>SGI Auditoria</h1>
          <p>Auditoria operativa, trazabilidad de stock y gestion de hallazgos.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <h2>Ingresar</h2>
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
          <label>Contrasena</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <div className="error-box">{error}</div>}
          <button disabled={loading}>{loading ? 'Ingresando...' : 'Iniciar sesion'}</button>
        </form>
      </div>
    </div>
  );
}
