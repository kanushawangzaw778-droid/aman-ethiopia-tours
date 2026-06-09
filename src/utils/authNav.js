import { getCurrentUser, onUserAuthChanged, logOut } from '../services/userAuth';

export function initAuthNav() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks || navLinks.dataset.authInit) return;
  navLinks.dataset.authInit = 'true';

  let loginLink = document.getElementById('navAuthLogin');
  let myBookingsLink =
    document.getElementById('navMyBookings') ||
    navLinks.querySelector('a[href*="my-bookings"]');
  let logoutBtn = document.getElementById('navLogout');

  if (!loginLink) {
    loginLink = document.createElement('a');
    loginLink.id = 'navAuthLogin';
    loginLink.href = '/login.html';
    loginLink.className = 'nav-item';
    loginLink.textContent = 'Login';
    navLinks.appendChild(loginLink);
  }

  if (!myBookingsLink) {
    myBookingsLink = document.createElement('a');
    myBookingsLink.href = '/my-bookings.html';
    navLinks.appendChild(myBookingsLink);
  }
  myBookingsLink.id = 'navMyBookings';
  myBookingsLink.className = 'nav-item';
  myBookingsLink.textContent = 'My Bookings';

  if (!logoutBtn) {
    logoutBtn = document.createElement('button');
    logoutBtn.id = 'navLogout';
    logoutBtn.type = 'button';
    logoutBtn.className = 'nav-item nav-item-btn';
    logoutBtn.textContent = 'Logout';
    navLinks.appendChild(logoutBtn);
  }

  const updateAuthNav = (user) => {
    loginLink.style.display = user ? 'none' : '';
    myBookingsLink.style.display = user ? '' : 'none';
    logoutBtn.style.display = user ? '' : 'none';

    if (window.location.pathname.includes('my-bookings')) {
      navLinks.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      if (user) myBookingsLink.classList.add('active');
    }
  };

  logoutBtn.addEventListener('click', async () => {
    await logOut();
    updateAuthNav(null);
    if (window.location.pathname.includes('my-bookings')) {
      window.location.href = '/login.html?redirect=/my-bookings.html';
    }
  });

  updateAuthNav(getCurrentUser());
  onUserAuthChanged(updateAuthNav);
}

export function initMobileMenu() {
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.toggle('open');
    document.getElementById('menuToggle')?.classList.toggle('active');
  });
}

export function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  
  const handleScroll = () => {
    const isScrolled = window.scrollY > 30;
    navbar.classList.toggle('scrolled', isScrolled);
  };

  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
}
