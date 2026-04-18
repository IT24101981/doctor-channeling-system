import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

import './css/Login.css';
import ReCAPTCHA from "react-google-recaptcha";

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotError, setForgotError] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotRecaptchaToken, setForgotRecaptchaToken] = useState(null);
    const forgotRecaptchaRef = useRef(null);
    const [passwordResetNotice, setPasswordResetNotice] = useState(false);

    useEffect(() => {
        if (location.state?.passwordResetOk) {
            setPasswordResetNotice(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.pathname, location.state, navigate]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!recaptchaToken) {
            setError('Please complete the reCAPTCHA');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    recaptchaToken
                }),
            });

            const data = await response.json();

            if (response.ok) {
                if (data.userType === 'doctor') {
                    // The API allows 'pending', 'approved', or 'rejected' statuses
                    if (data.user.status === 'pending') {
                        alert('Your account is pending admin approval.');
                        navigate('/doctorpending', { state: { doctorId: data.user.id } });
                    } else if (data.user.status === 'approved') {
                        // Store user info
                        localStorage.setItem('user', JSON.stringify(data.user));
                        localStorage.setItem('userType', data.userType);
                        localStorage.setItem('doctorInfo', JSON.stringify(data.user));
                        localStorage.setItem('token', 'doctor-token'); // Set dummy token or actual token if available
                        navigate('/doctor-availability');
                    } else if (data.user.status === 'rejected') {
                        navigate('/doctorreject', { state: { doctorId: data.user.id } });
                    } else {
                        setError('Account access restricted.');
                    }
                } else {
                    // Store patient info
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('userType', data.userType);
                    window.dispatchEvent(new Event('profileUpdated'));
                    navigate('/eCare');
                }
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Connection error. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    };

    const openForgotModal = () => {
        setForgotEmail(formData.email || '');
        setForgotError('');
        setShowForgotModal(true);
    };

    const closeForgotModal = () => {
        setShowForgotModal(false);
        setForgotError('');
        setForgotLoading(false);
        setForgotRecaptchaToken(null);
        forgotRecaptchaRef.current?.reset();
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotError('');
        const trimmed = String(forgotEmail || '').trim();
        if (!trimmed) {
            setForgotError('Please enter your email address');
            return;
        }
        if (!forgotRecaptchaToken) {
            setForgotError('Please complete the reCAPTCHA');
            return;
        }
        setForgotLoading(true);
        try {
            const response = await fetch(
                `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/forgot-password/request`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: trimmed, recaptchaToken: forgotRecaptchaToken })
                }
            );
            const data = await response.json();
            if (!response.ok) {
                setForgotError(data.message || 'Something went wrong');
                setForgotRecaptchaToken(null);
                forgotRecaptchaRef.current?.reset();
                return;
            }
            closeForgotModal();
            navigate('/forgot-password', { state: { email: data.email || trimmed } });
        } catch {
            setForgotError('Connection error. Please try again later.');
        } finally {
            setForgotLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Left Side - Background */}
            <div className="login-left">
                <div className="login-left-overlay"></div>
                <div className="login-left-content">
                    <div className="brand-logo">
                        <img src="/favicon.png" alt="NC+ logo" />
                        <span>NCC eCare</span>
                    </div>
                    <h1>Welcome Back!</h1>
                    <p>Your trusted doctor booking portal in Narammala. Find specialist doctors, reserve your channeling slot, and manage upcoming appointments.</p>
                    <div className="login-features">
                        <div className="login-feature-item">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            <span>Book Appointments Online</span>
                        </div>
                        <div className="login-feature-item">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            <span>Choose Specialist Doctors</span>
                        </div>
                        <div className="login-feature-item">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            <span>Manage Upcoming Channelings</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="login-right">
                <div className="login-form-container">
                    <div className="login-form-header">
                        <h2>Sign In</h2>
                        <p>Enter your credentials to access your account</p>
                    </div>

                    {passwordResetNotice && (
                        <div className="login-success-banner" role="status">
                            Password updated. You can sign in with your new password.
                            <button
                                type="button"
                                className="login-success-banner-dismiss"
                                onClick={() => setPasswordResetNotice(false)}
                                aria-label="Dismiss"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="form-group">
                            <label htmlFor="email">Email Address</label>
                            <div className="input-wrapper">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                                </svg>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    placeholder="Enter your email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <div className="input-wrapper">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                                </svg>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    placeholder="Enter your password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="form-options">
                            <button type="button" className="forgot-link" onClick={openForgotModal}>
                                Forgot Password?
                            </button>
                        </div>

                        <div className="form-group" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <ReCAPTCHA
                                sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                                onChange={(token) => setRecaptchaToken(token)}
                            />
                        </div>

                        {error && <div className="error-message" style={{ color: 'red', textAlign: 'center', marginBottom: '15px' }}>{error}</div>}

                        <button type="submit" className="login-btn" disabled={isLoading}>
                            {isLoading ? (
                                <span className="loader"></span>
                            ) : (
                                <>
                                    Sign In
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <p className="signup-link">
                        Don't have an account? <Link to="/signup">Sign Up</Link>
                    </p>
                </div>
            </div>

            {showForgotModal && (
                <div
                    className="forgot-modal-overlay"
                    role="presentation"
                    onClick={(ev) => {
                        if (ev.target === ev.currentTarget) closeForgotModal();
                    }}
                >
                    <div className="forgot-modal" role="dialog" aria-labelledby="forgot-modal-title" aria-modal="true">
                        <h3 id="forgot-modal-title">Reset password</h3>
                        <p className="forgot-modal-desc">
                            Enter the email for your patient or doctor account. If it exists, we will send a verification
                            code.
                        </p>
                        <form onSubmit={handleForgotSubmit} className="forgot-modal-form">
                            <label htmlFor="forgot-email">Email</label>
                            <input
                                id="forgot-email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                required
                            />
                            <div className="forgot-modal-recaptcha">
                                <ReCAPTCHA
                                    ref={forgotRecaptchaRef}
                                    sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                                    onChange={(token) => setForgotRecaptchaToken(token)}
                                />
                            </div>
                            {forgotError && <div className="forgot-modal-error">{forgotError}</div>}
                            <div className="forgot-modal-buttons">
                                <button type="button" className="forgot-modal-cancel" onClick={closeForgotModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="forgot-modal-submit" disabled={forgotLoading}>
                                    {forgotLoading ? 'Sending…' : 'Continue'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
