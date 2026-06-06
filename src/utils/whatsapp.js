import { APP_CONFIG } from '../config';

export function buildWhatsAppLink(message) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encoded}`;
}

export function buildBookingWhatsAppMessage(booking) {
  return [
    `🌍 *New Booking — ${APP_CONFIG.companyName}*`,
    '──────────────────',
    `*Tour:* ${booking.tourName}`,
    `*Customer:* ${booking.customerName}`,
    `*Date:* ${booking.date}`,
    `*Travelers:* ${booking.participants}`,
    `*Phone:* ${booking.phone}`,
    `*Email:* ${booking.email}`,
    `*Total:* $${booking.totalAmount}`,
    booking.requests ? `*Requests:* ${booking.requests}` : '',
    `*Payment:* ${booking.paymentMethod}`,
    `*Status:* ${booking.status}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildQuickInquiryMessage(tourName = '') {
  return tourName
    ? `Hello! I'm interested in the "${tourName}" tour. Could you share availability and pricing?`
    : `Hello! I'd like to plan a trip to Ethiopia with ${APP_CONFIG.companyName}.`;
}
