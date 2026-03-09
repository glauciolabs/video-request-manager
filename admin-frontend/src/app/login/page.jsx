'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthMode, saveAdminToken } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

export default function AdminLoginPage() {
  const router = useRouter();
  const mode = getAuthMode();
  const [email, setEmail] = useState('admin@local.dev');
  const [password, setPassword] = useState('admin123');
  const [entraToken, setEntraToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginLocal = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok || !data?.token) {
        throw new Error(data?.error || `API ${response.status}`);
      }

      saveAdminToken(data.token);
      router.replace('/');
    } catch {
      setError('Falha no login local. Verifique usuário/senha.');
    } finally {
      setLoading(false);
    }
  };

  const saveEntra = (event) => {
    event.preventDefault();
    if (!entraToken.trim()) {
      setError('Informe o access token do Entra ID.');
      return;
    }
    saveAdminToken(entraToken.trim());
    router.replace('/');
  };

  return (
    <section className="panel auth-panel">
      <h1>Login administrativo</h1>
      <p className="muted">Modo atual: <strong>{mode}</strong></p>
      {error && <p className="error">{error}</p>}

      {mode === 'local' && (
        <form className="auth-form" onSubmit={loginLocal}>
          <label>
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      )}

      {mode === 'entra' && (
        <form className="auth-form" onSubmit={saveEntra}>
          <label>
            <span>Access token (Entra ID)</span>
            <textarea
              rows={6}
              value={entraToken}
              onChange={(e) => setEntraToken(e.target.value)}
              placeholder="Cole aqui o bearer token do Entra ID"
              required
            />
          </label>
          <button type="submit">Usar token</button>
        </form>
      )}
    </section>
  );
}
