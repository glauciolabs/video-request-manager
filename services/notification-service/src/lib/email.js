import nodemailer from 'nodemailer';

let cachedTransporter;

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const secure = parseBoolean(process.env.SMTP_SECURE, false);
  const from = process.env.SMTP_FROM;
  const fromName = process.env.SMTP_FROM_NAME || 'Video Request Manager';
  const fromEmail = process.env.SMTP_FROM_EMAIL || '';
  const replyTo = process.env.SMTP_REPLY_TO || '';
  const envelopeFrom = process.env.SMTP_ENVELOPE_FROM || '';
  const requireTLS = parseBoolean(process.env.SMTP_REQUIRE_TLS, false);

  return {
    host,
    port,
    user,
    pass,
    secure,
    from,
    fromName,
    fromEmail,
    replyTo,
    envelopeFrom,
    requireTLS
  };
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().replace(/^["']|["']$/g, '');
  if (!normalized) return '';
  // Basic practical validation for SMTP header assembly.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return '';
  return normalized;
}

function escapeDisplayName(value) {
  return String(value || '').trim().replaceAll('"', '\\"');
}

function buildFromHeader(config) {
  const explicitFrom = String(config.from || '').trim();
  const authEmail = normalizeEmail(config.user);
  const fallbackEmail = normalizeEmail(config.fromEmail) || authEmail;

  if (explicitFrom) {
    if (explicitFrom.includes('@')) return explicitFrom;
    if (fallbackEmail) return `"${escapeDisplayName(explicitFrom)}" <${fallbackEmail}>`;
  }

  if (!fallbackEmail) return '';
  return `"${escapeDisplayName(config.fromName)}" <${fallbackEmail}>`;
}

function buildReplyToHeader(config) {
  const replyTo = normalizeEmail(config.replyTo);
  if (replyTo) return replyTo;

  const fromEmail = normalizeEmail(config.fromEmail);
  if (fromEmail) return fromEmail;

  return normalizeEmail(config.user);
}

function getTransporter(config) {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.user && config.pass
      ? { user: config.user, pass: config.pass }
      : undefined
  });

  return cachedTransporter;
}

export async function sendEmailMessage({ to, subject, text, html }) {
  const config = getSmtpConfig();
  const fromHeader = buildFromHeader(config);
  const replyToHeader = buildReplyToHeader(config);
  const envelopeFrom = normalizeEmail(config.envelopeFrom)
    || normalizeEmail(config.fromEmail)
    || normalizeEmail(config.user);

  if (!config.host || !fromHeader) {
    return { ok: false, reason: 'missing smtp config' };
  }

  if (!to) {
    return { ok: false, reason: 'missing recipient' };
  }

  try {
    const transporter = getTransporter(config);
    const info = await transporter.sendMail({
      from: fromHeader,
      replyTo: replyToHeader || undefined,
      envelope: envelopeFrom
        ? { from: envelopeFrom, to: [to] }
        : undefined,
      to,
      subject,
      text,
      html,
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'Auto-Submitted': 'auto-generated'
      }
    });

    return {
      ok: true,
      provider: 'smtp',
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || ''
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'smtp_send_failed',
      error: error?.code || error?.name || 'unknown_error'
    };
  }
}
