export function sanitizeValue(value) {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').trim();
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)]));
  }
  return value;
}
