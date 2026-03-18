'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthMode, saveAdminToken } from '@/lib/auth';
import { getApiBaseUrl } from '@/lib/api';
import { bootstrapEntraSession, getEntraConfig, loginWithEntraRedirect } from '@/lib/entra';
import { getRuntimeConfig } from '@/lib/runtime-config';
import { TurnstileWidget } from '@/components/TurnstileWidget';

export default function AdminLoginPage() {
  const router = useRouter();
  const mode = getAuthMode();
  const entraConfig = getEntraConfig();
  const runtimeConfig = getRuntimeConfig();
  const turnstileEnabled = runtimeConfig.turnstileEnabled && Boolean(runtimeConfig.turnstileSiteKey);
  const [email, setEmail] = useState('admin@local.dev');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileRefreshKey, setTurnstileRefreshKey] = useState(0);

  useEffect(() => {
    if (mode !== 'entra') return;

    let cancelled = false;

    async function startEntraFlow() {
      try {
        const token = await bootstrapEntraSession();
        if (token) {
          saveAdminToken(token);
          router.replace('/');
          return;
        }

        if (!cancelled && entraConfig.enabled && !turnstileEnabled) {
          await loginWithEntraRedirect();
        }
      } catch {
        if (!cancelled) {
          setError('Falha ao iniciar login com Microsoft Entra ID.');
        }
      }
    }

    startEntraFlow();

    return () => {
      cancelled = true;
    };
  }, [entraConfig.enabled, mode, router, turnstileEnabled]);

  const loginLocal = async (event) => {
    event.preventDefault();
    if (turnstileEnabled && !turnstileToken) {
      setError('Confirme o Turnstile antes de entrar.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          turnstileToken: turnstileEnabled ? turnstileToken : ''
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.token) {
        throw new Error(data?.error || `API ${response.status}`);
      }

      saveAdminToken(data.token);
      router.replace('/');
    } catch (cause) {
      if (String(cause?.message || '').includes('turnstile_verification_failed')) {
        setError('Validação Turnstile inválida ou expirada. Tente novamente.');
      } else {
        setError('Falha no login local. Verifique usuário/senha.');
      }
    } finally {
      setLoading(false);
      if (turnstileEnabled) {
        setTurnstileToken('');
        setTurnstileRefreshKey((prev) => prev + 1);
      }
    }
  };

  const startEntra = async (event) => {
    event.preventDefault();
    if (turnstileEnabled && !turnstileToken) {
      setError('Confirme o Turnstile antes de continuar.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await loginWithEntraRedirect();
    } catch {
      setError('Falha ao iniciar login com Microsoft Entra ID.');
      setLoading(false);
      if (turnstileEnabled) {
        setTurnstileToken('');
        setTurnstileRefreshKey((prev) => prev + 1);
      }
    }
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
          {turnstileEnabled && (
            <div className="turnstile-box">
              <span>Verificação de segurança</span>
              <TurnstileWidget
                enabled={turnstileEnabled}
                siteKey={runtimeConfig.turnstileSiteKey}
                refreshKey={turnstileRefreshKey}
                onTokenChange={setTurnstileToken}
                onLoadError={() => setError('Não foi possível carregar o Turnstile.')}
              />
            </div>
          )}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      )}

      {mode === 'entra' && (
        <form className="auth-form" onSubmit={startEntra}>
          <p className="muted">
            {entraConfig.enabled
              ? 'Redirecionando para Microsoft Entra ID.'
              : 'Microsoft Entra ID não está configurado neste ambiente.'}
          </p>
          {turnstileEnabled && (
            <div className="turnstile-box">
              <span>Verificação de segurança</span>
              <TurnstileWidget
                enabled={turnstileEnabled}
                siteKey={runtimeConfig.turnstileSiteKey}
                refreshKey={turnstileRefreshKey}
                onTokenChange={setTurnstileToken}
                onLoadError={() => setError('Não foi possível carregar o Turnstile.')}
              />
            </div>
          )}
          <button type="submit" disabled={loading || !entraConfig.enabled}>
            {loading ? 'Redirecionando...' : 'Entrar com Microsoft'}
          </button>
        </form>
      )}
    </section>
  );
}
