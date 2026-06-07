import './style.css';
import { 
  db, auth, storage, isFirebaseConfigured 
} from './firebase';
import { 
  collection, query, where, orderBy, onSnapshot, doc, getDoc, 
  addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  ref, uploadBytes, getDownloadURL 
} from 'firebase/storage';
import { formatFirestoreDate, formatCurrency } from './utils/formatDate';
import { SEED_TOURS } from './data/seedTours';
import { notifyBookingStatusEmail } from './services/bookingEmails';

const APP_CONFIG = {
  adminEmail: import.meta.env.VITE_ADMIN_EMAIL || 'kanushawangzaw@gmail.com',
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER || '251911000000',
  companyEmail: import.meta.env.VITE_COMPANY_EMAIL || 'info@amanethiopiatours.com',
  companyPhone: import.meta.env.VITE_COMPANY_PHONE || '+251 989610664',
};

const SESSION_KEY = 'aman_admin_session';

const loginForm = document.getElementById('loginForm');
const loginOverlay = document.getElementById('loginOverlay');
const adminApp = document.getElementById('adminApp');
const loginError = document.getElementById('loginError');

let allBookings = [];
let allTours = [];
let bookingsChart = null;

/**
 * UI State Management
 */
function showAdminApp(email) {
  loginOverlay.style.display = 'none';
  adminApp.style.display = 'flex';
  document.getElementById('userEmail').innerText = email || APP_CONFIG.adminEmail;
  initDashboard();
}

function hideAdminApp() {
  loginOverlay.style.display = 'flex';
  adminApp.style.display = 'none';
}

/**
 * Auth Logic (Strict Firebase)
 */
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const remember = document.getElementById('rememberMe').checked;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (cred.user.email === APP_CONFIG.adminEmail) {
      if (remember) {
        localStorage.setItem(SESSION_KEY, 'true');
      } else {
        sessionStorage.setItem(SESSION_KEY, 'true');
      }
      showAdminApp(cred.user.email);
    } else {
      await signOut(auth);
      loginError.innerText = 'Unauthorized email address.';
    }
  } catch (err) {
    console.error('Login failed:', err);
    loginError.innerText = 'Invalid credentials or network error.';
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && user.email === APP_CONFIG.adminEmail) {
    showAdminApp(user.email);
  } else {
    const hasSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!hasSession) hideAdminApp();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  await signOut(auth);
  hideAdminApp();
});

/**
 * Real-time Data Listeners
 */
function initDashboard() {
  listenTours();
  listenBookings();
  listenMessages();
  loadSettings();
}

function listenTours() {
  const q = query(collection(db, 'tours'), orderBy('name', 'asc'));
  onSnapshot(q, (snapshot) => {
    allTours = [];
    snapshot.forEach((d) => allTours.push({ id: d.id, ...d.data() }));
    renderToursTable(allTours);
    document.getElementById('countTours').innerText = allTours.length;
  }, (err) => console.error('Tours sync error:', err));
}

function listenBookings() {
  const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    allBookings = [];
    snapshot.forEach((d) => allBookings.push({ id: d.id, ...d.data() }));
    renderBookingsTable(allBookings);
    updateDashboardStats();
    updateBookingsChart(allBookings);
    renderPopularTours(allTours, allBookings);
  }, (err) => console.error('Bookings sync error:', err));
}

function listenMessages() {
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    const messages = [];
    snapshot.forEach((d) => messages.push({ id: d.id, ...d.data() }));
    renderMessagesTable(messages);
  }, (err) => console.error('Messages sync error:', err));
}

/**
 * Rendering Logic
 */
function updateDashboardStats() {
  let revenue = 0;
  let pending = 0;
  let paid = 0;
  let unpaid = 0;
  let collected = 0;

  allBookings.forEach((b) => {
    if (b.status === 'confirmed') revenue += b.totalAmount || 0;
    if (b.status === 'pending') pending++;
    if (b.paymentStatus === 'paid') {
      paid++;
      collected += b.totalAmount || 0;
    } else unpaid++;
  });

  document.getElementById('totalRevenue').innerText = formatCurrency(revenue);
  document.getElementById('countBookings').innerText = allBookings.length;
  document.getElementById('countPending').innerText = pending;
  document.getElementById('countPaid').innerText = paid;
  document.getElementById('countUnpaid').innerText = unpaid;
  document.getElementById('totalCollected').innerText = formatCurrency(collected);
}

function renderToursTable(tours) {
  const tbody = document.querySelector('#toursTable tbody');
  if (!tbody) return;
  tbody.innerHTML = tours.map(t => `
    <tr>
      <td>
        <div class="tour-cell">
          <img src="${t.image}" alt="">
          <span>${t.name}</span>
        </div>
      </td>
      <td>${t.location}</td>
      <td>${formatCurrency(t.price)}</td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td>${t.available ? '✅ Available' : '❌ Hidden'}</td>
      <td>
        <button class="btn btn-outline btn-xs edit-tour" data-id="${t.id}">Edit</button>
        <button class="btn btn-outline btn-xs text-danger delete-tour" data-id="${t.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-tour').forEach(btn => {
    btn.addEventListener('click', () => openTourModal(btn.dataset.id));
  });
  document.querySelectorAll('.delete-tour').forEach(btn => {
    btn.addEventListener('click', () => deleteTour(btn.dataset.id));
  });
}

function renderBookingsTable(bookings) {
  const tbody = document.querySelector('#allBookingsTable tbody');
  const recentTbody = document.querySelector('#recentBookingsTable tbody');
  if (!tbody) return;

  const html = bookings.map(b => `
    <tr>
      <td>${formatFirestoreDate(b.createdAt)}</td>
      <td>
        <strong>${b.customerName}</strong><br>
        <small>${b.customerEmail}</small>
      </td>
      <td>${b.tourName}</td>
      <td>${b.travelDate}</td>
      <td>${b.participants}</td>
      <td>${formatCurrency(b.totalAmount)}</td>
      <td>
        <span class="status-badge status-${b.paymentStatus === 'paid' ? 'confirmed' : 'pending'}">
          ${b.paymentStatus}
        </span>
      </td>
      <td>
        <select class="status-select status-${b.status}" data-id="${b.id}">
          <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="rejected" ${b.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
      <td>
        ${b.paymentProof ? `<button class="btn btn-xs view-receipt" data-id="${b.id}">Receipt</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html;
  if (recentTbody) recentTbody.innerHTML = bookings.slice(0, 5).map(b => `
    <tr>
      <td>${formatFirestoreDate(b.createdAt)}</td>
      <td>${b.customerName}</td>
      <td>${b.tourName}</td>
      <td>${formatCurrency(b.totalAmount)}</td>
      <td><span class="status-badge status-${b.status}">${b.status}</span></td>
    </tr>
  `).join('');

  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateBookingStatus(sel.dataset.id, sel.value));
  });
  document.querySelectorAll('.view-receipt').forEach(btn => {
    btn.addEventListener('click', () => showReceipt(btn.dataset.id));
  });
}

function renderMessagesTable(messages) {
  const tbody = document.querySelector('#messagesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = messages.map(m => `
    <tr>
      <td>${formatFirestoreDate(m.createdAt)}</td>
      <td><strong>${m.name}</strong></td>
      <td>${m.email}</td>
      <td>${m.subject || '—'}</td>
      <td class="msg-cell">${m.message?.substring(0, 80)}...</td>
      <td>
        <select class="msg-status" data-id="${m.id}">
          <option value="new" ${m.status === 'new' ? 'selected' : ''}>New</option>
          <option value="read" ${m.status === 'read' ? 'selected' : ''}>Read</option>
          <option value="replied" ${m.status === 'replied' ? 'selected' : ''}>Replied</option>
        </select>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.msg-status').forEach(sel => {
    sel.addEventListener('change', () => {
      updateDoc(doc(db, 'messages', sel.dataset.id), { status: sel.value });
    });
  });
}

/**
 * Action Functions
 */
async function updateBookingStatus(id, status) {
  const b = allBookings.find(x => x.id === id);
  if (status === 'confirmed' && b.paymentStatus !== 'paid') {
    if (!confirm('Payment is not marked as paid. Confirm anyway?')) {
      renderBookingsTable(allBookings);
      return;
    }
  }

  try {
    const updates = { status, updatedAt: serverTimestamp() };
    if (status === 'confirmed') updates.confirmedAt = serverTimestamp();
    await updateDoc(doc(db, 'bookings', id), updates);
    
    // Trigger automated emails
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      if (status === 'confirmed') notifyBookingStatusEmail(id, 'booking_confirmed', token);
      if (status === 'rejected') notifyBookingStatusEmail(id, 'booking_rejected', token);
    }
  } catch (err) {
    console.error('Update status failed:', err);
    alert('Permission denied or network error.');
    renderBookingsTable(allBookings);
  }
}

async function deleteTour(id) {
  if (!confirm('Permanently delete this tour?')) return;
  try {
    await deleteDoc(doc(db, 'tours', id));
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Unauthorized or network error.');
  }
}

/**
 * Tour Modal & Forms
 */
let pendingImages = [];
const tourModal = document.getElementById('tourModal');
const tourForm = document.getElementById('tourForm');
const tImageFile = document.getElementById('tImageFile');

function openTourModal(id = null) {
  tourForm.reset();
  pendingImages = [];
  document.getElementById('imagePreview').innerHTML = '';
  
  if (id) {
    const t = allTours.find(x => x.id === id);
    document.getElementById('tourId').value = t.id;
    document.getElementById('tName').value = t.name;
    document.getElementById('tPrice').value = t.price;
    document.getElementById('tLocation').value = t.location;
    document.getElementById('tDuration').value = t.duration;
    document.getElementById('tCategory').value = t.category;
    document.getElementById('tDescription').value = t.description;
    document.getElementById('tAvailable').checked = t.available;
    document.getElementById('tMaxSlots').value = t.maxSlots || 12;
    pendingImages = t.images || [t.image];
    renderImagePreviews();
    document.getElementById('modalTitle').innerText = 'Edit Tour';
  } else {
    document.getElementById('tourId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Tour';
  }
  tourModal.classList.add('active');
}

function renderImagePreviews() {
  const container = document.getElementById('imagePreview');
  container.innerHTML = pendingImages.map((src, i) => `
    <div class="preview-item">
      <img src="${src}" alt="">
      <button type="button" class="remove-img" data-index="${i}">×</button>
    </div>
  `).join('');
  
  container.querySelectorAll('.remove-img').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingImages.splice(btn.dataset.index, 1);
      renderImagePreviews();
    });
  });
}

tImageFile?.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files.length) return;

  for (const file of files) {
    const path = `tours/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    try {
      const snap = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snap.ref);
      pendingImages.push(url);
      renderImagePreviews();
    } catch (err) {
      console.error('Upload error:', err);
    }
  }
});

tourForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('tourId').value;
  const data = {
    name: document.getElementById('tName').value,
    price: parseInt(document.getElementById('tPrice').value),
    location: document.getElementById('tLocation').value,
    duration: document.getElementById('tDuration').value,
    category: document.getElementById('tCategory').value,
    description: document.getElementById('tDescription').value,
    maxSlots: parseInt(document.getElementById('tMaxSlots').value) || 12,
    available: document.getElementById('tAvailable').checked,
    images: pendingImages,
    image: pendingImages[0] || '/assets/lalibela.png',
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      await updateDoc(doc(db, 'tours', id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'tours'), data);
    }
    tourModal.classList.remove('active');
  } catch (err) {
    console.error('Save tour error:', err);
    alert('Save failed. Check console.');
  }
});

/**
 * Helpers / Charts / Settings
 */
function updateBookingsChart(bookings) {
  // Simplified chart logic for focus
  const ctx = document.getElementById('bookingsChart')?.getContext('2d');
  if (!ctx) return;
  // Chart initialization would go here
}

function renderPopularTours(tours, bookings) {
  // logic to show popular tours
}

async function loadSettings() {
  const snap = await getDoc(doc(db, 'settings', 'company'));
  if (snap.exists()) {
    const s = snap.data();
    if (document.getElementById('sWhatsapp')) document.getElementById('sWhatsapp').value = s.whatsapp || '';
    if (document.getElementById('sEmail')) document.getElementById('sEmail').value = s.email || '';
    if (document.getElementById('sPhone')) document.getElementById('sPhone').value = s.phone || '';
  }
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await setDoc(doc(db, 'settings', 'company'), {
    whatsapp: document.getElementById('sWhatsapp').value,
    email: document.getElementById('sEmail').value,
    phone: document.getElementById('sPhone').value,
    updatedAt: serverTimestamp()
  });
  alert('Settings saved.');
});

document.getElementById('seedToursBtn')?.addEventListener('click', async () => {
  if (!confirm('Seed sample tours to Firestore?')) return;
  for (const t of SEED_TOURS) {
    await addDoc(collection(db, 'tours'), { ...t, createdAt: serverTimestamp() });
  }
  alert('Seeding complete.');
});

document.getElementById('closeTourModal')?.addEventListener('click', () => tourModal.classList.remove('active'));
document.getElementById('addNewTourBtn')?.addEventListener('click', () => openTourModal());
