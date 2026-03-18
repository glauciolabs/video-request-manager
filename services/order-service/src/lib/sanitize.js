// Minimal sanitization to avoid script payloads in free text fields.
export function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '').trim();
}
