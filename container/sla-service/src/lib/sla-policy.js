// Default SLA windows in hours; admin endpoint can update this in-memory map.
export const slaByPriority = {
  low: 120,
  medium: 72,
  high: 48,
  critical: 24
};

export function classifySla(order) {
  if (!order?.dueDate) return { status: 'unknown', hoursToDue: null };

  const now = Date.now();
  const due = new Date(order.dueDate).getTime();
  const hoursToDue = Math.floor((due - now) / 3600000);

  if (hoursToDue < 0) return { status: 'overdue', hoursToDue };
  if (hoursToDue <= 8) return { status: 'near_due', hoursToDue };
  return { status: 'on_track', hoursToDue };
}
