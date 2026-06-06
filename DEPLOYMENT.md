# 🛫 Aman Ethiopia Tours — Deployment Guide

## Architecture Overview

This is a **hybrid app** composed of two services that must be deployed separately:

| Layer | Technology | Hosted On |
|---|---|---|
| **Frontend** | Vite static build | Vercel |
| **Backend API** | Express.js (Node 18+) | Railway / Render / Fly.io |
| **Database** | Firebase Firestore | Firebase |
| **File Storage** | Firebase Storage | Firebase |
| **Payments** | Stripe | Stripe Dashboard |

---

## ✅ Pre-Deployment Checklist

- [ ] Firebase project created and Firestore enabled
- [ ] Firebase service account key downloaded (`serviceAccount.json`)
- [ ] Stripe account with live/test keys
- [ ] SMTP credentials ready (Gmail app password or SendGrid)
- [ ] Git installed — [download here](https://git-scm.com/)
- [ ] Vercel CLI installed: `npm i -g vercel`

---

## 🔴 Step 1 — Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Firestore Database** (start in test mode, then apply rules below)
4. Enable **Firebase Authentication** (Email/Password)
5. Enable **Firebase Storage**
6. Go to **Project Settings → Service Accounts → Generate new private key**
   - Save as `serviceAccount.json` (**never commit this file**)
7. Copy your **web app config** (Project Settings → General → Your apps)

### Deploy Firestore Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 🟡 Step 2 — Deploy the Backend API

The Express server (`server/`) handles payment webhooks, email notifications,
and admin operations. It **must be deployed separately** from the frontend.

### Option A: Railway (recommended)

1. Push repository to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Set the **Root Directory** to `/` and **Start Command** to:
   ```
   node server/index.js
   ```
5. Add all **backend environment variables** (see section below)
6. Copy the generated public URL (e.g. `https://aman-api.up.railway.app`)

### Option B: Render

1. New Web Service → Connect GitHub repo
2. **Build Command**: `npm install`
3. **Start Command**: `node server/index.js`
4. **Node version**: 18 or higher
5. Add environment variables and deploy

### Option C: Fly.io

```bash
npm install -g flyctl
flyctl auth login
flyctl launch      # follow prompts
flyctl secrets set STRIPE_SECRET_KEY=sk_live_... # set secrets
flyctl deploy
```

---

## 🟢 Step 3 — Deploy the Frontend to Vercel

### Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Via Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. **Framework preset**: Other (Vite is auto-detected)
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. Add all **frontend environment variables** (see section below)
7. Click **Deploy**

### Update vercel.json with your API URL

After deploying the backend, update `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-API-URL.up.railway.app/api/:path*"
    }
  ]
}
```

---

## 🔑 Environment Variables

### Frontend Variables (add to Vercel dashboard → Settings → Environment Variables)

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase app ID |
| `VITE_ADMIN_EMAIL` | ✅ | Admin login email |
| `VITE_ADMIN_PASSWORD` | ✅ | Admin login password |
| `VITE_WHATSAPP_NUMBER` | ✅ | WhatsApp contact number |
| `VITE_COMPANY_EMAIL` | ✅ | Company contact email |
| `VITE_COMPANY_PHONE` | ✅ | Company contact phone |
| `VITE_STRIPE_PAYMENT_LINK` | ⚠️ | Stripe Payment Link URL (fallback) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ⚠️ | Stripe publishable key |
| `VITE_TELEBIRR_MERCHANT_ID` | ⚠️ | Telebirr merchant ID |
| `VITE_TELEBIRR_API_URL` | ⚠️ | Telebirr API endpoint |
| `VITE_NOTIFICATION_WEBHOOK` | ⚠️ | Webhook URL for booking alerts |
| `VITE_EMAILJS_SERVICE_ID` | ⚠️ | EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | ⚠️ | EmailJS template ID |
| `VITE_EMAILJS_PUBLIC_KEY` | ⚠️ | EmailJS public key |
| `VITE_API_URL` | ✅ | Full URL to the deployed backend API |

### Backend Variables (add to Railway / Render / Fly.io)

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret (`whsec_...`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✅ | Entire `serviceAccount.json` content as a single-line JSON string |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `CLIENT_ORIGIN` | ✅ | Your Vercel frontend URL (e.g. `https://aman-ethiopia-tours.vercel.app`) |
| `PORT` | ✅ | API port (usually set automatically, default `3001`) |
| `SMTP_HOST` | ✅ | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | ✅ | `587` |
| `SMTP_SECURE` | ✅ | `false` for TLS, `true` for SSL |
| `SMTP_USER` | ✅ | Email address |
| `SMTP_PASS` | ✅ | Email app password |
| `SMTP_FROM` | ⚠️ | Sender display name + email |

> **Tip:** To set `FIREBASE_SERVICE_ACCOUNT_JSON`, run:
> ```bash
> cat serviceAccount.json | jq -c . | pbcopy   # macOS
> cat serviceAccount.json | jq -c .             # Linux/WSL — copy output manually
> ```

---

## ⚠️ Missing / Placeholder Values in Current `.env`

The following values in your `.env` are still placeholders and **must be replaced** before going live:

- `VITE_FIREBASE_*` — All Firebase keys are commented out
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Not set (backend only)
- `VITE_STRIPE_PAYMENT_LINK` — Still set to `https://buy.stripe.com/your_link`
- `VITE_STRIPE_PUBLISHABLE_KEY` — Still set to `pk_test_your_key`
- `VITE_TELEBIRR_MERCHANT_ID` — Placeholder
- `VITE_NOTIFICATION_WEBHOOK` — Placeholder
- `VITE_EMAILJS_*` — All placeholders

---

## 📌 Git Setup (First Time)

Git must be installed: [https://git-scm.com/download/win](https://git-scm.com/download/win)

After installing Git, open a new terminal in the project folder and run:

```bash
git init
git add .
git commit -m "Ready for deployment"

# Push to GitHub (create a repo on github.com first)
git remote add origin https://github.com/YOUR_USERNAME/aman-ethiopia-tours.git
git branch -M main
git push -u origin main
```

---

## 🔁 Stripe Webhook Setup

After deploying the backend:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add Endpoint**
3. URL: `https://YOUR-API-URL/api/stripe/webhook`
4. Events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy the **Signing Secret** → set as `STRIPE_WEBHOOK_SECRET`

---

## 🚀 Build & Preview Locally

```bash
# Install dependencies
npm install

# Run dev server (frontend only)
npm run dev

# Run backend API
npm run dev:api

# Run both together
npm run dev:all

# Production build (verify before deploying)
npm run build

# Preview the production build locally
npm run preview
```

---

## 📁 Project Structure

```
aman-ethiopia-tours/
├── dist/               ← Vercel deploys this (generated by npm run build)
├── server/             ← Express API (deploy separately)
│   ├── index.js        ← API entry point
│   ├── routes/         ← Stripe, bookings, emails, admin
│   └── services/       ← Payment, notification logic
├── src/                ← Frontend source
│   ├── main.js         ← Homepage
│   ├── admin.js        ← Admin dashboard
│   ├── firebase.js     ← Firebase client initialisation
│   └── services/       ← Payment, booking services
├── firestore.rules     ← Deploy with firebase deploy
├── firestore.indexes.json
├── storage.rules
├── vercel.json         ← Vercel deployment config
├── vite.config.js      ← Vite build config
└── .env.example        ← Template — copy to .env and fill in real values
```

---

## 🆘 Troubleshooting

| Issue | Fix |
|---|---|
| `CORS error` in browser | Set `CLIENT_ORIGIN` on backend to exact frontend URL |
| Firebase `permission-denied` | Deploy `firestore.rules` via `firebase deploy` |
| Stripe webhook `400` | Verify `STRIPE_WEBHOOK_SECRET` matches Dashboard value |
| Blank admin dashboard | Confirm all `VITE_FIREBASE_*` env vars are set in Vercel |
| Emails not sending | Check SMTP credentials; for Gmail use an App Password, not your main password |
| API calls returning `502` | Backend is down — check Railway/Render service logs |
