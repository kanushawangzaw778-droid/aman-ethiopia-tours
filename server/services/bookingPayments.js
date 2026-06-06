import { getAdmin, getDb, getStorage } from '../firebaseAdmin.js';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../config.js';
import { sendBookingEmail } from './email.js';

function buildReceipt(booking, bookingId) {
  return {
    receiptId: `RCP-${Date.now()}`,
    date: new Date().toISOString(),
    company: 'Aman Ethiopia Tours & Travel',
    customer: booking.customerName,
    tour: booking.tourName,
    travelers: booking.participants,
    travelDate: booking.date,
    amount: booking.totalAmount,
    paymentMethod: booking.paymentMethod,
    paymentStatus: PAYMENT_STATUS.PAID,
    status: BOOKING_STATUS.CONFIRMED,
    bookingId,
  };
}

export async function getBooking(bookingId) {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection('bookings').doc(bookingId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function confirmStripePayment(bookingId, transactionId) {
  const db = getDb();
  const admin = getAdmin();
  if (!db) throw new Error('Database not configured');

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'booking_not_found' };

  const booking = snap.data();
  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    return { ok: true, alreadyPaid: true };
  }

  const receipt = buildReceipt(booking, bookingId);
  await ref.update({
    paymentStatus: PAYMENT_STATUS.PAID,
    status: BOOKING_STATUS.CONFIRMED,
    transactionId,
    receipt,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    verifiedBy: 'stripe_webhook',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendBookingEmail('booking_confirmed', { ...booking, id: bookingId }).catch(console.error);

  return { ok: true, receipt };
}

export async function submitTelebirrProof(bookingId, { transactionId, receiptImage, email }) {
  const db = getDb();
  const admin = getAdmin();
  if (!db) throw new Error('Database not configured');

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'booking_not_found' };

  const booking = snap.data();
  if (booking.paymentMethod !== 'telebirr') {
    return { ok: false, reason: 'invalid_payment_method' };
  }
  if (booking.email?.toLowerCase() !== email?.toLowerCase()) {
    return { ok: false, reason: 'email_mismatch' };
  }
  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    return { ok: false, reason: 'already_paid' };
  }
  if (!transactionId && !receiptImage) {
    return { ok: false, reason: 'proof_required' };
  }

  let receiptImageUrl = '';
  if (receiptImage?.startsWith('data:')) {
    receiptImageUrl = await uploadReceiptImage(bookingId, receiptImage);
  } else if (receiptImage) {
    receiptImageUrl = receiptImage;
  }

  await ref.update({
    paymentMethod: 'telebirr',
    paymentStatus: PAYMENT_STATUS.PENDING_REVIEW,
    status: BOOKING_STATUS.WAITING_ADMIN,
    transactionId: transactionId || '',
    receiptImage: receiptImageUrl,
    proofSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

async function uploadReceiptImage(bookingId, dataUrl) {
  const storage = getStorage();
  if (!storage) return dataUrl;

  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return dataUrl;

  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `payment-receipts/${bookingId}_${Date.now()}.${ext}`;
  const bucket = storage.bucket();
  const file = bucket.file(path);
  await file.save(buffer, { metadata: { contentType: mime } });
  await file.makePublic().catch(() => {});
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

export async function approveTelebirrPayment(bookingId) {
  const db = getDb();
  const admin = getAdmin();
  if (!db) throw new Error('Database not configured');

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'booking_not_found' };

  const booking = snap.data();
  if (booking.paymentStatus !== PAYMENT_STATUS.PENDING_REVIEW) {
    return { ok: false, reason: 'not_pending_review' };
  }

  const receipt = buildReceipt(booking, bookingId);
  await ref.update({
    paymentStatus: PAYMENT_STATUS.PAID,
    status: BOOKING_STATUS.CONFIRMED,
    receipt,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    verifiedBy: 'admin',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendBookingEmail('booking_confirmed', { ...booking, id: bookingId }).catch(console.error);

  return { ok: true, receipt };
}

export async function rejectTelebirrPayment(bookingId) {
  const db = getDb();
  const admin = getAdmin();
  if (!db) throw new Error('Database not configured');

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'booking_not_found' };

  const booking = snap.data();
  if (booking.paymentStatus !== PAYMENT_STATUS.PENDING_REVIEW) {
    return { ok: false, reason: 'not_pending_review' };
  }

  await ref.update({
    paymentStatus: PAYMENT_STATUS.FAILED,
    status: BOOKING_STATUS.REJECTED,
    verifiedBy: 'admin',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendBookingEmail('booking_rejected', { ...booking, id: bookingId }).catch(console.error);

  return { ok: true };
}

export async function listPendingReviewBookings() {
  const db = getDb();
  if (!db) return [];

  const snap = await db
    .collection('bookings')
    .where('paymentStatus', '==', PAYMENT_STATUS.PENDING_REVIEW)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
