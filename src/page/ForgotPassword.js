import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ReCAPTCHA from 'react-google-recaptcha';

import './css/ForgotPassword.css';

const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const initialEmail = location.state?.email || '';

    const [email] = useState(initialEmail);
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [step, setStep] = useState('otp');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resendRecaptchaToken, setResendRecaptchaToken] = useState(null);
    const resendRecaptchaRef = useRef(null);

    useEffect(() => {
        if (!initialEmail) {
            navigate('/login', { replace: true });
        }
    }, [initialEmail, navigate]);

    useEffect(() => {
        if (resendCooldown <= 0) return undefined;
        const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, [resendCooldown]);

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const response = await fetch(`${apiBase}/api/auth/forgot-password/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: otp.trim() })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Verification failed');
                return;
            }
            setResetToken(data.resetToken);
            setStep('password');
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            setError('Password must be at least 8 characters long and contain both letters and numbers');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${apiBase}/api/auth/forgot-password/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resetToken, newPassword, confirmPassword })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Could not update password');
                return;
            }
            navigate('/login', { replace: true, state: { passwordResetOk: true } });
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || !email) return;
        if (!resendRecaptchaToken) {
            setError('Please complete reCAPTCHA to resend the code');
            return;
        }
        setError('');
        setIsLoading(true);
        try {
            const response = await fetch(`${apiBase}/api/auth/forgot-password/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, recaptchaToken: resendRecaptchaToken })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.message || 'Could not resend code');
                return;
            }
            setResendCooldown(60);
            setResendRecaptchaToken(null);
            resendRecaptchaRef.current?.reset?.();
        } catch {
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!initialEmail) {
        return null;
    }

    return (
        <div className="forgot-password-page">
            <div className="forgot-password-card">
                <div className="forgot-password-header">
                    <h1>Reset password</h1>
                    <p>
                        {step === 'otp'
                            ? `Enter the 6-digit code sent to ${email}`
                            : 'Choose a new password for your account'}
                    </p>
                </div>

                {step === 'otp' && (
                    <form onSubmit={handleVerifyOtp} className="forgot-password-form">
                        <div className="form-group">
                            <label htmlFor="otp">Verification code</label>
                            <div className="input-wrapper">
                                <input
                                    id="otp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                />
                            </div>
                        </div>
                        {error && <div className="forgot-password-error">{error}</div>}
                        <button type="submit" className="forgot-primary-btn" disabled={isLoading || otp.length < 6}>
                            {isLoading ? <span className="loader" /> : 'Verify code'}
                        </button>
                        <p className="forgot-resend-recaptcha-hint">To resend the code, complete reCAPTCHA below.</p>
                        <div className="forgot-password-recaptcha">
                            <ReCAPTCHA
                                ref={resendRecaptchaRef}
                                sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                                onChange={(token) => setResendRecaptchaToken(token)}
                            />
                        </div>
                        <div className="forgot-password-actions">
                            <button
                                type="button"
                                className="forgot-text-btn"
                                onClick={handleResend}
                                disabled={isLoading || resendCooldown > 0}
                            >
                                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                            </button>
                            <Link to="/login" className="forgot-text-link">
                                Back to sign in
                            </Link>
                        </div>
                    </form>
                )}

                {step === 'password' && (
                    <form onSubmit={handleResetPassword} className="forgot-password-form">
                        <div className="form-group">
                            <label htmlFor="newPassword">New password</label>
                            <div className="input-wrapper">
                                <input
                                    id="newPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters with letters and numbers"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm password</label>
                            <div className="input-wrapper">
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Repeat password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>
                        {error && <div className="forgot-password-error">{error}</div>}
                        <button type="submit" className="forgot-primary-btn" disabled={isLoading}>
                            {isLoading ? <span className="loader" /> : 'Update password'}
                        </button>
                        <div className="forgot-password-actions">
                            <Link to="/login" className="forgot-text-link">
                                Back to sign in
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ForgotPassword;
