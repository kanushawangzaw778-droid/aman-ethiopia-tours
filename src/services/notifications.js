import { APP_CONFIG } from '../config';
import { buildBookingWhatsAppMessage } from '../utils/whatsapp';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function notifyBookingCreated(booking) {
  const tasks = [];

  if (booking.id) {
    tasks.push(
      fetch(`${API_BASE}/api/emails/booking-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, type: 'booking_created' }),
      }).catch(console.error)
    );
  }

  if (APP_CONFIG.notificationWebhook) {
    tasks.push(
      fetch(APP_CONFIG.notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_booking',
          booking,
          whatsappMessage: buildBookingWhatsAppMessage(booking),
          timestamp: new Date().toISOString(),
        }),
      }).catch(console.error)
    );
  }

  if (APP_CONFIG.emailjs.publicKey && window.emailjs) {
    tasks.push(
      window.emailjs.send(
        APP_CONFIG.emailjs.serviceId,
        APP_CONFIG.emailjs.templateId,
        {
          to_email: APP_CONFIG.companyEmail,
          customer_name: booking.customerName,
          customer_email: booking.email,
          tour_name: booking.tourName,
          travel_date: booking.date,
          participants: booking.participants,
          total: booking.totalAmount,
          phone: booking.phone,
        },
        APP_CONFIG.emailjs.publicKey
      ).catch(console.error)
    );
  }

  await Promise.allSettled(tasks);
  return true;
}

export async function notifyContactMessage(message) {
  if (APP_CONFIG.notificationWebhook) {
    await fetch(APP_CONFIG.notificationWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'contact_message', message, timestamp: new Date().toISOString() }),
    }).catch(console.error);
  }
}

export async function notifyPaymentConfirmed(booking, receipt) {
  if (APP_CONFIG.notificationWebhook) {
    await fetch(APP_CONFIG.notificationWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'payment_confirmed', booking, receipt, timestamp: new Date().toISOString() }),
    }).catch(console.error);
  }
}
