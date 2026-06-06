import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  approveTelebirrPayment,
  rejectTelebirrPayment,
  listPendingReviewBookings,
} from '../services/bookingPayments.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/pending-review', async (_req, res) => {
  try {
    const bookings = await listPendingReviewBookings();
    res.json({ bookings });
  } catch (err) {
    console.error('Pending review list error:', err);
    res.status(500).json({ error: 'Failed to load pending payments' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const result = await approveTelebirrPayment(req.params.id);
    if (!result.ok) {
      const status = result.reason === 'booking_not_found' ? 404 : 400;
      return res.status(status).json({ error: result.reason });
    }
    res.json({ success: true, receipt: result.receipt });
  } catch (err) {
    console.error('Approve payment error:', err);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const result = await rejectTelebirrPayment(req.params.id);
    if (!result.ok) {
      const status = result.reason === 'booking_not_found' ? 404 : 400;
      return res.status(status).json({ error: result.reason });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Reject payment error:', err);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

export default router;
