import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import ECareNavBar from '../Components/eCareNavBar';
import './css/DoctorAvailability.css';

const DoctorAvailability = () => {
    const navigate = useNavigate();
    const containerRef = useRef();
    const [doctor, setDoctor] = useState(null);
    const [availability, setAvailability] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingSlot, setEditingSlot] = useState(null);
    const [formData, setFormData] = useState({
        day_of_week: 'Monday',
        start_time: '09:00',
        end_time: '17:00',
        capacity: 20,
        is_available: true,
        slot_duration: 10 // minutes per appointment
    });

    // Days of week for selection
    const daysOfWeek = [
        { value: 'Monday', label: 'Monday' },
        { value: 'Tuesday', label: 'Tuesday' },
        { value: 'Wednesday', label: 'Wednesday' },
        { value: 'Thursday', label: 'Thursday' },
        { value: 'Friday', label: 'Friday' },
        { value: 'Saturday', label: 'Saturday' },
        { value: 'Sunday', label: 'Sunday' }
    ];

    useGSAP(() => {
        // Animate dashboard elements
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

        tl.fromTo(".dashboard-header",
            { y: -30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8 }
        );

        tl.fromTo(".stats-container",
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6 },
            0.3
        );

        tl.fromTo(".calendar-header",
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5 },
            0.5
        );

        tl.fromTo(".availability-card",
            { scale: 0.95, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, stagger: 0.1 },
            0.7
        );
    }, { scope: containerRef, dependencies: [availability] });

    useEffect(() => {
        // Get doctor info from localStorage
        const doctorInfo = JSON.parse(localStorage.getItem('doctorInfo'));
        const token = localStorage.getItem('token');

        if (!doctorInfo || !token) {
            navigate('/staff-login');
            return;
        }

        setDoctor(doctorInfo);
        fetchAvailability(doctorInfo.id);
    }, [navigate]);

    const fetchAvailability = async (doctorId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/availability/${doctorId}`);
            setAvailability(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching availability:', error);
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate time range
        if (formData.start_time >= formData.end_time) {
            alert('End time must be after start time');
            return;
        }

        // Validate capacity
        if (formData.capacity < 1 || formData.capacity > 100) {
            alert('Capacity must be between 1 and 100');
            return;
        }

        // Check for overlapping slots
        const hasOverlap = availability.some(slot =>
            slot.day_of_week === formData.day_of_week &&
            slot.id !== editingSlot?.id &&
            ((formData.start_time >= slot.start_time && formData.start_time < slot.end_time) ||
                (formData.end_time > slot.start_time && formData.end_time <= slot.end_time) ||
                (formData.start_time <= slot.start_time && formData.end_time >= slot.end_time))
        );

        if (hasOverlap) {
            alert('This time slot overlaps with an existing availability');
            return;
        }

        // Calculate number of appointment slots
        const start = new Date(`2000-01-01T${formData.start_time}`);
        const end = new Date(`2000-01-01T${formData.end_time}`);
        const durationMinutes = (end - start) / (1000 * 60);
        const numberOfSlots = Math.floor(durationMinutes / formData.slot_duration);

        if (numberOfSlots < formData.capacity) {
            alert(`Maximum capacity cannot exceed ${numberOfSlots} patients based on slot duration`);
            return;
        }

        try {
            const payload = { ...formData, doctor_id: doctor.id };
            if (editingSlot) {
                await axios.put(`${API_BASE_URL}/api/availability/${editingSlot.id}`, payload);
            } else {
                await axios.post(`${API_BASE_URL}/api/availability`, payload);
            }

            await fetchAvailability(doctor.id);

            // Reset form
            setFormData({
                day_of_week: 'Monday',
                start_time: '09:00',
                end_time: '17:00',
                capacity: 20,
                is_available: true,
                slot_duration: 10
            });
            setShowAddForm(false);
            setEditingSlot(null);
        } catch (error) {
            console.error('Error saving slot:', error);
            alert('Failed to save slot. Please try again.');
        }
    };

    const handleEdit = (slot) => {
        setEditingSlot(slot);
        setFormData({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            capacity: slot.capacity,
            is_available: slot.is_available,
            slot_duration: slot.slot_duration || 10
        });
        setShowAddForm(true);
    };

    const handleDelete = async (slotId) => {
        if (window.confirm('Are you sure you want to delete this availability slot? This action cannot be undone.')) {
            try {
                await axios.delete(`${API_BASE_URL}/api/availability/${slotId}`);
                await fetchAvailability(doctor.id);
            } catch (error) {
                console.error('Error deleting slot:', error);
                alert('Failed to delete slot.');
            }
        }
    };

    const handleToggleAvailability = async (slotId) => {
        const slot = availability.find(s => s.id === slotId);
        if (!slot) return;

        try {
            await axios.patch(`${API_BASE_URL}/api/availability/${slotId}/toggle`, {
                is_available: !slot.is_available
            });
            await fetchAvailability(doctor.id);
        } catch (error) {
            console.error('Error toggling availability:', error);
            alert('Failed to update slot status.');
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    // Calculate statistics
    const totalSlots = availability.length;
    const activeSlots = availability.filter(s => s.is_available).length;
    const totalCapacity = availability.reduce((sum, slot) => sum + slot.capacity, 0);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading your availability...</p>
            </div>
        );
    }

    return (
        <div className="doctor-availability-page" ref={containerRef}>
            <ECareNavBar />

            <div className="availability-dashboard">
                {/* Header */}
                <div className="dashboard-header">
                    <div className="header-left">
                        <h1>Manage Availability</h1>
                        <p className="doctor-greeting">
                            Welcome back, <strong>Dr. {doctor?.name}</strong>
                        </p>
                    </div>
                    <div className="header-actions">
                        <button className="btn-profile" onClick={() => navigate('/doctorprofile')}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                            </svg>
                            Profile
                        </button>
                        <button className="btn-appointments" onClick={() => navigate('/doctor/appointments')}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z" />
                            </svg>
                            Appointments
                        </button>
                        <button className="btn-logout" onClick={handleLogout}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                            </svg>
                            Logout
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="stats-container">
                    <div className="stat-card">
                        <div className="stat-icon total">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
                            </svg>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{totalSlots}</span>
                            <span className="stat-label">Total Slots</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon active">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                            </svg>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{activeSlots}</span>
                            <span className="stat-label">Active Slots</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon capacity">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-1 .05 1.16.84 2 1.87 2 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                            </svg>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{totalCapacity}</span>
                            <span className="stat-label">Total Capacity</span>
                        </div>
                    </div>
                </div>

                {/* Add Availability Button */}
                {!showAddForm && (
                    <button
                        className="btn-add-slot"
                        onClick={() => setShowAddForm(true)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                        Add New Availability Slot
                    </button>
                )}

                {/* Add/Edit Form */}
                {showAddForm && (
                    <div className="availability-form-container">
                        <div className="form-header">
                            <h2>{editingSlot ? 'Edit Availability Slot' : 'Add New Availability Slot'}</h2>
                            <button
                                className="btn-close"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingSlot(null);
                                    setFormData({
                                        day_of_week: 'Monday',
                                        start_time: '09:00',
                                        end_time: '17:00',
                                        capacity: 20,
                                        is_available: true,
                                        slot_duration: 10
                                    });
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="availability-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Day of Week</label>
                                    <select
                                        name="day_of_week"
                                        value={formData.day_of_week}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        {daysOfWeek.map(day => (
                                            <option key={day.value} value={day.value}>
                                                {day.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Slot Duration (minutes)</label>
                                    <select
                                        name="slot_duration"
                                        value={formData.slot_duration}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        <option value="5">5 minutes</option>
                                        <option value="10">10 minutes</option>
                                        <option value="15">15 minutes</option>
                                        <option value="20">20 minutes</option>
                                        <option value="30">30 minutes</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Start Time</label>
                                    <input
                                        type="time"
                                        name="start_time"
                                        value={formData.start_time}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>End Time</label>
                                    <input
                                        type="time"
                                        name="end_time"
                                        value={formData.end_time}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Maximum Patients</label>
                                    <input
                                        type="number"
                                        name="capacity"
                                        value={formData.capacity}
                                        onChange={handleInputChange}
                                        min="1"
                                        max="100"
                                        required
                                    />
                                </div>

                                <div className="form-group checkbox-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="is_available"
                                            checked={formData.is_available}
                                            onChange={handleInputChange}
                                        />
                                        <span>Available for booking</span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setEditingSlot(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-save">
                                    {editingSlot ? 'Update Slot' : 'Save Slot'}
                                </button>
                            </div>
                        </form>

                        {/* Preview of appointment slots counts */}
                        {formData.start_time && formData.end_time && formData.slot_duration && (
                            <div className="slots-preview">
                                <p className="preview-note">
                                    Total slots available: {Math.floor(
                                        (new Date(`2000-01-01T${formData.end_time}`) - new Date(`2000-01-01T${formData.start_time}`)) /
                                        (1000 * 60 * formData.slot_duration)
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Calendar View */}
                <div className="calendar-view">
                    <div className="calendar-header">
                        <h2>Weekly Schedule</h2>
                        <div className="calendar-legend">
                            <span className="legend-item available">Available</span>
                            <span className="legend-item unavailable">Unavailable</span>
                        </div>
                    </div>

                    <div className="calendar-grid">
                        {daysOfWeek.map(day => {
                            const daySlots = availability.filter(slot => slot.day_of_week === day.value);

                            return (
                                <div key={day.value} className="calendar-day-column">
                                    <h3 className="day-header">{day.label}</h3>
                                    <div className="day-slots">
                                        {daySlots.length === 0 ? (
                                            <div className="no-slots">No slots set</div>
                                        ) : (
                                            daySlots.map(slot => {
                                                let statusClass = 'available';
                                                if (!slot.is_available) statusClass = 'unavailable';

                                                return (
                                                    <div key={slot.id} className={`slot-card ${statusClass}`}>
                                                        <div className="slot-time">
                                                            <span>{slot.start_time} - {slot.end_time}</span>
                                                            <div className="slot-actions">
                                                                <button
                                                                    className="action-btn edit"
                                                                    onClick={() => handleEdit(slot)}
                                                                    title="Edit slot"
                                                                >
                                                                    ✎
                                                                </button>
                                                                <button
                                                                    className="action-btn delete"
                                                                    onClick={() => handleDelete(slot.id)}
                                                                    title="Delete slot"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="slot-details">
                                                            <span className="capacity">
                                                                Capacity: {slot.capacity}
                                                            </span>
                                                        </div>
                                                        <div className="slot-status">
                                                            <label className="toggle-switch">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={slot.is_available}
                                                                    onChange={() => handleToggleAvailability(slot.id)}
                                                                />
                                                                <span className="toggle-slider"></span>
                                                            </label>
                                                            <span className="status-text">
                                                                {slot.is_available ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Quick Tips */}
                <div className="quick-tips">
                    <div className="tips-header">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                        <h3>Quick Tips</h3>
                    </div>
                    <ul className="tips-list">
                        <li>Set realistic capacities based on your consultation time</li>
                        <li>Mark slots as unavailable when you're on leave</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DoctorAvailability;