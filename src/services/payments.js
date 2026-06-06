import { APP_CONFIG } from '../config';
import { createStripeCheckoutSession } from './paymentVerification';

export async function initiateStripePayment(booking) {
  try {
    const session = await createStripeCheckoutSession(booking);
    if (session?.url) {
      return { success: true, redirectUrl: session.url, method: 'stripe_checkout_session' };
    }
  } catch {
    /* fall through to payment link / publishable key */
  }

  if (APP_CONFIG.stripePaymentLink) {
    const url = new URL(APP_CONFIG.stripePaymentLink);
    url.searchParams.set('client_reference_id', booking.id || '');
    url.searchParams.set('prefilled_email', booking.email || '');
    return { success: true, redirectUrl: url.toString(), method: 'stripe_link' };
  }

  if (APP_CONFIG.stripePublishableKey && window.Stripe) {
    const stripe = window.Stripe(APP_CONFIG.stripePublishableKey);
    const { error } = await stripe.redirectToCheckout({
      lineItems: [{ price_data: buildStripePriceData(booking), quantity: 1 }],
      mode: 'payment',
      successUrl: `${window.location.origin}/?payment=pending&booking=${booking.id}`,
      cancelUrl: `${window.location.origin}/?payment=cancelled`,
      customerEmail: booking.email,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, method: 'stripe_checkout' };
  }

  return {
    success: false,
    error: 'Stripe not configured. Set VITE_STRIPE_PAYMENT_LINK or VITE_STRIPE_PUBLISHABLE_KEY.',
    fallback: 'manual',
  };
}

function buildStripePriceData(booking) {
  return {
    currency: 'etb',
    product_data: { name: booking.tourName },
    unit_amount: Math.round((booking.totalAmount || 0) * 100),
  };
}

export async function initiateTelebirrPayment(booking) {
  const payload = {
    merchantId: APP_CONFIG.telebirrMerchantId,
    amount: booking.totalAmount,
    currency: 'ETB',
    reference: booking.id,
    customerPhone: booking.phone,
    description: `Tour booking: ${booking.tourName}`,
  };

  if (!APP_CONFIG.telebirrMerchantId) {
    return {
      success: false,
      mock: true,
      message: 'Telebirr integration ready — configure VITE_TELEBIRR_MERCHANT_ID',
      payload,
      instructions: getBankTransferInstructions(booking),
    };
  }

  try {
    const res = await fetch(`${APP_CONFIG.telebirrApiUrl}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: res.ok, ...data, method: 'telebirr' };
  } catch {
    return {
      success: false,
      mock: true,
      message: 'Telebirr API unreachable — use bank transfer fallback',
      instructions: getBankTransferInstructions(booking),
    };
  }
}

export function getBankTransferInstructions(booking) {
  const { bankTransfer } = APP_CONFIG;
  return {
    bankName: bankTransfer.bankName,
    accountName: bankTransfer.accountName,
    accountNumber: bankTransfer.accountNumber,
    swift: bankTransfer.swift,
    reference: `AMAN-${booking.id?.slice(0, 8).toUpperCase() || 'BOOKING'}`,
    amount: booking.totalAmount,
    note: 'Include the reference number in your transfer description.',
  };
}

export function generateReceipt(booking) {
  return {
    receiptId: `RCP-${Date.now()}`,
    date: new Date().toISOString(),
    company: APP_CONFIG.companyName,
    customer: booking.customerName,
    tour: booking.tourName,
    travelers: booking.participants,
    travelDate: booking.date,
    amount: booking.totalAmount,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus || 'paid',
    status: booking.status,
  };
}
