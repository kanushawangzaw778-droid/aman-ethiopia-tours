import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getBooking } from '../services/bookingPayments.js';
import { sendBookingEmail } from '../services/email.js';

const router = express.Router();

router.post('/booking-status', express.json(), async (req, res) => {
  const { bookingId, type } = req.body || {};
  const allowed = ['booking_created', 'booking_confirmed', 'booking_rejected'];

  if (!bookingId || !allowed.includes(type)) {
    return res.status(400).json({ error: 'bookingId and valid type are required' });
  }

  try {
    const booking = await getBooking(bookingId);
    if (!booking) return res.status(404).json({ error: 'booking_not_found' });

    const result = await sendBookingEmail(type, booking);
    res.json(result);
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

router.post('/admin-notify', requireAdmin, express.json(), async (req, res) => {
  const { bookingId, type } = req.body || {};
  const allowed = ['booking_confirmed', 'booking_rejected'];

  if (!bookingId || !allowed.includes(type)) {
    return res.status(400).json({ error: 'bookingId and valid type are required' });
  }

  try {
    const booking = await getBooking(bookingId);
    if (!booking) return res.status(404).json({ error: 'booking_not_found' });

    const result = await sendBookingEmail(type, booking);
    res.json(result);
  } catch (err) {
    console.error('Admin email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
