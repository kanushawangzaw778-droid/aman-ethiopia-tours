import { auth, isFirebaseConfigured } from '../firebase';
import { updateDemoBooking, getDemoBookings } from './demoStorage';
import { generateReceipt } from './payments';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function createStripeCheckoutSession(booking) {
  return apiFetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({
      bookingId: booking.id,
      tourName: booking.tourName,
      totalAmount: booking.totalAmount,
      email: booking.email,
    }),
  });
}

export async function getPaymentStatus(bookingId) {
  if (!isFirebaseConfigured) {
    const booking = getDemoBookings().find((b) => b.id === bookingId);
    if (!booking) return null;
    return {
      bookingId: booking.id,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      paymentMethod: booking.paymentMethod,
      transactionId: booking.transactionId || null,
      totalAmount: booking.totalAmount || 0,
    };
  }
  return apiFetch(`/api/bookings/${bookingId}/payment-status`);
}

export async function submitTelebirrProof(bookingId, { transactionId, receiptImage, email }) {
  if (!isFirebaseConfigured) {
    const booking = getDemoBookings().find((b) => b.id === bookingId);
    if (!booking || booking.email?.toLowerCase() !== email?.toLowerCase()) {
      throw new Error('email_mismatch');
    }
    updateDemoBooking(bookingId, {
      paymentMethod: 'telebirr',
      paymentStatus: 'pending_review',
      status: 'waiting_admin_confirmation',
      transactionId: transactionId || '',
      receiptImage: receiptImage || '',
      proofSubmittedAt: new Date().toISOString(),
    });
    return { success: true };
  }

  return apiFetch(`/api/bookings/${bookingId}/telebirr-proof`, {
    method: 'POST',
    body: JSON.stringify({ transactionId, receiptImage, email }),
  });
}

async function getAdminToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function approvePaymentReview(bookingId) {
  if (!isFirebaseConfigured) {
    const booking = getDemoBookings().find((b) => b.id === bookingId);
    if (!booking || booking.paymentStatus !== 'pending_review') {
      throw new Error('not_pending_review');
    }
    const receipt = generateReceipt({
      ...booking,
      paymentStatus: 'paid',
      status: 'confirmed',
    });
    updateDemoBooking(bookingId, {
      paymentStatus: 'paid',
      status: 'confirmed',
      receipt,
      paidAt: new Date().toISOString(),
      verifiedBy: 'admin',
    });
    return { success: true, receipt };
  }

  const token = await getAdminToken();
  return apiFetch(`/api/admin/payments/${bookingId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function rejectPaymentReview(bookingId) {
  if (!isFirebaseConfigured) {
    const booking = getDemoBookings().find((b) => b.id === bookingId);
    if (!booking || booking.paymentStatus !== 'pending_review') {
      throw new Error('not_pending_review');
    }
    updateDemoBooking(bookingId, {
      paymentStatus: 'failed',
      status: 'rejected',
      verifiedBy: 'admin',
    });
    return { success: true };
  }

  const token = await getAdminToken();
  return apiFetch(`/api/admin/payments/${bookingId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function pollPaymentStatus(bookingId, { maxAttempts = 30, intervalMs = 2000 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getPaymentStatus(bookingId);
    if (status?.paymentStatus === 'paid') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
