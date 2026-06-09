import './style.css';
import { db, isFirebaseConfigured } from './firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { APP_CONFIG } from './config';
import { SEED_TOURS } from './data/seedTours';
import { buildWhatsAppLink, buildQuickInquiryMessage } from './utils/whatsapp';
import { initiateStripePayment, initiateTelebirrPayment, getBankTransferInstructions } from './services/payments';
import { submitTelebirrProof, pollPaymentStatus } from './services/paymentVerification';
import { compressImage } from './utils/compressImage';
import { notifyBookingCreated, notifyContactMessage } from './services/notifications';
import { trackPageView, trackTourView, trackBookingStart } from './services/analytics';
import {
  getDemoTours,
  addDemoBooking,
  addDemoMessage,
  addDemoSubscriber,
  onDemoStorageChange,
  DEMO_STORAGE_KEYS,
} from './services/demoStorage';
import { initLanguageToggle } from './i18n';
import { parseDurationDays } from './utils/formatDate';
import {
  requireUserForBooking,
  getCurrentUser,
  consumePendingBooking,
} from './services/userAuth';
import { initAuthNav, initMobileMenu, initNavbarScroll } from './utils/authNav';

gsap.registerPlugin(ScrollTrigger);

trackPageView();
initLanguageToggle();
initWhatsAppFloat();
initAuthNav();
handlePaymentReturn();
resumePendingBooking();

initNavbarScroll();

const slides = document.querySelectorAll('.slide');
let currentSlide = 0;
function nextSlide() {
  slides[currentSlide]?.classList.remove('active');
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide]?.classList.add('active');
}
if (slides.length) setInterval(nextSlide, 5000);

gsap.from('.reveal-text', { y: 50, opacity: 0, duration: 1.2, ease: 'power3.out' });
gsap.from('.reveal-up', { y: 30, opacity: 0, duration: 1, stagger: 0.2, ease: 'power3.out', delay: 0.5 });

const toursGrid = document.getElementById('toursGrid');
const tourSearch = document.getElementById('tourSearch');
let allTours = [];
let activeCategory = 'all';

function renderTours(tours) {
  if (!toursGrid) return;
  if (!tours.length) {
    toursGrid.innerHTML = '<div class="loading-state">No tours found matching your search.</div>';
    return;
  }

  toursGrid.innerHTML = tours
    .map(
      (t) => `
    <div class="tour-card" data-category="${t.category}">
      <div class="tour-img">
        <img src="${t.image || '/assets/lalibela.png'}" alt="${t.name}" loading="lazy">
        ${t.price < 1000 ? '<div class="tour-tag">Best Value</div>' : ''}
        ${t.available === false ? '<div class="tour-tag tour-unavailable">Fully Booked</div>' : ''}
      </div>
      <div class="tour-info">
        <div class="tour-meta">
          <span>${t.duration}</span> • <span>${t.category}</span>
          ${t.location ? ` • <span>${t.location}</span>` : ''}
        </div>
        <h3>${t.name}</h3>
        <p>${(t.description || '').substring(0, 100)}...</p>
        <div class="tour-footer">
          <span class="price">From ETB ${t.price.toLocaleString()}</span>
          <button class="btn btn-gold btn-sm book-tour-btn"
            data-id="${t.id}"
            data-name="${t.name}"
            data-price="${t.price}"
            ${t.available === false ? 'disabled' : ''}>
            ${t.available === false ? 'Unavailable' : 'Book Now'}
          </button>
        </div>
      </div>
    </div>`
    )
    .join('');

  document.querySelectorAll('.book-tour-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      trackTourView(btn.dataset.id, btn.dataset.name);
      trackBookingStart(btn.dataset.id);
      const user = requireUserForBooking(btn.dataset);
      if (user) openBookingModal(btn.dataset, user);
    });
  });
}

function applyFilters() {
  const term = (tourSearch?.value || '').toLowerCase();
  const dest = document.getElementById('filterDestination')?.value || '';
  const priceRange = document.getElementById('filterPrice')?.value || '';
  const durationRange = document.getElementById('filterDuration')?.value || '';

  let filtered = allTours.filter((t) => t.available !== false);

  if (activeCategory !== 'all') filtered = filtered.filter((t) => t.category === activeCategory);
  if (term) {
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        (t.description || '').toLowerCase().includes(term) ||
        (t.location || '').toLowerCase().includes(term)
    );
  }
  if (dest) filtered = filtered.filter((t) => (t.location || '').includes(dest));
  if (priceRange) {
    filtered = filtered.filter((t) => {
      if (priceRange === '200001+') return t.price >= 200001;
      const [min, max] = priceRange.split('-').map(Number);
      return t.price >= min && t.price <= max;
    });
  }
  if (durationRange) {
    filtered = filtered.filter((t) => {
      const days = parseDurationDays(t.duration);
      if (durationRange === '9+') return days >= 9;
      const [min, max] = durationRange.split('-').map(Number);
      return days >= min && days <= max;
    });
  }

  renderTours(filtered);
}

function populateDestinationFilter(tours) {
  const select = document.getElementById('filterDestination');
  if (!select) return;
  while (select.options.length > 1) select.remove(1);
  const locations = [...new Set(tours.map((t) => t.location).filter(Boolean))];
  locations.forEach((loc) => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    select.appendChild(opt);
  });
}

function populateContactTourSelect(tours) {
  const select = document.getElementById('cTour');
  if (!select) return;
  while (select.options.length > 2) select.remove(2);
  tours.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
}

function loadTours() {
  const toursQuery = query(collection(db, 'tours'), orderBy('name'));
  onSnapshot(
    toursQuery,
    (snapshot) => {
      allTours = [];
      snapshot.forEach((d) => allTours.push({ id: d.id, ...d.data() }));
      if (!allTours.length) {
        allTours = SEED_TOURS.map((t, i) => ({ id: `seed-${i}`, ...t }));
      }
      applyFilters();
      populateDestinationFilter(allTours);
      populateContactTourSelect(allTours);
    },
    () => {
      allTours = SEED_TOURS.map((t, i) => ({ id: `seed-${i}`, ...t }));
      renderTours(allTours);
    }
  );
}

loadTours();

tourSearch?.addEventListener('input', applyFilters);
document.getElementById('filterDestination')?.addEventListener('change', applyFilters);
document.getElementById('filterPrice')?.addEventListener('change', applyFilters);
document.getElementById('filterDuration')?.addEventListener('change', applyFilters);

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.filter;
    applyFilters();
  });
});

document.getElementById('clearFilters')?.addEventListener('click', () => {
  tourSearch.value = '';
  activeCategory = 'all';
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');
  ['filterDestination', 'filterPrice', 'filterDuration'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyFilters();
});

const bookingModal = document.getElementById('bookingModal');
const bookingForm = document.getElementById('bookingForm');
const closeBookingModal = document.getElementById('closeBookingModal');
const bankModal = document.getElementById('bankModal');

function openBookingModal(data, user = getCurrentUser()) {
  if (!bookingModal) return;
  document.getElementById('bookingTourId').value = data.id;
  document.getElementById('bookingTourName').value = data.name;
  document.getElementById('bookingTourPrice').value = data.price;
  document.getElementById('summaryTourName').innerText = data.name;
  document.getElementById('summaryTourPrice').innerText = `ETB ${data.price.toLocaleString()}`;

  if (user) {
    const nameEl = document.getElementById('bName');
    const emailEl = document.getElementById('bEmail');
    if (nameEl && !nameEl.value) nameEl.value = user.displayName || '';
    if (emailEl && !emailEl.value) emailEl.value = user.email || '';
  }

  bookingModal.classList.add('active');
}

function resumePendingBooking() {
  const pending = consumePendingBooking();
  const user = getCurrentUser();
  if (pending && user) {
    setTimeout(() => openBookingModal(pending, user), 500);
  }
}

closeBookingModal?.addEventListener('click', () => bookingModal.classList.remove('active'));
bookingModal?.addEventListener('click', (e) => {
  if (e.target === bookingModal) bookingModal.classList.remove('active');
});

document.getElementById('bParticipants')?.addEventListener('input', updateBookingTotal);
function updateBookingTotal() {
  const participants = parseInt(document.getElementById('bParticipants')?.value || 1, 10);
  const price = parseFloat(document.getElementById('bookingTourPrice')?.value || 0);
  document.getElementById('summaryTourPrice').innerText = `ETB ${(price * participants).toLocaleString()} total`;
}

bookingForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const user = getCurrentUser();
  if (!user) {
    requireUserForBooking({
      id: document.getElementById('bookingTourId').value,
      name: document.getElementById('bookingTourName').value,
      price: document.getElementById('bookingTourPrice').value,
    });
    return;
  }

  const submitBtn = bookingForm.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  const tourName = document.getElementById('bookingTourName').value;
  const participants = parseInt(document.getElementById('bParticipants').value, 10);
  const price = parseFloat(document.getElementById('bookingTourPrice').value);
  const totalAmount = participants * price;
  const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'stripe';

  const submitBooking = async (bookingData) => {
    const docRef = await addDoc(collection(db, 'bookings'), {
      ...bookingData,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  };

  const bookingData = {
    userId: user.uid,
    tourId: document.getElementById('bookingTourId').value,
    tourName,
    customerName: document.getElementById('bName').value,
    email: user.email,
    phone: document.getElementById('bPhone').value,
    participants,
    date: document.getElementById('bDate').value,
    requests: document.getElementById('bRequests').value,
    paymentMethod,
    totalAmount,
  };

  try {
    const bookingId = await submitBooking(bookingData);
    bookingData.id = bookingId;

    await notifyBookingCreated(bookingData);

    if (paymentMethod === 'stripe') {
      const result = await initiateStripePayment(bookingData);
      if (result.redirectUrl) {
        window.open(result.redirectUrl, '_blank');
        bookingModal.classList.remove('active');
        bookingForm.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Book Now';
        alert('Booking submitted! Complete payment via Stripe in the new tab.');
        return;
      }
    }

    if (paymentMethod === 'telebirr') {
      await initiateTelebirrPayment(bookingData);
      showTelebirrInstructions(bookingData, getBankTransferInstructions(bookingData));
      bookingModal.classList.remove('active');
      bookingForm.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Book Now';
      return;
    }

    if (paymentMethod === 'bank') {
      showBankInstructions(getBankTransferInstructions(bookingData));
    }

    bookingModal.classList.remove('active');
    bookingForm.reset();
    alert('Booking submitted successfully! We will contact you shortly to confirm.');
  } catch (error) {
    console.error('Booking Error:', error);
    alert('There was an error submitting your booking. Please try again or contact us via WhatsApp.');
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Confirm & Book Now';
});

function showBankInstructions(instructions) {
  const el = document.getElementById('bankInstructions');
  if (!el) return;
  el.innerHTML = `
    <p>Please transfer <strong>ETB ${instructions.amount.toLocaleString()}</strong> using the details below:</p>
    <div class="bank-detail"><strong>Bank:</strong> ${instructions.bankName}</div>
    <div class="bank-detail"><strong>Account Name:</strong> ${instructions.accountName}</div>
    <div class="bank-detail"><strong>Account Number:</strong> ${instructions.accountNumber}</div>
    <div class="bank-detail"><strong>SWIFT:</strong> ${instructions.swift}</div>
    <div class="bank-detail"><strong>Reference:</strong> ${instructions.reference}</div>
    <p class="bank-note">${instructions.note}</p>`;
  bankModal?.classList.add('active');
}

function showTelebirrInstructions(booking, instructions) {
  const el = document.getElementById('bankInstructions');
  if (!el) return;

  el.innerHTML = `
    <p>Complete your Telebirr payment of <strong>ETB ${instructions.amount.toLocaleString()}</strong>, then submit your proof below for admin verification.</p>
    <div class="bank-detail"><strong>Reference:</strong> ${instructions.reference}</div>
    <p class="bank-note">After paying via Telebirr, enter your transaction ID or upload a receipt screenshot.</p>
    <form id="telebirrProofForm" class="telebirr-proof-form">
      <div class="form-group">
        <label>Telebirr Transaction ID</label>
        <input type="text" id="telebirrTxnId" placeholder="e.g. TB123456789">
      </div>
      <div class="form-group">
        <label>Receipt Screenshot (optional)</label>
        <input type="file" id="telebirrReceipt" accept="image/*">
      </div>
      <button type="submit" class="btn btn-gold btn-block">Submit Payment Proof</button>
    </form>`;

  bankModal?.classList.add('active');

  document.getElementById('telebirrProofForm')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const transactionId = document.getElementById('telebirrTxnId')?.value.trim() || '';
    const file = document.getElementById('telebirrReceipt')?.files?.[0];
    let receiptImage = '';

    if (file) {
      const compressed = await compressImage(file);
      receiptImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });
    }

    if (!transactionId && !receiptImage) {
      alert('Please provide a transaction ID or receipt image.');
      return;
    }

    try {
      await submitTelebirrProof(booking.id, {
        transactionId,
        receiptImage,
        email: booking.email,
      });
      bankModal?.classList.remove('active');
      alert('Payment proof submitted. An admin will verify your Telebirr payment shortly.');
    } catch (err) {
      console.error(err);
      alert('Could not submit payment proof. Please try again or contact us via WhatsApp.');
    }
  });
}

document.getElementById('closeBankModal')?.addEventListener('click', () => bankModal?.classList.remove('active'));
document.getElementById('bankModalDone')?.addEventListener('click', () => bankModal?.classList.remove('active'));

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get('payment');
  const bookingId = params.get('booking');

  if (!bookingId || (paymentState !== 'pending' && paymentState !== 'success')) return;

  window.history.replaceState({}, '', window.location.pathname);
  showPaymentPendingMessage();

  const verified = await pollPaymentStatus(bookingId);
  if (verified?.paymentStatus === 'paid') {
    showClientReceipt({
      receiptId: verified.transactionId || bookingId,
      amount: verified.totalAmount,
    });
  } else {
    showPaymentPendingMessage(true);
  }
}

function showPaymentPendingMessage(stillPending = false) {
  const modal = document.getElementById('receiptModal');
  const el = document.getElementById('clientReceipt');
  if (!modal || !el) return;
  el.innerHTML = stillPending
    ? `<p>Your payment is being verified securely. You will receive confirmation once the payment is confirmed by our system.</p>`
    : `<p>Verifying your payment securely. Please wait...</p>`;
  modal.classList.add('active');
}

function showClientReceipt(receipt) {
  const modal = document.getElementById('receiptModal');
  const el = document.getElementById('clientReceipt');
  if (!modal || !el) return;
  el.innerHTML = `
    <p>Thank you! Your payment has been confirmed.</p>
    <p><strong>Reference:</strong> ${receipt.receiptId}</p>
    ${receipt.amount ? `<p><strong>Amount:</strong> ETB ${Number(receipt.amount).toLocaleString()}</p>` : ''}`;
  modal.classList.add('active');
}

document.getElementById('closeReceiptModal')?.addEventListener('click', () => {
  document.getElementById('receiptModal')?.classList.remove('active');
});

async function submitContactMessage(messageData) {
  try {
    await addDoc(collection(db, 'messages'), {
      ...messageData,
      status: 'new',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Message submission failed:', err);
    throw err;
  }
}

document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageData = {
    name: document.getElementById('cName').value,
    email: document.getElementById('cEmail').value,
    interestedIn: document.getElementById('cTour').value,
    subject: document.getElementById('cTour').value || 'General Inquiry',
    message: document.getElementById('cMessage').value,
  };

  try {
    await submitContactMessage(messageData);
    await notifyContactMessage(messageData);
    e.target.reset();
    alert('Thank you! Your message has been sent. We will respond within 24 hours.');
  } catch {
    alert('Message sent! We will get back to you soon.');
  }
});

async function subscribeNewsletter(email) {
  try {
    await addDoc(collection(db, 'subscribers'), {
      email,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Newsletter submission failed:', err);
    throw err;
  }
}

document.getElementById('newsletterForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('newsletterEmail').value;
  try {
    await subscribeNewsletter(email);
    e.target.reset();
    alert('Welcome! You have been subscribed to our newsletter.');
  } catch {
    alert('Thank you for subscribing!');
  }
});

function initWhatsAppFloat() {
  const waFloat = document.getElementById('waFloat');
  if (!waFloat) return;
  const msg = buildQuickInquiryMessage();
  waFloat.href = buildWhatsAppLink(msg);
  waFloat.href = `https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

initMobileMenu();

document.querySelectorAll('.stat-number').forEach((stat) => {
  const target = parseInt(stat.getAttribute('data-target'), 10);
  ScrollTrigger.create({
    trigger: stat,
    start: 'top 90%',
    onEnter: () => {
      gsap.to(stat, { innerText: target, duration: 2, snap: { innerText: 1 }, ease: 'power1.out' });
    },
  });
});

document.querySelectorAll('.nav-item').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href?.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        gsap.to(window, { duration: 1, scrollTo: target.offsetTop - 80, ease: 'power3.inOut' });
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        this.classList.add('active');
        document.querySelector('.nav-links')?.classList.remove('open');
      }
    }
  });
});
