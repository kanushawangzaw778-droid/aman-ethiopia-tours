import './style.css';
import { db, auth, isFirebaseConfigured } from './firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getCurrentUser, redirectToLogin, onUserAuthChanged } from './services/userAuth';
import { getDemoBookingsForUser, onDemoStorageChange } from './services/demoStorage';
import { formatFirestoreDate, formatCurrency } from './utils/formatDate';
import { initAuthNav, initMobileMenu, initNavbarScroll } from './utils/authNav';
import { initLanguageToggle } from './i18n';
import { buildQuickInquiryMessage, buildWhatsAppLink } from './utils/whatsapp';

const bookingsGrid = document.getElementById('bookingsGrid');
const userGreeting = document.getElementById('userGreeting');

const TOUR_IMAGES = {
  lalibela: '/assets/lalibela.png',
  simien: '/assets/simien.png',
  omo: '/assets/omo.png',
  addis: '/assets/addis.png',
};

function tourImage(tourName = '') {
  const key = tourName.toLowerCase();
  if (key.includes('lalibela')) return TOUR_IMAGES.lalibela;
  if (key.includes('simien')) return TOUR_IMAGES.simien;
  if (key.includes('omo')) return TOUR_IMAGES.omo;
  if (key.includes('addis')) return TOUR_IMAGES.addis;
  return TOUR_IMAGES.lalibela;
}

function statusTagClass(status) {
  if (status === 'confirmed') return 'tag-confirmed';
  if (status === 'rejected') return 'tag-rejected';
  return 'tag-pending';
}

function paymentLabel(status) {
  const labels = {
    paid: 'Paid',
    pending: 'Pending',
    pending_review: 'Pending Review',
    failed: 'Failed',
  };
  return labels[status] || status || 'Pending';
}

function renderBookings(bookings) {
  if (!bookingsGrid) return;

  if (!bookings.length) {
    bookingsGrid.innerHTML = `
      <div class="loading-state">
        No bookings yet. <a href="/#tours" class="btn btn-gold btn-sm" style="margin-top:1rem;display:inline-flex;">Book your first tour</a>
      </div>`;
    return;
  }

  bookingsGrid.innerHTML = bookings
    .map(
      (b) => `
    <div class="tour-card booking-card">
      <div class="tour-img">
        <img src="${tourImage(b.tourName)}" alt="${b.tourName}" loading="lazy">
        <div class="tour-tag ${statusTagClass(b.status)}">${b.status || 'pending'}</div>
      </div>
      <div class="tour-info">
        <div class="tour-meta">
          <span>${formatFirestoreDate(b.date)}</span> • <span>${b.participants || 1} traveler${(b.participants || 1) > 1 ? 's' : ''}</span>
        </div>
        <h3>${b.tourName}</h3>
        <p class="booking-detail">Payment: <strong>${paymentLabel(b.paymentStatus)}</strong></p>
        <div class="tour-footer">
          <span class="price">${formatCurrency(b.totalAmount)}</span>
          <span class="booking-payment-badge">${paymentLabel(b.paymentStatus)}</span>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function loadDemoBookings(user) {
  renderBookings(getDemoBookingsForUser(user.uid));
  // BroadcastChannel catches updates from admin in same tab; storage event
  // catches updates from admin in a different tab.
  onDemoStorageChange((type) => {
    if (type === 'bookings') {
      renderBookings(getDemoBookingsForUser(user.uid));
    }
  });
}

function loadFirebaseBookings(user) {
  const q = query(
    collection(db, 'bookings'),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(
    q,
    (snapshot) => {
      const bookings = [];
      snapshot.forEach((d) => bookings.push({ id: d.id, ...d.data() }));
      renderBookings(bookings);
    },
    () => {
      bookingsGrid.innerHTML =
        '<div class="loading-state">Could not load bookings. Please try again later.</div>';
    }
  );
}

function initPage(user) {
  userGreeting.textContent = `Welcome back, ${user.displayName || user.email}. Track your reservations below.`;
  if (isFirebaseConfigured) {
    loadFirebaseBookings(user);
  } else {
    loadDemoBookings(user);
  }
}

function initWhatsAppFloat() {
  const waFloat = document.getElementById('waFloat');
  if (!waFloat) return;
  const msg = buildQuickInquiryMessage();
  waFloat.href = buildWhatsAppLink(msg);
}

initAuthNav();
initMobileMenu();
initNavbarScroll();
initLanguageToggle();
initWhatsAppFloat();

/**
 * Auth guard — handles both demo mode (synchronous) and Firebase mode (async).
 *
 * Bug fix: Firebase rehydrates the session asynchronously after page load, so
 * `auth.currentUser` is always null when the JS first runs. The old code called
 * `getCurrentUser()` synchronously and immediately redirected unauthenticated.
 * We now show a loading skeleton and wait for the `onAuthStateChanged` callback
 * to fire before deciding whether to redirect or render bookings.
 */
if (!isFirebaseConfigured) {
  // Demo mode — session is stored in localStorage, available synchronously
  const user = getCurrentUser();
  if (!user) {
    redirectToLogin('/my-bookings.html');
  } else {
    initPage(user);
  }
} else {
  // Firebase mode — show a loading state while SDK rehydrates the session
  if (bookingsGrid) {
    bookingsGrid.innerHTML = '<div class="loading-state">Loading your bookings…</div>';
  }
  if (userGreeting) {
    userGreeting.textContent = 'Loading…';
  }
}

// `onUserAuthChanged` uses Firebase's `onAuthStateChanged` when configured,
// so it fires once the session is definitely resolved — with a real user object
// (if logged in) or null (if not). This is the single authoritative handler.
let pageInitialized = false;
onUserAuthChanged((authUser) => {
  if (!authUser) {
    redirectToLogin('/my-bookings.html');
  } else if (!pageInitialized) {
    pageInitialized = true;
    initPage(authUser);
  }
});
