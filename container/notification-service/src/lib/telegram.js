const TELEGRAM_API = 'https://api.telegram.org';
const TELEGRAM_TIMEOUT_MS = Number(process.env.TELEGRAM_TIMEOUT_MS || 12000);
const TELEGRAM_MAX_RETRIES = Math.max(1, Number(process.env.TELEGRAM_MAX_RETRIES || 2));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOnce({ botToken, chatId, text }) {
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { parseError: true };
  }

  return { ok: response.ok, data, statusCode: response.status };
}

export async function sendTelegramMessage({ botToken, chatId, text }) {
  if (!botToken || !chatId) {
    return { ok: false, reason: 'missing telegram config' };
  }

  for (let attempt = 1; attempt <= TELEGRAM_MAX_RETRIES; attempt += 1) {
    try {
      return await sendOnce({ botToken, chatId, text });
    } catch (error) {
      const finalAttempt = attempt === TELEGRAM_MAX_RETRIES;
      if (!finalAttempt) {
        await wait(400 * attempt);
        continue;
      }

      const causeCode = error?.cause?.code
        || (Array.isArray(error?.cause?.errors) && error.cause.errors[0]?.code)
        || null;

      return {
        ok: false,
        reason: 'telegram_fetch_failed',
        error: error?.code || error?.name || 'unknown_error',
        causeCode,
        attempts: attempt
      };
    }
  }
}
