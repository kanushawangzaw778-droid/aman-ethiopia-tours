import { auth, db, storage, isFirebaseConfigured } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Chart, registerables } from 'chart.js';
import { compressImage } from './utils/compressImage';
import { formatFirestoreDate, formatCurrency } from './utils/formatDate';
import { getBookingsChartData } from './services/analytics';
import {
  getDemoTours,
  saveDemoTours,
  getDemoBookings,
  updateDemoBooking,
  getDemoMessages,
  updateDemoMessage,
  DEMO_STORAGE_KEYS,
} from './services/demoStorage';
import { generateReceipt } from './services/payments';
import { approvePaymentReview, rejectPaymentReview } from './services/paymentVerification';
import { notifyBookingStatusEmail } from './services/bookingEmails';
import { SEED_TOURS } from './data/seedTours';
import { APP_CONFIG } from './config';

Chart.register(...registerables);

let allBookings = [];
let allTours = [];
let bookingsChart = null;

// BroadcastChannel lets the admin tab push data-change events to all other
// open tabs (including the customer-facing index page) in the same browser.
// This fills the gap where same-tab `storage` events don't fire.
const adminBroadcast = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('aman_demo_sync')
  : null;

function broadcastChange(type) {
  adminBroadcast?.postMessage({ type, ts: Date.now() });
}

const loginForm = document.getElementById('loginForm');
const loginOverlay = document.getElementById('loginOverlay');
const adminApp = document.getElementById('adminApp');
const loginError = document.getElementById('loginError');

const SESSION_KEY = 'aman_admin_session';

function showAdminApp(email) {
  loginOverlay.style.display = 'none';
  adminApp.style.display = 'flex';
  document.getElementById('userEmail').innerText = email || APP_CONFIG.adminEmail;
  
  const demoBadge = document.getElementById('demoBadge');
  if (demoBadge) {
    demoBadge.style.display = isFirebaseConfigured ? 'none' : 'block';
  }

  initDashboard();
}

function hideAdminApp() {
  loginOverlay.style.display = 'flex';
  adminApp.style.display = 'none';
}

function saveLocalSession(email, remember) {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify({ email }));
  if (!remember) localStorage.removeItem(SESSION_KEY);
  else sessionStorage.removeItem(SESSION_KEY);
}

function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function checkLocalSession() {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  try {
    showAdminApp(JSON.parse(raw).email);
    return true;
  } catch {
    clearLocalSession();
    return false;
  }
}

function isValidAdminCredentials(email, password) {
  return email === APP_CONFIG.adminEmail && password === APP_CONFIG.adminPassword;
}

async function loginWithFirebase(email, password, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error.code === 'auth/user-not-found' && email === APP_CONFIG.adminEmail && password === APP_CONFIG.adminPassword) {
      await createUserWithEmailAndPassword(auth, email, password);
      return;
    }
    throw error;
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const remember = document.getElementById('rememberMe')?.checked ?? true;

  if (!isValidAdminCredentials(email, password)) {
    loginError.innerText = 'Invalid credentials. Please try again.';
    return;
  }

  try {
    if (isFirebaseConfigured) {
      try {
        await loginWithFirebase(email, password, remember);
      } catch (err) {
        console.warn('Firebase login unavailable, using local session:', err?.code || err);
        saveLocalSession(email, remember);
        showAdminApp(email);
      }
    } else {
      saveLocalSession(email, remember);
      showAdminApp(email);
    }
    loginError.innerText = '';
  } catch {
    loginError.innerText = 'Login failed. Please try again.';
  }
});

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email === APP_CONFIG.adminEmail) {
      showAdminApp(user.email);
    } else if (user) {
      signOut(auth);
      loginError.innerText = 'This account is not authorized for admin access.';
      hideAdminApp();
    } else if (!localStorage.getItem(SESSION_KEY) && !sessionStorage.getItem(SESSION_KEY)) {
      hideAdminApp();
    }
  });
} else if (!checkLocalSession()) {
  hideAdminApp();
}

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  clearLocalSession();
  if (isFirebaseConfigured) await signOut(auth);
  hideAdminApp();
});

const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
const views = document.querySelectorAll('.view');

navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const viewId = item.getAttribute('data-view');
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    views.forEach((v) => (v.style.display = 'none'));
    document.getElementById(`${viewId}View`).style.display = 'block';
    document.getElementById('viewTitle').innerText = item.innerText;
  });
});

function initDashboard() {
  if (!isFirebaseConfigured) {
    initDemoDashboard();
    return;
  }
  listenTours();
  listenBookings();
  listenMessages();
  loadSettings();
}

function computeBookingStats(bookings) {
  let revenue = 0;
  let pending = 0;
  let paid = 0;
  let unpaid = 0;
  let collected = 0;

  bookings.forEach((b) => {
    if (b.status === 'confirmed') revenue += b.totalAmount || 0;
    if (b.status === 'pending') pending++;
    if (b.paymentStatus === 'paid') {
      paid++;
      collected += b.totalAmount || 0;
    } else unpaid++;
  });

  return { revenue, pending, paid, unpaid, collected };
}

function refreshDemoBookings() {
  const stats = computeBookingStats(allBookings);
  renderBookingsTable(allBookings);
  renderPaymentsTable(allBookings);
  updateDashboardStats(allBookings.length, stats.revenue, stats.pending, stats.paid, stats.unpaid, stats.collected);
  updateBookingsChart(allBookings);
  renderPopularTours(allTours, allBookings);
}

function renderMessagesTable(messages) {
  const tbody = document.querySelector('#messagesTable tbody');
  if (!tbody) return;
  if (!messages.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#888;">No messages yet</td></tr>';
    return;
  }
  tbody.innerHTML = messages
    .map(
      (m) => `
    <tr>
      <td>${formatFirestoreDate(m.createdAt)}</td>
      <td><strong>${m.name}</strong></td>
      <td>${m.email}</td>
      <td>${m.subject || m.interestedIn || '—'}</td>
      <td class="msg-cell">${m.message?.substring(0, 80)}${m.message?.length > 80 ? '...' : ''}</td>
      <td>
        <select class="msg-status" data-id="${m.id}">
          <option value="new" ${m.status === 'new' ? 'selected' : ''}>New</option>
          <option value="read" ${m.status === 'read' ? 'selected' : ''}>Read</option>
          <option value="replied" ${m.status === 'replied' ? 'selected' : ''}>Replied</option>
        </select>
      </td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('.msg-status').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (isFirebaseConfigured) {
        updateDoc(doc(db, 'messages', sel.dataset.id), { status: sel.value });
      } else {
        updateDemoMessage(sel.dataset.id, { status: sel.value });
        renderMessagesTable(getDemoMessages());
      }
    });
  });
}

function initDemoDashboard() {
  allTours = getDemoTours(SEED_TOURS);
  allBookings = getDemoBookings();
  renderToursTable(allTours);
  refreshDemoBookings();
  document.getElementById('countTours').innerText = allTours.length;
  renderMessagesTable(getDemoMessages());

  window.addEventListener('storage', (e) => {
    if (e.key === DEMO_STORAGE_KEYS.TOURS) {
      allTours = getDemoTours(SEED_TOURS);
      renderToursTable(allTours);
      document.getElementById('countTours').innerText = allTours.length;
      renderPopularTours(allTours, allBookings);
    }
    if (e.key === DEMO_STORAGE_KEYS.BOOKINGS) {
      allBookings = getDemoBookings();
      refreshDemoBookings();
    }
    if (e.key === DEMO_STORAGE_KEYS.MESSAGES) {
      renderMessagesTable(getDemoMessages());
    }
  });
}

function listenTours() {
  const q = query(collection(db, 'tours'), orderBy('name'));
  onSnapshot(q, (snapshot) => {
    allTours = [];
    snapshot.forEach((d) => allTours.push({ id: d.id, ...d.data() }));
    renderToursTable(allTours);
    document.getElementById('countTours').innerText = allTours.length;
    renderPopularTours(allTours, allBookings);
  }, () => {
    document.getElementById('countTours').innerText = '—';
  });
}

function listenBookings() {
  const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    allBookings = [];
    let revenue = 0;
    let pending = 0;
    let paid = 0;
    let unpaid = 0;
    let collected = 0;

    snapshot.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      allBookings.push(data);
      if (data.status === 'confirmed') revenue += data.totalAmount || 0;
      if (data.status === 'pending') pending++;
      if (data.paymentStatus === 'paid') {
        paid++;
        collected += data.totalAmount || 0;
      } else unpaid++;
    });

    renderBookingsTable(allBookings);
    renderPaymentsTable(allBookings);
    updateDashboardStats(allBookings.length, revenue, pending, paid, unpaid, collected);
    renderPopularTours(allTours, allBookings);
    updateBookingsChart(allBookings);
  }, () => {
    document.getElementById('countBookings').innerText = '—';
  });
}

function listenMessages() {
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((d) => messages.push({ id: d.id, ...d.data() }));
    renderMessagesTable(messages);
  });
}

function updateDashboardStats(bookingCount, revenue, pending, paid, unpaid, collected) {
  document.getElementById('countBookings').innerText = bookingCount;
  document.getElementById('totalRevenue').innerText = formatCurrency(revenue);
  document.getElementById('countPending').innerText = pending;
  document.getElementById('countPaid').innerText = paid;
  document.getElementById('countUnpaid').innerText = unpaid;
  document.getElementById('totalCollected').innerText = formatCurrency(collected);
}

function updateBookingsChart(bookings) {
  const canvas = document.getElementById('bookingsChart');
  if (!canvas) return;
  const period = document.getElementById('chartPeriod')?.value || 'week';
  const { labels, data } = getBookingsChartData(bookings, period);

  if (bookingsChart) bookingsChart.destroy();
  bookingsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        label: 'Bookings',
        data: data.length ? data : [0],
        backgroundColor: 'rgba(45, 90, 61, 0.7)',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

document.getElementById('chartPeriod')?.addEventListener('change', () => updateBookingsChart(allBookings));

function renderPopularTours(tours, bookings) {
  const el = document.getElementById('popularToursList');
  if (!el) return;
  const counts = {};
  bookings.forEach((b) => {
    counts[b.tourId] = (counts[b.tourId] || 0) + 1;
  });
  const popular = Object.entries(counts)
    .map(([id, count]) => ({ tour: tours.find((t) => t.id === id), count }))
    .filter((p) => p.tour)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (!popular.length) {
    el.innerHTML = '<p class="empty-chart">No booking data yet</p>';
    return;
  }
  el.innerHTML = popular
    .map(
      (p, i) => `
    <div class="popular-item">
      <span class="popular-rank">${i + 1}</span>
      <div class="popular-info">
        <strong>${p.tour.name}</strong>
        <small>${p.count} booking${p.count > 1 ? 's' : ''}</small>
      </div>
    </div>`
    )
    .join('');
}

function renderToursTable(tours) {
  const tbody = document.querySelector('#toursTable tbody');
  if (!tbody) return;
  if (!tours.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">No tours yet. Add your first tour!</td></tr>';
    return;
  }
  tbody.innerHTML = tours
    .map(
      (t) => `
    <tr>
      <td>
        <div class="tour-cell">
          <img src="${t.image || '/assets/lalibela.png'}" alt="">
          ${t.name}
        </div>
      </td>
      <td>${t.location || '—'}</td>
      <td>${formatCurrency(t.price)}</td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td><span class="status-badge status-${t.available !== false ? 'confirmed' : 'rejected'}">${t.available !== false ? 'Available' : 'Unavailable'}</span></td>
      <td>
        <button class="btn btn-text btn-sm edit-tour" data-id="${t.id}">Edit</button>
        <button class="btn btn-text btn-sm text-danger delete-tour" data-id="${t.id}">Delete</button>
      </td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('.edit-tour').forEach((btn) => {
    btn.addEventListener('click', () => openTourModal(tours.find((t) => t.id === btn.dataset.id)));
  });
  document.querySelectorAll('.delete-tour').forEach((btn) => {
    btn.addEventListener('click', () => deleteTour(btn.dataset.id));
  });
}

function renderBookingsTable(bookings) {
  const filter = document.getElementById('bookingFilter')?.value || 'all';
  const filtered = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const rowHtml = (b) => `
    <tr>
      <td>${formatFirestoreDate(b.createdAt)}</td>
      <td><strong>${b.customerName}</strong><br><small>${b.phone}</small></td>
      <td>${b.tourName}</td>
      <td>${b.date || '—'}</td>
      <td>${b.participants}</td>
      <td>${formatCurrency(b.totalAmount)}</td>
      <td><span class="status-badge status-${paymentStatusBadgeClass(b.paymentStatus)}">${b.paymentStatus || 'pending'}</span></td>
      <td><span class="status-badge status-${b.status}">${b.status}</span></td>
      <td>
        <select class="status-updater" data-id="${b.id}">
          <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirm</option>
          <option value="rejected" ${b.status === 'rejected' ? 'selected' : ''}>Reject</option>
        </select>
      </td>
    </tr>`;

  const tbody = document.querySelector('#allBookingsTable tbody');
  const recentTbody = document.querySelector('#recentBookingsTable tbody');
  if (tbody) tbody.innerHTML = filtered.map(rowHtml).join('') || '<tr><td colspan="9" style="text-align:center;padding:2rem;">No bookings</td></tr>';
  if (recentTbody) {
    recentTbody.innerHTML = bookings.slice(0, 5).map((b) => `
      <tr>
        <td>${formatFirestoreDate(b.createdAt)}</td>
        <td><strong>${b.customerName}</strong></td>
        <td>${b.tourName}</td>
        <td>${formatCurrency(b.totalAmount)}</td>
        <td><span class="status-badge status-${b.status}">${b.status}</span></td>
      </tr>`).join('');
  }

  document.querySelectorAll('.status-updater').forEach((select) => {
    select.addEventListener('change', (e) => updateBookingStatus(select.dataset.id, e.target.value));
  });
}

document.getElementById('bookingFilter')?.addEventListener('change', () => renderBookingsTable(allBookings));

function paymentStatusBadgeClass(status) {
  if (status === 'paid') return 'confirmed';
  if (status === 'failed') return 'rejected';
  if (status === 'pending_review') return 'pending';
  return 'pending';
}

function renderPaymentsTable(bookings) {
  const tbody = document.querySelector('#paymentsTable tbody');
  if (!tbody) return;

  const pendingReview = bookings.filter((b) => b.paymentStatus === 'pending_review');
  tbody.innerHTML = bookings
    .map(
      (b) => `
    <tr>
      <td>${formatFirestoreDate(b.createdAt)}</td>
      <td>${b.customerName}</td>
      <td>${b.tourName}</td>
      <td>${b.paymentMethod || '—'}</td>
      <td>${formatCurrency(b.totalAmount)}</td>
      <td><span class="status-badge status-${paymentStatusBadgeClass(b.paymentStatus)}">${b.paymentStatus || 'pending'}</span></td>
      <td>${
        b.paymentStatus === 'pending_review'
          ? `<button class="btn btn-text btn-sm approve-payment" data-id="${b.id}">Approve</button>
             <button class="btn btn-text btn-sm text-danger reject-payment" data-id="${b.id}">Reject</button>
             ${b.transactionId ? `<small>TXN: ${b.transactionId}</small>` : ''}
             ${b.receiptImage ? `<a class="btn btn-text btn-sm" href="${b.receiptImage}" target="_blank">Receipt</a>` : ''}`
          : b.receipt
            ? `<button class="btn btn-text btn-sm view-receipt" data-id="${b.id}">View</button>`
            : '—'
      }</td>
    </tr>`
    )
    .join('');

  document.querySelectorAll('.view-receipt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const booking = allBookings.find((b) => b.id === btn.dataset.id);
      if (booking?.receipt) showReceipt(booking.receipt);
    });
  });

  document.querySelectorAll('.approve-payment').forEach((btn) => {
    btn.addEventListener('click', () => verifyPayment(btn.dataset.id, 'approve'));
  });

  document.querySelectorAll('.reject-payment').forEach((btn) => {
    btn.addEventListener('click', () => verifyPayment(btn.dataset.id, 'reject'));
  });

  const unpaidEl = document.getElementById('countUnpaid');
  if (unpaidEl) {
    unpaidEl.innerText = bookings.filter((b) => b.paymentStatus !== 'paid').length;
  }

  renderPendingReviewNotice(pendingReview.length);
}

function renderPendingReviewNotice(count) {
  let notice = document.getElementById('pendingReviewNotice');
  if (!notice) {
    const paymentsView = document.getElementById('paymentsView');
    if (!paymentsView) return;
    notice = document.createElement('p');
    notice.id = 'pendingReviewNotice';
    notice.className = 'settings-note';
    paymentsView.querySelector('.view-header')?.after(notice);
  }
  notice.textContent =
    count > 0
      ? `${count} Telebirr payment(s) awaiting manual verification.`
      : 'No Telebirr payments awaiting review.';
}

async function verifyPayment(bookingId, action) {
  const label = action === 'approve' ? 'approve' : 'reject';
  if (!confirm(`Are you sure you want to ${label} this payment?`)) return;

  try {
    if (action === 'approve') {
      await approvePaymentReview(bookingId);
    } else {
      await rejectPaymentReview(bookingId);
    }
    if (!isFirebaseConfigured) {
      allBookings = getDemoBookings();
      refreshDemoBookings();
    }
  } catch (err) {
    console.error(err);
    alert(`Failed to ${label} payment. Ensure you are logged in and the backend is running.`);
  }
}

function showReceipt(receipt) {
  const modal = document.getElementById('receiptModal');
  const content = document.getElementById('receiptContent');
  content.innerHTML = `
    <p><strong>Receipt ID:</strong> ${receipt.receiptId}</p>
    <p><strong>Date:</strong> ${new Date(receipt.date).toLocaleString()}</p>
    <p><strong>Customer:</strong> ${receipt.customer}</p>
    <p><strong>Tour:</strong> ${receipt.tour}</p>
    <p><strong>Travelers:</strong> ${receipt.travelers}</p>
    <p><strong>Travel Date:</strong> ${receipt.travelDate}</p>
    <p><strong>Amount:</strong> ${formatCurrency(receipt.amount)}</p>
    <p><strong>Payment:</strong> ${receipt.paymentMethod} (${receipt.paymentStatus})</p>`;
  modal.classList.add('active');
}

document.getElementById('closeReceiptModal')?.addEventListener('click', () => {
  document.getElementById('receiptModal').classList.remove('active');
});
document.getElementById('printReceiptBtn')?.addEventListener('click', () => window.print());

const tourModal = document.getElementById('tourModal');
const tourForm = document.getElementById('tourForm');
const tImageFile = document.getElementById('tImageFile');
const imagePreview = document.getElementById('imagePreview');
let pendingImages = [];

document.getElementById('addNewTourBtn')?.addEventListener('click', () => openTourModal());
document.getElementById('closeTourModal')?.addEventListener('click', () => tourModal.classList.remove('active'));

function openTourModal(tour = null) {
  tourModal.classList.add('active');
  pendingImages = tour?.images || (tour?.image ? [tour.image] : []);
  document.getElementById('modalTitle').innerText = tour ? 'Edit Tour' : 'Add New Tour';
  document.getElementById('tourId').value = tour?.id || '';
  document.getElementById('tName').value = tour?.name || '';
  document.getElementById('tPrice').value = tour?.price || '';
  document.getElementById('tLocation').value = tour?.location || '';
  document.getElementById('tDuration').value = tour?.duration || '';
  document.getElementById('tCategory').value = tour?.category || 'cultural';
  document.getElementById('tMaxSlots').value = tour?.maxSlots || 12;
  document.getElementById('tAvailable').checked = tour?.available !== false;
  document.getElementById('tDescription').value = tour?.description || '';
  document.getElementById('tImage').value = tour?.image || '';
  renderImagePreviews();
}

function renderImagePreviews() {
  if (!imagePreview) return;
  imagePreview.innerHTML = pendingImages
    .map(
      (url, i) => `
    <div class="preview-item">
      <img src="${url}" alt="Preview">
      <button type="button" class="remove-img" data-idx="${i}">&times;</button>
    </div>`
    )
    .join('');
  imagePreview.querySelectorAll('.remove-img').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingImages.splice(parseInt(btn.dataset.idx), 1);
      renderImagePreviews();
    });
  });
}

tImageFile?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const saveBtn = document.getElementById('saveTourBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Uploading...';

  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      const storageRef = ref(storage, `tours/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(snapshot.ref);
      pendingImages.push(url);
    } catch (err) {
      console.error('Upload failed', err);
    }
  }

  renderImagePreviews();
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Tour';
  tImageFile.value = '';
});

tourForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('tourId').value;
  const tourData = {
    name: document.getElementById('tName').value,
    price: parseInt(document.getElementById('tPrice').value, 10),
    location: document.getElementById('tLocation').value,
    duration: document.getElementById('tDuration').value,
    category: document.getElementById('tCategory').value,
    description: document.getElementById('tDescription').value,
    maxSlots: parseInt(document.getElementById('tMaxSlots').value, 10) || 12,
    available: document.getElementById('tAvailable').checked,
    images: pendingImages,
    image: pendingImages[0] || '/assets/lalibela.png',
    updatedAt: new Date().toISOString(),
  };

  try {
    if (isFirebaseConfigured) {
      tourData.updatedAt = serverTimestamp();
      if (id) {
        await updateDoc(doc(db, 'tours', id), tourData);
      } else {
        tourData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'tours'), tourData);
      }
    } else {
      // Demo Mode Support
      if (id) {
        const idx = allTours.findIndex((t) => t.id === id);
        if (idx !== -1) allTours[idx] = { ...allTours[idx], ...tourData };
      } else {
        const newTour = {
          id: `local-${Date.now()}`,
          ...tourData,
          createdAt: new Date().toISOString(),
        };
        allTours.unshift(newTour);
      }
      saveDemoTours(allTours);
      renderToursTable(allTours);
      document.getElementById('countTours').innerText = allTours.length;
      // Notify other tabs + trigger same-tab listeners via a storage event shim
      broadcastChange('tours');
    }

    tourModal.classList.remove('active');
    tourForm.reset();
    pendingImages = [];
  } catch (err) {
    console.error('Error saving tour:', err);
    alert('Failed to save tour. Check Firebase configuration or console.');
  }
});

async function deleteTour(id) {
  if (!confirm('Are you sure you want to delete this tour? This cannot be undone.')) return;

  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'tours', id));
      // onSnapshot will re-render the table automatically
    } catch (err) {
      console.error('Failed to delete tour:', err);
      alert('Could not delete tour. Check your admin permissions.');
    }
  } else {
    allTours = allTours.filter((t) => t.id !== id);
    saveDemoTours(allTours);
    renderToursTable(allTours);
    document.getElementById('countTours').innerText = allTours.length;
    // Push change to customer-facing pages
    broadcastChange('tours');
  }
}

async function sendBookingStatusEmail(bookingId, type) {
  if (!isFirebaseConfigured || !auth.currentUser) return;
  const token = await auth.currentUser.getIdToken();
  await notifyBookingStatusEmail(bookingId, type, token);
}

async function updateBookingStatus(id, status) {
  const booking = allBookings.find((b) => b.id === id);

  // Warn admin if payment hasn't been verified, but don't block — admin may
  // have received payment via a channel not yet reflected in the system.
  if (
    status === 'confirmed' &&
    booking?.paymentStatus !== 'paid' &&
    booking?.paymentStatus !== 'pending_review'
  ) {
    const proceed = confirm(
      `Payment for this booking is still "${booking?.paymentStatus || 'pending'}".\n\n` +
      'Are you sure you want to confirm this booking without verified payment?'
    );
    if (!proceed) {
      // Revert the select UI to previous value
      renderBookingsTable(allBookings);
      return;
    }
  }

  if (!isFirebaseConfigured) {
    const updates = { status };
    if (status === 'confirmed') updates.confirmedAt = new Date().toISOString();
    updateDemoBooking(id, updates);
    allBookings = getDemoBookings();
    refreshDemoBookings();
    broadcastChange('bookings');
    return;
  }

  try {
    const updates = { status, updatedAt: serverTimestamp() };
    if (status === 'confirmed') updates.confirmedAt = serverTimestamp();
    await updateDoc(doc(db, 'bookings', id), updates);

    if (status === 'confirmed') {
      await sendBookingStatusEmail(id, 'booking_confirmed');
    } else if (status === 'rejected') {
      await sendBookingStatusEmail(id, 'booking_rejected');
    }
  } catch (err) {
    console.error('Failed to update booking status:', err);
    alert('Could not update booking status. Check your permissions and connection.');
    renderBookingsTable(allBookings); // revert optimistic UI
  }
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'company'));
    if (snap.exists()) {
      const s = snap.data();
      document.getElementById('sWhatsapp').value = s.whatsapp || APP_CONFIG.whatsappNumber;
      document.getElementById('sEmail').value = s.email || APP_CONFIG.companyEmail;
      document.getElementById('sPhone').value = s.phone || APP_CONFIG.companyPhone;
    }
  } catch {
    /* settings doc may not exist yet */
  }
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await setDoc(doc(db, 'settings', 'company'), {
    whatsapp: document.getElementById('sWhatsapp').value,
    email: document.getElementById('sEmail').value,
    phone: document.getElementById('sPhone').value,
    updatedAt: serverTimestamp(),
  });
  alert('Settings saved.');
});

document.getElementById('seedToursBtn')?.addEventListener('click', async () => {
  if (!confirm('This will add sample tours to Firestore. Continue?')) return;
  for (const tour of SEED_TOURS) {
    await addDoc(collection(db, 'tours'), { ...tour, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  alert(`${SEED_TOURS.length} sample tours added.`);
});

if (!isFirebaseConfigured) {
  console.warn('Firebase not configured. Set VITE_FIREBASE_* variables in .env');
}
