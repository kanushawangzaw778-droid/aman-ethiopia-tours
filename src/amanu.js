import './style.css'

// Register GSAP Plugins
gsap.registerPlugin(ScrollTrigger);

// Navbar Scroll Effect
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Hero Slideshow
const slides = document.querySelectorAll('.slide');
let currentSlide = 0;

function nextSlide() {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
}

setInterval(nextSlide, 5000);

// GSAP Animations
// Hero Content
gsap.from('.reveal-text', {
    y: 50,
    opacity: 0,
    duration: 1.2,
    ease: 'power3.out'
});

gsap.from('.reveal-up', {
    y: 30,
    opacity: 0,
    duration: 1,
    stagger: 0.2,
    ease: 'power3.out',
    delay: 0.5
});

// Scroll Reveals
const sections = ['why-us', 'tours-section', 'destinations-section', 'about-section', 'contact-section'];

sections.forEach(section => {
    gsap.from(`.${section} .container`, {
        scrollTrigger: {
            trigger: `.${section}`,
            start: 'top 80%',
        },
        y: 50,
        opacity: 0,
        duration: 1,
        ease: 'power3.out'
    });
});

// Stats Counter
const stats = document.querySelectorAll('.stat-number');
stats.forEach(stat => {
    const target = parseInt(stat.getAttribute('data-target'));

    ScrollTrigger.create({
        trigger: stat,
        start: 'top 90%',
        onEnter: () => {
            gsap.to(stat, {
                innerText: target,
                duration: 2,
                snap: { innerText: 1 },
                ease: 'power1.out'
            });
        }
    });
});

// Tour Filtering
const filterBtns = document.querySelectorAll('.filter-btn');
const tourCards = document.querySelectorAll('.tour-card');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active button
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');

        tourCards.forEach(card => {
            if (filter === 'all' || card.getAttribute('data-category') === filter) {
                gsap.to(card, {
                    scale: 1,
                    opacity: 1,
                    duration: 0.5,
                    display: 'block'
                });
            } else {
                gsap.to(card, {
                    scale: 0.8,
                    opacity: 0,
                    duration: 0.5,
                    display: 'none'
                });
            }
        });
    });
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.querySelector('.nav-links');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        menuToggle.classList.toggle('open');
    });
}

// Hover effects for Destinations
const destItems = document.querySelectorAll('.dest-item');
destItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
        gsap.to(item.querySelector('img'), { scale: 1.1, duration: 0.6 });
        gsap.to(item.querySelector('.dest-overlay'), { background: 'linear-gradient(to top, rgba(11, 110, 79, 0.9), transparent)', duration: 0.4 });
    });
    item.addEventListener('mouseleave', () => {
        gsap.to(item.querySelector('img'), { scale: 1, duration: 0.6 });
        gsap.to(item.querySelector('.dest-overlay'), { background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', duration: 0.4 });
    });
});

// Smooth Scroll for Nav Links
document.querySelectorAll('.nav-item').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                gsap.to(window, {
                    duration: 1,
                    scrollTo: target.offsetTop - 80,
                    ease: 'power3.inOut'
                });

                // Update active class
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            }
        }
    });
});
