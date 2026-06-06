import express from 'express';
import Stripe from 'stripe';
import { SERVER_CONFIG } from '../config.js';
import { confirmStripePayment } from '../services/bookingPayments.js';

const router = express.Router();

function getStripe() {
  if (!SERVER_CONFIG.stripeSecretKey) return null;
  return new Stripe(SERVER_CONFIG.stripeSecretKey);
}

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !SERVER_CONFIG.stripeWebhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook not configured' });
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, SERVER_CONFIG.stripeWebhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const bookingId = paymentIntent.metadata?.bookingId;
      if (bookingId) {
        await confirmStripePayment(bookingId, paymentIntent.id);
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = session.client_reference_id || session.metadata?.bookingId;
      const transactionId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (bookingId && transactionId) {
        await confirmStripePayment(bookingId, transactionId);
      }
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
});

router.post('/create-checkout-session', express.json(), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const { bookingId, tourName, totalAmount, email } = req.body || {};
  if (!bookingId || !totalAmount) {
    return res.status(400).json({ error: 'bookingId and totalAmount are required' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: bookingId,
      customer_email: email || undefined,
      metadata: { bookingId },
      payment_intent_data: { metadata: { bookingId } },
      line_items: [
        {
          price_data: {
            currency: 'etb',
            product_data: { name: tourName || 'Tour Booking' },
            unit_amount: Math.round(Number(totalAmount) * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${SERVER_CONFIG.clientOrigin}/?payment=pending&booking=${bookingId}`,
      cancel_url: `${SERVER_CONFIG.clientOrigin}/?payment=cancelled&booking=${bookingId}`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

export default router;
