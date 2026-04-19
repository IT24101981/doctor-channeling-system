import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './css/Signup.css';
import ReCAPTCHA from "react-google-recaptcha";

const DoctorSignup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        doctorName: '',
        specialization: '',
        slmcId: '',
        nic: '',
        currentHospital: '',
        phone: '',
        email: '', // Keeping email as it is standard for auth
        password: '',
        confirmPassword: ''
    });
    const [errors, setErrors] = useState({});
    const [recaptchaToken, setRecaptchaToken] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.doctorName.trim()) newErrors.doctorName = 'Doctor name is required';
        if (!formData.specialization.trim()) newErrors.specialization = 'Specialization is required';
        if (!formData.slmcId.trim()) newErrors.slmcId = 'SLMC ID is required';

        // Email Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        // Mobile Number Validation
        const phoneRegex = /^0\d{9}$/;
        if (!phoneRegex.test(formData.phone)) {
            newErrors.phone = 'Please enter a valid Sri Lankan phone number (e.g., 0712345678)';
        }

        // NIC Validation
        const nicRegex = /^([0-9]{9}[x|X|v|V]|[0-9]{12})$/;
        if (!nicRegex.test(formData.nic)) {
            newErrors.nic = 'Please enter a valid NIC (e.g., 901234567V or 200012345678)';
        }

        // Password Match
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }

        // Password Strength
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(formData.password)) {
            newErrors.password = 'Password must be at least 8 characters long and contain both letters and numbers';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        if (!recaptchaToken) {
            setErrors(prev => ({ ...prev, submit: 'Please complete the reCAPTCHA' }));
            return;
        }

        setIsLoading(true);

        try {
            // Updated payload structure
            // Note: Backend might need updates to handle these new fields
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/doctor/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.doctorName,
                    specialization: formData.specialization,
                    slmcId: formData.slmcId,
                    nic: formData.nic,
                    hospital: formData.currentHospital,
                    phone: formData.phone,
                    email: formData.email,
                    password: formData.password,

                    role: 'doctor',
                    recaptchaToken
                }),
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration Submitted\n\nYour account is pending admin approval. You will be able to log in once your SLMC number is verified.');
                navigate('/doctorpending', { state: { doctorId: data.doctorId } });
            } else {
                setErrors(prev => ({
                    ...prev,
                    submit: data.message || 'Registration failed'
                }));
            }
        } catch (error) {
            console.error('Error during signup:', error);
            setErrors(prev => ({
                ...prev,
                submit: 'Connection error. Please try again later.'
            }));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="signup-page">
            <div className="signup-left">
                <div className="signup-left-overlay"></div>
                <div className="signup-left-content">
                    <div className="brand-logo">
                        <img src="/favicon.png" alt="NC+ logo" />
                        <span>NCC eCare</span>
                    </div>
                    <h1>Join as a Doctor</h1>
                    <p>Register to manage appointments and provide healthcare services.</p>
                </div>
            </div>

            <div className="signup-right">
                <div className="signup-form-container">
                    <div className="signup-form-header">
                        <h2>Doctor Registration</h2>
                        <p>Fill in your details to register as a doctor</p>
                    </div>

                    <form onSubmit={handleSubmit} className="signup-form">

                        {/* Doctor Name */}
                        <div className="form-group">
                            <label htmlFor="doctorName">Doctor Name</label>
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    id="doctorName"
                                    name="doctorName"
                                    placeholder="Dr. Full Name"
                                    value={formData.doctorName}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            {errors.doctorName && <span className="error-message">{errors.doctorName}</span>}
                        </div>

                        {/* Specialization & SLMC ID */}
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="specialization">Specialization</label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        id="specialization"
                                        name="specialization"
                                        placeholder="e.g. Cardiologist"
                                        value={formData.specialization}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                {errors.specialization && <span className="error-message">{errors.specialization}</span>}
                            </div>
                            <div className="form-group">
                                <label htmlFor="slmcId">SLMC Approved ID</label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        id="slmcId"
                                        name="slmcId"
                                        placeholder="SLMC ID"
                                        value={formData.slmcId}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                {errors.slmcId && <span className="error-message">{errors.slmcId}</span>}
                            </div>
                        </div>

                        {/* NIC & Hospital */}
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="nic">NIC Number</label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        id="nic"
                                        name="nic"
                                        placeholder="National ID"
                                        value={formData.nic}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                {errors.nic && <span className="error-message">{errors.nic}</span>}
                            </div>
                            <div className="form-group">
                                <label htmlFor="currentHospital">Current Hospital (Optional)</label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        id="currentHospital"
                                        name="currentHospital"
                                        placeholder="Hospital Name"
                                        value={formData.currentHospital}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Phone & Email */}
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="phone">Phone Number</label>
                                <div className="input-wrapper">
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        placeholder="071XXXXXXX"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                {errors.phone && <span className="error-message">{errors.phone}</span>}
                            </div>
                            <div className="form-group">
                                <label htmlFor="email">Email Address</label>
                                <div className="input-wrapper">
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder="Email Address"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                {errors.email && <span className="error-message">{errors.email}</span>}
                            </div>
                        </div>

                        {/* Password */}
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <div className="input-wrapper">
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    placeholder="Create a password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            {errors.password && <span className="error-message">{errors.password}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <div className="input-wrapper">
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    placeholder="Confirm your password"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                        </div>

                        <div className="form-group" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <ReCAPTCHA
                                sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                                onChange={(token) => setRecaptchaToken(token)}
                            />
                        </div>

                        <button type="submit" className="signup-btn" disabled={isLoading}>
                            {isLoading ? 'Creating Account...' : 'Sign Up as Doctor'}
                        </button>
                        {errors.submit && <div className="error-message" style={{ justifyContent: 'center', marginTop: '10px' }}>{errors.submit}</div>}
                    </form>

                    <div className="login-link">
                        <p>Already have an account? <Link to="/login">Sign In</Link></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DoctorSignup;
