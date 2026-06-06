import express from 'express';
import cors from 'cors';
import { SERVER_CONFIG } from './config.js';
import { initFirebaseAdmin } from './firebaseAdmin.js';
import stripeRoutes from './routes/stripe.js';
import bookingRoutes from './routes/bookings.js';
import adminPaymentRoutes from './routes/adminPayments.js';
import emailRoutes from './routes/emails.js';

initFirebaseAdmin();

const app = express();

app.use(cors({ origin: SERVER_CONFIG.clientOrigin, credentials: true }));

app.use('/api/stripe', stripeRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin/payments', express.json(), adminPaymentRoutes);
app.use('/api/emails', emailRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'aman-payment-api' });
});

app.listen(SERVER_CONFIG.port, () => {
  console.log(`Payment API running on http://localhost:${SERVER_CONFIG.port}`);
});
