export const APP_CONFIG = {
  companyName: 'Aman Ethiopia Tours & Travel',
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER || '251911000000',
  companyEmail: import.meta.env.VITE_COMPANY_EMAIL || 'info@amanethiopiatours.com',
  companyPhone: import.meta.env.VITE_COMPANY_PHONE || '+251 911 000 000',
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
  stripePaymentLink: import.meta.env.VITE_STRIPE_PAYMENT_LINK || '',
  telebirrMerchantId: import.meta.env.VITE_TELEBIRR_MERCHANT_ID || '',
  telebirrApiUrl: import.meta.env.VITE_TELEBIRR_API_URL || 'https://api.telebirr.et/v1/payments',
  bankTransfer: {
    bankName: 'Commercial Bank of Ethiopia',
    accountName: 'Aman Ethiopia Tours & Travel',
    accountNumber: '1000123456789',
    swift: 'CBETETAA',
  },
  notificationWebhook: import.meta.env.VITE_NOTIFICATION_WEBHOOK || '',
  emailjs: {
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || '',
    templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '',
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '',
  },
  adminEmail: import.meta.env.VITE_ADMIN_EMAIL || 'kanushawangzaw@gmail.com',
  adminPassword: import.meta.env.VITE_ADMIN_PASSWORD || 'kanu 12345',
};

export const TOUR_CATEGORIES = [
  'cultural',
  'adventure',
  'historical',
  'trekking',
  'festival',
];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'rejected', 'waiting_admin_confirmation'];
export const PAYMENT_STATUSES = ['pending', 'paid', 'pending_review', 'failed'];
