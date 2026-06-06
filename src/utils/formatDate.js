export function formatFirestoreDate(timestamp) {
  if (!timestamp) return '—';
  if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString();
  if (timestamp instanceof Date) return timestamp.toLocaleDateString();
  return new Date(timestamp).toLocaleDateString();
}

export function formatCurrency(amount) {
  return `ETB ${Number(amount || 0).toLocaleString()}`;
}

export function parseDurationDays(duration) {
  if (!duration) return 0;
  const match = String(duration).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
