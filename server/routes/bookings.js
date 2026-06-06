import express from 'express';
import { getBooking, submitTelebirrProof } from '../services/bookingPayments.js';

const router = express.Router();

router.get('/:id/payment-status', async (req, res) => {
  try {
    const booking = await getBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      bookingId: booking.id,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      paymentMethod: booking.paymentMethod,
      transactionId: booking.transactionId || null,
      totalAmount: booking.totalAmount || 0,
    });
  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});

router.post('/:id/telebirr-proof', express.json({ limit: '6mb' }), async (req, res) => {
  const { transactionId, receiptImage, email } = req.body || {};

  try {
    const result = await submitTelebirrProof(req.params.id, { transactionId, receiptImage, email });
    if (!result.ok) {
      const status = result.reason === 'booking_not_found' ? 404 : 400;
      return res.status(status).json({ error: result.reason });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Telebirr proof error:', err);
    res.status(500).json({ error: 'Failed to submit payment proof' });
  }
});

export default router;
