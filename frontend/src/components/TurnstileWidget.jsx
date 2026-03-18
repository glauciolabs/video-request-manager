'use client';

import { useEffect, useRef } from 'react';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileScriptPromise;

function ensureTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script_error')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile_script_error'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function TurnstileWidget({
  enabled,
  siteKey,
  refreshKey = 0,
  onTokenChange,
  onLoadError,
  theme = 'light'
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  const emitToken = (value) => {
    onTokenChangeRef.current?.(String(value || ''));
  };

  useEffect(() => {
    if (!enabled || !siteKey) {
      emitToken('');
      return undefined;
    }

    let cancelled = false;
    emitToken('');

    ensureTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => emitToken(token),
          'expired-callback': () => emitToken(''),
          'error-callback': () => {
            emitToken('');
            onLoadErrorRef.current?.();
          }
        });
      })
      .catch(() => {
        if (cancelled) return;
        emitToken('');
        onLoadErrorRef.current?.();
      });

    return () => {
      cancelled = true;

      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // No-op if widget was already removed.
        }
      }

      widgetIdRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [enabled, siteKey, refreshKey, theme]);

  if (!enabled || !siteKey) return null;
  return <div ref={containerRef} className="turnstile-widget" />;
}
