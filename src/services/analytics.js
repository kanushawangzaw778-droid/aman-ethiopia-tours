const STORAGE_KEY = 'aman_analytics';

function getStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function trackEvent(event, data = {}) {
  const store = getStore();
  store.events = store.events || [];
  store.events.push({ event, data, timestamp: Date.now() });
  if (store.events.length > 500) store.events = store.events.slice(-500);
  saveStore(store);
}

export function trackPageView(page = window.location.pathname) {
  trackEvent('page_view', { page });
}

export function trackTourView(tourId, tourName) {
  trackEvent('tour_view', { tourId, tourName });
}

export function trackBookingStart(tourId) {
  trackEvent('booking_start', { tourId });
}

export function getAnalyticsSummary() {
  const store = getStore();
  const events = store.events || [];
  const tourViews = {};
  events
    .filter((e) => e.event === 'tour_view')
    .forEach((e) => {
      const id = e.data.tourId;
      tourViews[id] = tourViews[id] || { name: e.data.tourName, count: 0 };
      tourViews[id].count++;
    });
  return {
    totalEvents: events.length,
    pageViews: events.filter((e) => e.event === 'page_view').length,
    bookingStarts: events.filter((e) => e.event === 'booking_start').length,
    popularTours: Object.values(tourViews).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

export function getBookingsChartData(bookings, period = 'week') {
  const now = new Date();
  const buckets = {};

  bookings.forEach((b) => {
    let date;
    if (b.createdAt?.toDate) date = b.createdAt.toDate();
    else if (b.createdAt?.seconds) date = new Date(b.createdAt.seconds * 1000);
    else if (b.createdAt) date = new Date(b.createdAt);
    else return;

    const key =
      period === 'month'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : getWeekKey(date, now);

    buckets[key] = (buckets[key] || 0) + 1;
  });

  const labels = Object.keys(buckets).sort();
  return { labels, data: labels.map((l) => buckets[l]) };
}

function getWeekKey(date, now) {
  const diff = Math.floor((now - date) / (7 * 24 * 60 * 60 * 1000));
  if (diff === 0) return 'This Week';
  if (diff === 1) return 'Last Week';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
