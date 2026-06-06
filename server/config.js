import 'dotenv/config';

export const SERVER_CONFIG = {
  port: Number(process.env.PORT) || 3001,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  adminEmail: process.env.VITE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'kanushawangzaw@gmail.com',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  firebase: {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@amanethiopiatours.com',
  },
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  PENDING_REVIEW: 'pending_review',
  FAILED: 'failed',
};

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  WAITING_ADMIN: 'waiting_admin_confirmation',
};
