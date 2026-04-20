import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import ECareNavBar from '../../Components/eCareNavBar';
import '../css/CreateSchedule.css';

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

const CreateSchedule = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        doctor_id: '',
        schedule_date: '',
        start_time: '',
        end_time: '',
        max_patients: '',
        price: ''
    });

    // New state for dynamic dropdowns
    const [allDoctors, setAllDoctors] = useState([]);
    const [specializations, setSpecializations] = useState([]);
    const [selectedSpecialization, setSelectedSpecialization] = useState('');
    const [filteredDoctors, setFilteredDoctors] = useState([]);

    const [availabilityList, setAvailabilityList] = useState([]);
    const [filterDay, setFilterDay] = useState('');
    const [filterMarked, setFilterMarked] = useState('All');

    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);

    // Fetch doctors and availability on mount
    useEffect(() => {
        const fetchDoctors = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/doctors`);
                const data = await response.json();
                if (response.ok && data.doctors) {
                    setAllDoctors(data.doctors);
                    // Extract unique specializations
                    const uniqueSpecs = [...new Set(data.doctors.map(doc => doc.specialization))];
                    setSpecializations(uniqueSpecs);
                }
            } catch (error) {
                console.error("Failed to fetch doctors:", error);
                setIsError(true);
                setMessage("Could not load doctors list.");
            }
        };

        const fetchAvailability = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/availability/all`);
                const data = await response.json();
                if (response.ok) setAvailabilityList(data);
            } catch (error) {
                console.error("Failed to fetch availability:", error);
            }
        };

        fetchDoctors();
        fetchAvailability();
    }, []);

    // Handle specialization change
    const handleSpecializationChange = (e) => {
        const spec = e.target.value;
        setSelectedSpecialization(spec);

        // Filter doctors by selected specialization
        const filtered = allDoctors.filter(doc => doc.specialization === spec);
        setFilteredDoctors(filtered);

        // Reset doctor selection
        setFormData(prev => ({ ...prev, doctor_id: '' }));
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleTimeChange = (field, type, value) => {
        const currentTime = formData[field] || '';
        let h = '', m = '';
        if (currentTime) {
            [h, m] = currentTime.split(':');
        }

        if (type === 'hour') h = value;
        if (type === 'minute') m = value;

        if (h && !m) m = '00';
        if (!h && m) h = '00';

        const newTime = h && m ? `${h}:${m}` : '';
        setFormData(prev => ({ ...prev, [field]: newTime }));
    };

    const toggleMarked = async (e, slotId) => {
        e.stopPropagation();
        try {
            const res = await fetch(`${API_BASE_URL}/api/availability/${slotId}/mark`, {
                method: 'PATCH'
            });
            if (res.ok) {
                const data = await res.json();
                setAvailabilityList(prev => prev.map(s => s.id === slotId ? { ...s, Marked: data.Marked } : s));
            }
        } catch (error) {
            console.error('Error toggling mark:', error);
        }
    };

    const handleCardClick = (slot) => {
        setSelectedSpecialization(slot.specialization);
        setFilteredDoctors(allDoctors.filter(doc => doc.specialization === slot.specialization));

        let parsedMaxPatients = parseInt(slot.capacity, 10);

        setFormData(prev => ({
            ...prev,
            doctor_id: slot.doctor_id,
            start_time: slot.start_time.substring(0, 5),
            end_time: slot.end_time.substring(0, 5),
            max_patients: parsedMaxPatients || ''
        }));
    };

    const filteredAvailability = availabilityList.filter(slot => {
        if (filterDay && slot.day_of_week !== filterDay) return false;
        if (filterMarked === 'Marked' && !slot.Marked) return false;
        if (filterMarked === 'Unmarked' && slot.Marked) return false;
        return true;
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        const timeToMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const start_time_minutes = timeToMinutes(formData.start_time);
        const end_time_minutes = timeToMinutes(formData.end_time);

        if (end_time_minutes <= start_time_minutes) {
            setIsError(true);
            setMessage("Error: End time must be after start time.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/schedules`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('Schedule created successfully!');
                setFormData({
                    doctor_id: '',
                    schedule_date: '',
                    start_time: '',
                    end_time: '',
                    max_patients: '',
                    price: ''
                });
            } else {
                setIsError(true);
                setMessage(data.message || 'Failed to create schedule');
            }
        } catch (error) {
            setIsError(true);
            setMessage('Network error occurred. Please try again.');
        }
    };

    return (
        <div className="create-schedule-page">
            <ECareNavBar />
            <div className="split-view-wrapper">
                <div className="availability-list-container">
                    <div className="list-header">
                        <h3>Doctor Availability</h3>
                        <div className="availability-filters">
                            <select value={filterDay} onChange={e => setFilterDay(e.target.value)}>
                                <option value="">All Days</option>
                                <option value="Monday">Monday</option>
                                <option value="Tuesday">Tuesday</option>
                                <option value="Wednesday">Wednesday</option>
                                <option value="Thursday">Thursday</option>
                                <option value="Friday">Friday</option>
                                <option value="Saturday">Saturday</option>
                                <option value="Sunday">Sunday</option>
                            </select>
                            <select value={filterMarked} onChange={e => setFilterMarked(e.target.value)}>
                                <option value="All">All Status</option>
                                <option value="Marked">Marked</option>
                                <option value="Unmarked">Unmarked</option>
                            </select>
                        </div>
                    </div>

                    <div className="availability-cards">
                        {filteredAvailability.length > 0 ? filteredAvailability.map(slot => (
                            <div
                                key={slot.id}
                                className={`availability-card ${formData.doctor_id === slot.doctor_id && formData.start_time === slot.start_time.substring(0, 5) ? 'active-card' : ''}`}
                                onClick={() => handleCardClick(slot)}
                            >
                                <div className="card-info">
                                    <h4>Dr. {slot.doctor_name}</h4>
                                    <p><strong>{slot.specialization}</strong></p>
                                    <p>{slot.day_of_week} • {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}</p>
                                    <p>Capacity: {slot.capacity}</p>
                                </div>
                                <div className="card-actions">
                                    <button
                                        type="button"
                                        className={`mark-btn ${slot.Marked ? 'marked' : 'unmarked'}`}
                                        onClick={(e) => toggleMarked(e, slot.id)}
                                        title={slot.Marked ? 'Unmark Slot' : 'Mark Slot'}
                                    >
                                        {slot.Marked ? '✓' : '+'}
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <p style={{ textAlign: 'center', color: '#6B7280' }}>No availability slots found.</p>
                        )}
                    </div>
                </div>

                <div className="create-schedule-container">
                    <div className="create-schedule-header">
                        <h2>Create Doctor Schedule</h2>
                        <p>Add new availability for doctors</p>
                    </div>

                    {message && (
                        <div className={`message ${isError ? 'error' : 'success'}`}>
                            {message}
                        </div>
                    )}

                    <form className="schedule-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Specialization</label>
                            <select
                                value={selectedSpecialization}
                                onChange={handleSpecializationChange}
                                required
                            >
                                <option value="">Select Specialization</option>
                                {specializations.map(spec => (
                                    <option key={spec} value={spec}>{spec}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Doctor Name</label>
                            <select
                                name="doctor_id"
                                value={formData.doctor_id}
                                onChange={handleChange}
                                required
                                disabled={!selectedSpecialization}
                            >
                                <option value="">Select a Doctor</option>
                                {filteredDoctors.map(doc => (
                                    <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Schedule Date</label>
                            <input
                                style={{ backgroundColor: "#fffffffd" }}
                                type="date"
                                name="schedule_date"
                                value={formData.schedule_date}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="time-row">
                            <div className="form-group">
                                <label>Start Time (24H)</label>
                                <div className="time-picker-container">
                                    <select
                                        value={formData.start_time ? formData.start_time.split(':')[0] : ''}
                                        onChange={(e) => handleTimeChange('start_time', 'hour', e.target.value)}
                                        required
                                    >
                                        <option value="" disabled>HH</option>
                                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span>:</span>
                                    <select
                                        value={formData.start_time ? formData.start_time.split(':')[1] : ''}
                                        onChange={(e) => handleTimeChange('start_time', 'minute', e.target.value)}
                                        required
                                    >
                                        <option value="" disabled>MM</option>
                                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>End Time (24H)</label>
                                <div className="time-picker-container">
                                    <select
                                        value={formData.end_time ? formData.end_time.split(':')[0] : ''}
                                        onChange={(e) => handleTimeChange('end_time', 'hour', e.target.value)}
                                        required
                                    >
                                        <option value="" disabled>HH</option>
                                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span>:</span>
                                    <select
                                        value={formData.end_time ? formData.end_time.split(':')[1] : ''}
                                        onChange={(e) => handleTimeChange('end_time', 'minute', e.target.value)}
                                        required
                                    >
                                        <option value="" disabled>MM</option>
                                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Max Patients</label>
                            <input
                                type="number"
                                name="max_patients"
                                value={formData.max_patients}
                                onChange={handleChange}
                                placeholder="e.g. 20"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Price (Rs.)</label>
                            <input
                                type="number"
                                step="0.01"
                                name="price"
                                value={formData.price}
                                onChange={handleChange}
                                placeholder="e.g. 1500.00"
                                required
                            />
                        </div>

                        <button type="submit" className="submit-btn" style={{ width: '100%' }}>Create Schedule</button>
                        <button type="button" className="submit-btn" style={{ background: '#6B7280', marginTop: '10px', width: '100%' }} onClick={() => navigate('/schedules/manage')}>Back to Dashboard</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateSchedule;
