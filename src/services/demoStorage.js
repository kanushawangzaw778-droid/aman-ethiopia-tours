const KEYS = {
  TOURS: 'aman_demo_tours',
  BOOKINGS: 'aman_demo_bookings',
  MESSAGES: 'aman_demo_messages',
  SUBSCRIBERS: 'aman_demo_subscribers',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function getDemoTours(seedTours) {
  const stored = read(KEYS.TOURS, null);
  if (Array.isArray(stored) && stored.length) return stored;

  const seeded = seedTours.map((t, i) => ({ id: `seed-${i}`, ...t }));
  write(KEYS.TOURS, seeded);
  return seeded;
}

export function saveDemoTours(tours) {
  write(KEYS.TOURS, tours);
}

export function getDemoBookings() {
  return read(KEYS.BOOKINGS, []);
}

export function getDemoBookingsForUser(userId) {
  return getDemoBookings().filter((b) => b.userId === userId);
}

export function addDemoBooking(booking) {
  const bookings = getDemoBookings();
  bookings.unshift(booking);
  write(KEYS.BOOKINGS, bookings);
  return booking;
}

export function updateDemoBooking(id, updates) {
  const bookings = getDemoBookings();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], ...updates, updatedAt: new Date().toISOString() };
  write(KEYS.BOOKINGS, bookings);
  return bookings[idx];
}

export function getDemoMessages() {
  return read(KEYS.MESSAGES, []);
}

export function addDemoMessage(message) {
  const messages = getDemoMessages();
  messages.unshift(message);
  write(KEYS.MESSAGES, messages);
  return message;
}

export function updateDemoMessage(id, updates) {
  const messages = getDemoMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  messages[idx] = { ...messages[idx], ...updates };
  write(KEYS.MESSAGES, messages);
  return messages[idx];
}

export function addDemoSubscriber(subscriber) {
  const subscribers = read(KEYS.SUBSCRIBERS, []);
  if (subscribers.some((s) => s.email === subscriber.email)) return subscriber;
  subscribers.unshift(subscriber);
  write(KEYS.SUBSCRIBERS, subscribers);
  return subscriber;
}

export { KEYS as DEMO_STORAGE_KEYS };
