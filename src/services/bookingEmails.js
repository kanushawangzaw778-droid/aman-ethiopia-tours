const API_BASE = import.meta.env.VITE_API_URL || '';

export async function notifyBookingStatusEmail(bookingId, type, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const endpoint = token
    ? `${API_BASE}/api/emails/admin-notify`
    : `${API_BASE}/api/emails/booking-status`;

  await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ bookingId, type }),
  }).catch(console.error);
}
