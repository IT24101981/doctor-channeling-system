import { useRef, useEffect } from 'react';
import NavBar from '../Components/NavBar';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Link, useLocation } from 'react-router-dom';
import './css/landing.css';
import heroImg from './img/hero.jpeg';
import hospitalImg from './img/hospital1.jpeg';

gsap.registerPlugin(ScrollTrigger);

const servicesData = [
    {
        title: "Doctor Channeling",
        description: "Book appointments with specialist doctors easily through our modern platform",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
        ),
    },
    {
        title: "Lab Reports",
        description: "Quick and accurate laboratory testing with state-of-the-art equipment",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
        ),
    },
    {
        title: "Pharmacy",
        description: "Wide range of quality medicines at affordable prices for every patient",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        ),
    },
    {
        title: "ECG & Scanning",
        description: "Modern diagnostic imaging & ECG equipment for accurate clinical results",
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
            </svg>
        ),
    },
];

function Landing() {
    const containerRef = useRef(null);
    const location = useLocation();

    useEffect(() => {
        const hash = (location.hash || '').replace('#', '');
        if (!hash) return;

        const el = document.getElementById(hash);
        if (!el) return;

        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [location.hash]);

    useGSAP(() => {
        // --- Hero Entrance Timeline ---
        const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

        tl.fromTo('.hero-badge',
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8 }
        )
            .fromTo('.hero-headline-wrapper',
                { y: 80, opacity: 0 },
                { y: 0, opacity: 1, duration: 1.2 },
                '-=0.4'
            )
            .fromTo('.hero-content h2',
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.8 },
                '-=0.6'
            )
            .fromTo('.hero-description',
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.8 },
                '-=0.4'
            )
            .fromTo('.hero-buttons .btn-primary, .hero-buttons .btn-secondary',
                { y: 20, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 },
                '-=0.4'
            )
            .fromTo('.hero-image-wrapper',
                { scale: 0.9, opacity: 0, x: 50 },
                { scale: 1, opacity: 1, x: 0, duration: 1.2, ease: "power3.out" },
                '-=1'
            )
            .fromTo('.stat-item',
                { y: 40, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.7, stagger: 0.15 },
                '-=0.3'
            );

        // Stat counter animation
        const statNumbers = document.querySelectorAll('.stat-number');
        statNumbers.forEach(num => {
            const target = parseInt(num.getAttribute('data-target'), 10);
            gsap.fromTo(num,
                { innerText: 0 },
                {
                    innerText: target,
                    duration: 2.5,
                    ease: "power2.out",
                    snap: { innerText: 1 },
                    delay: 1.2,
                    onUpdate: function () {
                        const val = Math.round(gsap.getProperty(num, "innerText"));
                        const suffix = num.getAttribute('data-suffix') || '';
                        num.textContent = val.toLocaleString() + suffix;
                    }
                }
            );
        });

        // Plus-sign grid fadeIn
        gsap.fromTo('.plus-sign',
            { opacity: 0 },
            { opacity: 1, duration: 0.3, stagger: { amount: 1.5, from: "random" }, delay: 0.5 }
        );

        // --- Big Stat Section ---
        gsap.fromTo('.big-stat-number',
            { y: 60, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 1.4, ease: "power3.out",
                scrollTrigger: { trigger: '.section-big-stat', start: 'top 70%', toggleActions: 'play none none none' }
            }
        );
        gsap.fromTo('.big-stat-caption',
            { y: 30, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, delay: 0.3,
                scrollTrigger: { trigger: '.section-big-stat', start: 'top 70%', toggleActions: 'play none none none' }
            }
        );
        gsap.fromTo('.big-stat-text h2, .big-stat-text p',
            { y: 40, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.15,
                scrollTrigger: { trigger: '.section-big-stat', start: 'top 70%', toggleActions: 'play none none none' }
            }
        );

        // Animated counter for big stat
        const bigStatNum = document.querySelector('.big-stat-counter');
        if (bigStatNum) {
            const bigTarget = parseInt(bigStatNum.getAttribute('data-target'), 10);
            gsap.fromTo(bigStatNum,
                { innerText: 0 },
                {
                    innerText: bigTarget,
                    duration: 3,
                    ease: "power2.out",
                    snap: { innerText: 1 },
                    scrollTrigger: { trigger: '.section-big-stat', start: 'top 70%', toggleActions: 'play none none none' },
                    onUpdate: function () {
                        const val = Math.round(gsap.getProperty(bigStatNum, "innerText"));
                        const suffix = bigStatNum.getAttribute('data-suffix') || '';
                        bigStatNum.textContent = val.toLocaleString() + suffix;
                    }
                }
            );
        }

        // --- About Section ---
        gsap.fromTo('.about-image',
            { x: -60, opacity: 0 },
            {
                x: 0, opacity: 1, duration: 1.2, ease: "power3.out",
                scrollTrigger: { trigger: '.section-about', start: 'top 75%', toggleActions: 'play none none none' }
            }
        );
        gsap.fromTo('.about-content > *',
            { y: 40, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.12,
                scrollTrigger: { trigger: '.section-about', start: 'top 75%', toggleActions: 'play none none none' }
            }
        );

        // --- Services Section ---
        gsap.fromTo('.section-services .section-header > *',
            { y: 30, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.1,
                scrollTrigger: { trigger: '.section-services', start: 'top 80%', toggleActions: 'play none none none' }
            }
        );
        gsap.fromTo('.service-card',
            { y: 60, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.12,
                scrollTrigger: { trigger: '.services-grid', start: 'top 85%', toggleActions: 'play none none none' }
            }
        );

        // --- Doctors Section ---
        gsap.fromTo('.section-header-row > *',
            { y: 30, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.1,
                scrollTrigger: { trigger: '.section-recommended', start: 'top 80%', toggleActions: 'play none none none' }
            }
        );
        gsap.fromTo('.doctor-card',
            { y: 50, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.15,
                scrollTrigger: { trigger: '.doctors-grid', start: 'top 85%', toggleActions: 'play none none none' }
            }
        );

        // --- Info Section ---
        gsap.fromTo('.info-card',
            { y: 50, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.8, stagger: 0.12,
                scrollTrigger: { trigger: '.info-grid', start: 'top 85%', toggleActions: 'play none none none' }
            }
        );

        // --- Footer ---
        gsap.fromTo('.footer-section',
            { y: 40, opacity: 0 },
            {
                y: 0, opacity: 1, duration: 0.7, stagger: 0.1,
                scrollTrigger: { trigger: '.footer', start: 'top 90%', toggleActions: 'play none none none' }
            }
        );
    }, { scope: containerRef });

    // Generate plus-sign rows
    const renderPlusGrid = () => {
        const rows = [];
        for (let i = 0; i < 5; i++) {
            const signs = [];
            for (let j = 0; j < 8; j++) {
                signs.push(<span key={j} className="plus-sign">+</span>);
            }
            rows.push(<div key={i} className="plus-row" style={{ marginTop: i * 20 + '%' }}>{signs}</div>);
        }
        return rows;
    };

    return (
        <div ref={containerRef} className="landing-page">
            <NavBar />

            {/* ===== HERO ===== */}
            <section className="hero-banner">
                <div className="hero-grid-overlay">
                    {renderPlusGrid()}
                </div>
                <div className="hero-orb hero-orb-1"></div>
                <div className="hero-orb hero-orb-2"></div>

                <div className="hero-main-container">
                    <div className="hero-content">
                        <div className="hero-badge">

                            Narammala Channeling Center
                        </div>
                        <div className="hero-headline-wrapper">
                            <h1>Your trusted<br /><span className="text-accent">healthcare</span> partner</h1>
                        </div>
                        <h2>Premier private healthcare provider in Narammala</h2>
                        <p className="hero-description">
                            Delivering compassionate, high-quality medical services with a team
                            of renowned specialists from leading national hospitals.
                        </p>
                        <div className="hero-buttons">
                            <Link to="/ecare" className="btn-primary">
                                NCC eCare
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </Link>
                            <a href="tel:+94372249959" className="btn-secondary">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Call Us
                            </a>
                        </div>
                    </div>

                    <div className="hero-image-wrapper">
                        <img src={heroImg} alt="NCC Healthcare" className="hero-image" />
                    </div>
                </div>


            </section>


            {/* ===== BIG STAT SECTION — like Hunter's "14500" ===== */}
            <section className="section-big-stat">
                <div className="big-stat-container">
                    <div className="big-stat-number-wrapper">
                        <div className="big-stat-number big-stat-counter" data-target="1000" data-suffix="+">0</div>
                        <p className="big-stat-caption">
                            Since our founding, Narammala Channeling Center has served over 1000+ patients
                            across Narammala and the surrounding communities.
                        </p>
                    </div>
                    <div className="big-stat-divider"></div>
                    <div className="big-stat-text">
                        <h2>Bigger picture, better results</h2>
                        <p>
                            We know that a decision in one department can change an outcome in
                            another. Our distinct vantage point helps you see the full picture
                            of your healthcare journey.
                        </p>
                        <p>
                            Positioned at the heart of Narammala, our dedicated team of specialists
                            from leading national hospitals ensure that every patient receives
                            personalized care built on partnership and trust.
                        </p>
                    </div>
                </div>
            </section>


            {/* ===== ABOUT SECTION ===== */}
            <section id="about" className="section-about">
                <div className="about-container">
                    <div className="about-image">
                        <img src={hospitalImg} alt="Narammala Channeling Center Facility" className="about-hospital-image" />
                    </div>
                    <div className="about-content">
                        <span className="about-badge">About Us</span>
                        <h2>Narammala Channeling Center (Pvt) Ltd</h2>
                        <p>
                            Narammala Channeling Center (Pvt) Ltd, the premier private healthcare provider in Narammala.
                            For years, we have been dedicated to delivering compassionate, high-quality
                            medical services to our community. Formerly known as Narammala Channel Center,
                            we have evolved into a modern healthcare facility equipped with advanced
                            diagnostic tools and a wide range of specialist services.
                        </p>
                        <p>
                            Our mission is to bridge the gap between quality healthcare and accessibility.
                            With a team of renowned specialists from leading national hospitals,
                            a fully-equipped laboratory, and an in-house pharmacy, we ensure that
                            every patient receives personalized care under one roof.
                        </p>
                        <div className="about-features">
                            {['Renowned Specialists', 'Fully-Equipped Laboratory', 'In-House Pharmacy', 'Advanced Diagnostics'].map((feature, i) => (
                                <div key={i} className="feature-item">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                    <span>{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>


            {/* ===== SERVICES — Numbered columns like Hunter ===== */}
            <section id="services" className="section-services">
                <div className="section-header">
                    <h2>Our Services</h2>
                    <p>
                        Comprehensive healthcare services designed to meet all your medical
                        needs with precision and care.
                    </p>
                </div>
                <div className="services-grid">
                    {servicesData.map((service, index) => (
                        <div key={index} className="service-card">
                            <span className="service-number">{String(index + 1).padStart(2, '0')}</span>
                            <div className="service-icon">{service.icon}</div>
                            <h3>{service.title}</h3>
                            <p>{service.description}</p>

                        </div>
                    ))}
                </div>
            </section>




            {/* ===== INFO SECTION ===== */}
            <section id="contact" className="section-info">
                <div className="section-header" style={{ marginBottom: '60px' }}>
                    <h2>Visit Us</h2>
                </div>
                <div className="info-grid">
                    <div className="info-card">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        </div>
                        <h3>Opening Hours</h3>
                        <ul className="hours-list">
                            <li><span>Monday — Friday</span><span>8:00 AM — 10:00 PM</span></li>
                            <li><span>Saturday</span><span>8:00 AM — 8:00 PM</span></li>
                            <li><span>Sunday</span><span>9:00 AM — 5:00 PM</span></li>
                            <li><span>Public Holidays</span><span>9:00 AM — 2:00 PM</span></li>
                        </ul>
                    </div>
                    <div className="info-card">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                            </svg>
                        </div>
                        <h3>Contact</h3>
                        <div className="contact-details">
                            <div className="contact-row">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                                </svg>
                                <div>
                                   <a href="tel:+94372249959">  <span className="label">Phone</span>
                                    <span className="value">0372 249 959</span>
                                   </a>
                                </div>
                            </div>
                            <div className="contact-row">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                </svg>
                                <div>
                                    <a href="mailto:narammalachannelcenterandhospi@gmail.com"> <span className="label">Email</span>
                                    <span className="value">narammalachannelcenterandhospi@gmail.com</span>
                                    </a>
                                </div>
                            </div>
                            <div className="contact-row">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                                </svg>
                                <div><a href="tel:+94372249959">
                                    <span className="label">Emergency</span>
                                    <span className="value">0372 249 959</span>
                                </a></div>
                            </div>
                        </div>
                    </div>
                    <div className="info-card">
                        <div className="info-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                            </svg>
                        </div>
                        <h3>Location</h3>
                        <p className="address">
                            Narammala Channeling Center and Hospital<br />
                            Negombo Road<br />
                            Narammala<br />
                            North Western Province<br />
                            Sri Lanka
                        </p>
                        <a href="https://maps.app.goo.gl/fhMUdsbHPrcJtEHh6" target="_blank" rel="noopener noreferrer" className="directions-link">
                            Get Directions
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </a>
                    </div>
                </div>
            </section>


            {/* ===== FOOTER ===== */}
            <footer className="footer">
                <div className="footer-container">
                    <div className="footer-section footer-about">
                        <h3>Narammala Channeling Center</h3>
                        <p>
                            Narammala's premier private healthcare provider. Delivering
                            compassionate medical services with excellence since our founding.
                        </p>
                        <div className="social-links">
                           
                            <a href="https://www.facebook.com/profile.php?id=61585425188406" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Facebook">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                            </a>
                            <a href="mailto:narammalachannelcenterandhospi@gmail.com" className="social-link" aria-label="Email">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                            </a>
                        </div>
                    </div>
                    <div className="footer-section">
                        <h4>Quick Links</h4>
                        <ul>
                            <li><Link to="/ecare">eCare</Link></li>
                            <li><Link to="/login">Patient Login</Link></li>
                            <li><Link to="/signup">Register</Link></li>
                            <li><Link to="/smart-doctor-suggestion">Smart Doctor</Link></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h4>Services</h4>
                        <ul>
                            <li><a href="/">Doctor Channeling</a></li>
                            <li><a href="/">Lab Reports</a></li>
                            <li><a href="/">Pharmacy</a></li>
                            <li><a href="/">ECG & Scanning</a></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h4>Contact</h4>
                        <div className="contact-item">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                            <span>Negombo Road,<br />Narammala, Sri Lanka</span>
                        </div>
                        <div className="contact-item">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                            <span>0372 249 959</span>
                        </div>
                        <div className="contact-item">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                            <span>narammalachannelcenterandhospi@gmail.com</span>
                        </div>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; {new Date().getFullYear()} Narammala Channeling Center. All rights reserved.</p>
                </div>
            </footer>

           
        </div>
    );
}

export default Landing;
