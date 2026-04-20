import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import ECareNavBar from '../Components/eCareNavBar';
import './css/DoctorProfile.css';

const DoctorProfile = () => {
    const navigate = useNavigate();
    const containerRef = useRef();
    const [doctorInfo, setDoctorInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        specialization: '',
        slmc_id: '',
        nic: '',
        email: '',
        phone: '',
        consulting_fee: '',
        hospital: ''
    });

    useGSAP(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        
        tl.fromTo(".profile-header", 
            { y: -30, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 0.8 }
        );

        tl.fromTo(".profile-card", 
            { y: 30, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 0.6 },
            0.3
        );
        
        tl.fromTo(".form-group",
            { x: -20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.4, stagger: 0.1 },
            0.5
        );
        
        tl.fromTo(".profile-actions .action-btn",
            { scale: 0.9, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, stagger: 0.1 },
            0.8
        );
    }, { scope: containerRef, dependencies: [loading] });

    useEffect(() => {
        const doctorLocal = JSON.parse(localStorage.getItem('doctorInfo'));
        const token = localStorage.getItem('token');

        if (!doctorLocal || !token) {
            navigate('/staff-login');
            return;
        }

        fetchDoctorDetails(doctorLocal.id);
    }, [navigate]);

    const fetchDoctorDetails = async (id) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/auth/doctor/${id}`);
            setDoctorInfo(response.data);
            setFormData({
                name: response.data.name || '',
                specialization: response.data.specialization || '',
                slmc_id: response.data.slmc_id || '',
                nic: response.data.nic || '',
                email: response.data.email || '',
                phone: response.data.phone || '',
                consulting_fee: response.data.consulting_fee || '',
                hospital: response.data.hospital || ''
            });
            setLoading(false);
        } catch (error) {
            console.error('Error fetching doctor details:', error);
            alert('Failed to load profile data.');
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleUpdate = async (e) => {
        e.preventDefault();

        if (!/^[A-Za-z\s-]+$/.test(formData.name)) {
            alert('Doctor name can only contain letters, spaces, and hyphens');
            return;
        }

        if (!/^[A-Za-z\s-]+$/.test(formData.specialization)) {
            alert('Specialization can only contain letters, spaces, and hyphens');
            return;
        }

        if (!/^0\d{9}$/.test(formData.phone)) {
            alert('Phone number must start with 0 and be exactly 10 digits long');
            return;
        }

        try {
            await axios.put(`${API_BASE_URL}/api/auth/doctor/${doctorInfo.id}`, formData);
            alert('Profile updated successfully!');
            setIsEditing(false);
            fetchDoctorDetails(doctorInfo.id);
            
            // Update local storage just in case
            const updatedLocal = JSON.parse(localStorage.getItem('doctorInfo'));
            updatedLocal.name = formData.name;
            localStorage.setItem('doctorInfo', JSON.stringify(updatedLocal));
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile.');
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm('Are you ABSOLUTELY sure you want to delete your account? This action cannot be undone.')) {
            try {
                await axios.delete(`${API_BASE_URL}/api/auth/doctor/${doctorInfo.id}`);
                alert('Account deleted successfully.');
                localStorage.clear();
                navigate('/');
            } catch (error) {
                console.error('Error deleting account:', error);
                const errorMsg = error.response?.data?.message || 'Failed to delete account.';
                alert(errorMsg);
            }
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading your profile...</p>
            </div>
        );
    }

    return (
        <div className="doctor-profile-page" ref={containerRef}>
            <ECareNavBar />
            
            <div className="profile-dashboard">
                <div className="profile-header">
                    <div className="header-left">
                        <h1>Doctor Profile</h1>
                        <p className="doctor-greeting">
                            Manage your personal details and account settings
                        </p>
                    </div>
                </div>

                <div className="profile-card">
                    <div className="profile-avatar-section">
                        <div className="avatar-circle">
                            {formData.name.charAt(0).toUpperCase()}
                        </div>
                        <h2>Dr. {formData.name}</h2>
                        <span className="specialization-badge">{formData.specialization}</span>
                    </div>

                    <form onSubmit={handleUpdate} className="profile-form">
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Full Name</label>
                                <input 
                                    type="text" 
                                    name="name" 
                                    value={formData.name} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    required 
                                />
                            </div>
                            
                            <div className="form-group">
                                <label>Specialization</label>
                                <select 
                                    name="specialization" 
                                    value={formData.specialization} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    required 
                                    className="form-select"
                                >
                                    <option value="">Select Specialization</option>
                                    <option value="Dermatologist">Dermatologist</option>
                                    <option value="Cardiologist">Cardiologist</option>
                                    <option value="Neurologist">Neurologist</option>
                                    <option value="ENT Specialist">ENT Specialist</option>
                                    <option value="Gastroenterologist">Gastroenterologist</option>
                                    <option value="Orthopedic Surgeon">Orthopedic Surgeon</option>
                                    <option value="Psychiatrist">Psychiatrist</option>
                                    <option value="Urologist">Urologist</option>
                                    <option value="Gynecologist">Gynecologist</option>
                                    <option value="Ophthalmologist">Ophthalmologist</option>
                                    <option value="Dentist">Dentist</option>
                                    <option value="Endocrinologist">Endocrinologist</option>
                                    <option value="Emergency Care Physician">Emergency Care Physician</option>
                                    <option value="General Physician">General Physician</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>SLMC ID</label>
                                <input 
                                    type="text" 
                                    name="slmc_id" 
                                    value={formData.slmc_id} 
                                    onChange={handleInputChange} 
                                    disabled={true} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label>NIC</label>
                                <input 
                                    type="text" 
                                    name="nic" 
                                    value={formData.nic} 
                                    onChange={handleInputChange} 
                                    disabled={true} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label>Email Address</label>
                                <input 
                                    type="email" 
                                    name="email" 
                                    value={formData.email} 
                                    onChange={handleInputChange} 
                                    disabled={true} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label>Phone Number</label>
                                <input 
                                    type="tel" 
                                    name="phone" 
                                    value={formData.phone} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    required 
                                />
                            </div>
                            
                            <div className="form-group">
                                <label>Consulting Fee (LKR)</label>
                                <div className="input-with-currency">
                                    <span className="currency-prefix">LKR</span>
                                    <input 
                                        type="number" 
                                        name="consulting_fee" 
                                        value={formData.consulting_fee} 
                                        onChange={handleInputChange} 
                                        disabled={!isEditing}
                                        min="0"
                                        step="0.01"
                                        required 
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Hospital</label>
                                <input 
                                    type="text" 
                                    name="hospital" 
                                    value={formData.hospital} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                />
                            </div>
                        </div>

                        <div className="profile-actions">
                            {!isEditing ? (
                                <button type="button" className="action-btn btn-green" onClick={(e) => { e.preventDefault(); setIsEditing(true); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                    </svg>
                                    Edit Details
                                </button>
                            ) : (
                                <div className="edit-actions">
                                    <button type="submit" className="action-btn btn-green">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                        </svg>
                                        Save Updates
                                    </button>
                                    <button type="button" className="action-btn btn-gray" onClick={() => { setIsEditing(false); fetchDoctorDetails(doctorInfo.id); }}>
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <button type="button" className="action-btn btn-yellow" onClick={() => navigate('/doctor-availability')}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/>
                                </svg>
                                Manage Availability
                            </button>
                            
                            <button type="button" className="action-btn btn-red" onClick={handleDeleteAccount}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                                Delete Account
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default DoctorProfile;
