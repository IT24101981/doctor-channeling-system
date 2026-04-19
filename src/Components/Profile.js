import React, { useState, useEffect, useCallback } from 'react';
import './ComponentsCss/Profile.css';

const Profile = ({ patientId, onClose, onUpdate }) => {
    const [patient, setPatient] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        secondName: '',
        phone: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [uploading, setUploading] = useState(false);

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/patient/${patientId}?t=${Date.now()}`);
            const data = await response.json();

            if (response.ok) {
                setPatient(data.patient);
                setFormData({
                    firstName: data.patient.first_name,
                    secondName: data.patient.second_name,
                    phone: data.patient.phone
                });
            } else {
                setError(data.message || 'Failed to fetch profile');
            }
        } catch (err) {
            console.error('Error fetching profile:', err);
            setError('Failed to connect to the server');
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        // Validation
        const nameRegex = /^[A-Za-z\s]+$/;
        const phoneRegex = /^0\d{9}$/;

        if (!nameRegex.test(formData.firstName)) {
            setError('First name should only contain characters');
            return;
        }
        if (!nameRegex.test(formData.secondName)) {
            setError('Second name should only contain characters');
            return;
        }
        if (!phoneRegex.test(formData.phone)) {
            setError('Please enter a valid Sri Lankan phone number (e.g., 0712345678)');
            return;
        }

        console.log('Starting profile update for patientId:', patientId);
        console.log('Data being sent:', formData);

        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/patient/${patientId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            console.log('Update response status:', response.status);
            console.log('Update response data:', data);

            if (response.ok) {
                // Update local storage so the Navbar also updates
                const storedUser = JSON.parse(localStorage.getItem('user'));
                console.log('Stored user before update:', storedUser);

                const updatedUser = {
                    ...storedUser,
                    firstName: formData.firstName,
                    secondName: formData.secondName,
                    first_name: formData.firstName,
                    second_name: formData.secondName
                };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                console.log('Stored user after update:', updatedUser);
                window.dispatchEvent(new Event('profileUpdated'));

                setSuccess('Profile updated successfully!');
                setEditMode(false);

                // Add a small delay to ensure DB has settled and avoid caching
                setTimeout(() => {
                    fetchProfile();
                    if (onUpdate) onUpdate(updatedUser);
                }, 500);
            } else {
                setError(data.message || 'Failed to update profile');
            }
        } catch (err) {
            console.error('CRITICAL Error updating profile:', err);
            setError('Failed to connect to the server');
        }
    };


    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formDataPhoto = new FormData();
        formDataPhoto.append('profilePhoto', file);

        setUploading(true);
        setError(null);

        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/patient/${patientId}/photo`, {
                method: 'POST',
                body: formDataPhoto
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess('Photo uploaded successfully!');
                fetchProfile();
                if (onUpdate) onUpdate();
            } else {
                setError(data.message || 'Failed to upload photo');
            }
        } catch (err) {
            console.error('Error uploading photo:', err);
            setError('Failed to connect to the server');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/patient/${patientId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                localStorage.clear();
                window.location.href = '/';
            } else {
                const data = await response.json();
                setError(data.message || 'Failed to delete account');
                setShowDeleteConfirm(false);
            }
        } catch (err) {
            console.error('Error deleting account:', err);
            setError('Failed to connect to the server');
            setShowDeleteConfirm(false);
        }
    };

    if (loading) return <div className="profile-loading">Loading profile...</div>;

    return (
        <div className="profile-overlay">
            <div className="profile-modal">
                <div className="profile-header">
                    <div className="header-title">
                        <span className="material-symbols-outlined header-icon">account_circle</span>
                        <h2>Your Profile</h2>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="profile-content">
                    {error && <div className="profile-error">{error}</div>}
                    {success && <div className="profile-success">{success}</div>}

                    <div className="profile-photo-section">
                        <div className="profile-avatar">
                            {patient?.profile_photo ? (
                                <img src={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${patient.profile_photo}`} alt="Profile" />
                            ) : (
                                <div className="avatar-placeholder">
                                    <span className="material-symbols-outlined">person</span>
                                </div>
                            )}
                        </div>
                        <div className="photo-actions">
                            <label className="upload-btn">
                                <span className="material-symbols-outlined">camera_alt</span>
                                {uploading ? 'Uploading...' : 'Change Photo'}
                                <input type="file" onChange={handlePhotoUpload} accept="image/*" hidden />
                            </label>
                        </div>
                    </div>

                    <form className="profile-form" onSubmit={handleUpdate}>
                        <div className="form-group">
                            <div className="label-with-icon">
                                <span className="material-symbols-outlined field-icon">person</span>
                                <label>First Name</label>
                            </div>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleInputChange}
                                disabled={!editMode}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <div className="label-with-icon">
                                <span className="material-symbols-outlined field-icon">person_book</span>
                                <label>Second Name</label>
                            </div>
                            <input
                                type="text"
                                name="secondName"
                                value={formData.secondName}
                                onChange={handleInputChange}
                                disabled={!editMode}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <div className="label-with-icon">
                                <span className="material-symbols-outlined field-icon">mail</span>
                                <label>Email</label>
                                <span className="badge-readonly">
                                    <span className="material-symbols-outlined">lock</span>
                                    Cannot be changed
                                </span>
                            </div>
                            <input type="email" value={patient?.email || ''} disabled className="readonly-input" />
                        </div>
                        <div className="form-group">
                            <div className="label-with-icon">
                                <span className="material-symbols-outlined field-icon">badge</span>
                                <label>NIC</label>
                                <span className="badge-readonly">
                                    <span className="material-symbols-outlined">lock</span>
                                    Cannot be changed
                                </span>
                            </div>
                            <input type="text" value={patient?.nic || ''} disabled className="readonly-input" />
                        </div>
                        <div className="form-group">
                            <div className="label-with-icon">
                                <span className="material-symbols-outlined field-icon">call</span>
                                <label>Phone</label>
                            </div>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                disabled={!editMode}
                                required
                            />
                        </div>

                        <div className="profile-actions">
                            {!editMode ? (
                                <button type="button" className="edit-profile-btn" onClick={() => setEditMode(true)}>
                                    <span className="material-symbols-outlined">edit</span>
                                    Edit Profile
                                </button>
                            ) : (
                                <div className="edit-actions">
                                    <button type="submit" className="save-btn">
                                        <span className="material-symbols-outlined">check</span>
                                        Save Changes
                                    </button>
                                    <button type="button" className="cancel-btn" onClick={() => {
                                        setEditMode(false);
                                        setFormData({
                                            firstName: patient.first_name,
                                            secondName: patient.second_name,
                                            phone: patient.phone
                                        });
                                    }}>
                                        <span className="material-symbols-outlined">close</span>
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </form>

                    <div className="danger-zone">
                        <div className="danger-header">
                            <span className="material-symbols-outlined">warning</span>
                            <h3>Danger Zone</h3>
                        </div>
                        <p>Once you delete your account, there is no going back. Please be certain.</p>
                        <button className="delete-account-btn" onClick={() => setShowDeleteConfirm(true)}>
                            <span className="material-symbols-outlined">delete</span>
                            Delete My Account
                        </button>
                    </div>
                </div>
            </div>

            {showDeleteConfirm && (
                <div className="confirm-modal-overlay">
                    <div className="confirm-modal">
                        <h3>Delete Account?</h3>
                        <p>Are you sure you want to delete your account? this action cannot be undone.</p>
                        <div className="confirm-actions">
                            <button className="confirm-delete-btn" onClick={handleDeleteAccount}>Yes, Delete Account</button>
                            <button className="confirm-cancel-btn" onClick={() => setShowDeleteConfirm(false)}>No, Keep Account</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;
