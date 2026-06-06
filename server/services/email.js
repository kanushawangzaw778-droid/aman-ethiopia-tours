import nodemailer from 'nodemailer';
import { SERVER_CONFIG } from '../config.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SERVER_CONFIG.smtp.host || !SERVER_CONFIG.smtp.user) return null;

  transporter = nodemailer.createTransport({
    host: SERVER_CONFIG.smtp.host,
    port: SERVER_CONFIG.smtp.port,
    secure: SERVER_CONFIG.smtp.secure,
    auth: {
      user: SERVER_CONFIG.smtp.user,
      pass: SERVER_CONFIG.smtp.pass,
    },
  });
  return transporter;
}

function formatDate(date) {
  if (!date) return '—';
  if (date.toDate) return date.toDate().toLocaleDateString();
  if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString();
  return new Date(date).toLocaleDateString();
}

const templates = {
  booking_created: (booking) => ({
    subject: 'Booking Received',
    html: `
      <p>Your booking has been received.</p>
      <p><strong>Tour:</strong> ${booking.tourName}</p>
      <p><strong>Travel Date:</strong> ${formatDate(booking.date)}</p>
      <p><strong>Status:</strong> Pending review</p>
      <p>We will notify you once confirmed.</p>
      <p>— Aman Ethiopia Tours & Travel</p>`,
  }),
  booking_confirmed: (booking) => ({
    subject: 'Booking Confirmed 🎉',
    html: `
      <p>Your booking is confirmed.</p>
      <p><strong>Tour:</strong> ${booking.tourName}</p>
      <p><strong>Travel Date:</strong> ${formatDate(booking.date)}</p>
      <p><strong>Status:</strong> Approved</p>
      <p>See you on your trip!</p>
      <p>— Aman Ethiopia Tours & Travel</p>`,
  }),
  booking_rejected: (booking) => ({
    subject: 'Booking Rejected',
    html: `
      <p>Your booking was not approved.</p>
      <p><strong>Tour:</strong> ${booking.tourName}</p>
      <p><strong>Reason:</strong> Payment not verified or unavailable slots.</p>
      <p>Contact us if you have questions.</p>
      <p>— Aman Ethiopia Tours & Travel</p>`,
  }),
};

export async function sendBookingEmail(type, booking) {
  const transport = getTransporter();
  if (!transport || !booking?.email) {
    console.warn(`Email not sent (${type}): SMTP or recipient not configured`);
    return { sent: false, reason: 'not_configured' };
  }

  const template = templates[type];
  if (!template) return { sent: false, reason: 'unknown_type' };

  const { subject, html } = template(booking);

  await transport.sendMail({
    from: SERVER_CONFIG.smtp.from,
    to: booking.email,
    subject,
    html,
  });

  return { sent: true };
}
