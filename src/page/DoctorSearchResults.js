import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ECareNavBar from '../Components/eCareNavBar';
import { formatScheduleDateLK } from '../utils/sriLankaTime';
import './css/DoctorSearchResults.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const SUGGESTION_LIMIT = 5;

const HighlightMatch = ({ text, query }) => {
    if (!query.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
        <span>
            {text.slice(0, idx)}
            <strong>{text.slice(idx, idx + query.length)}</strong>
            {text.slice(idx + query.length)}
        </span>
    );
};

const DoctorSearchResults = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const [filters, setFilters] = useState({
        doctorName: searchParams.get('name') || '',
        specialization: searchParams.get('specialization') || '',
        date: searchParams.get('date') || '',
    });

    const [specializations, setSpecializations] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');
    const [patientId, setPatientId] = useState(null);
    const [bookedScheduleIds, setBookedScheduleIds] = useState(() => new Set());

    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionLoading, setSuggestionLoading] = useState(false);
    const nameWrapperRef = useRef(null);

    // Load patientId for "already booked" validation
    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) return;
        try {
            const u = JSON.parse(stored);
            if (u?.id != null) setPatientId(Number(u.id));
        } catch {
            // ignore invalid stored user
        }
    }, []);

    useEffect(() => {
        if (!patientId) return;
        const fetchBookedSchedules = async () => {
            try {
                const res = await fetch(`${API_URL}/api/appointments/patient/${patientId}`);
                const data = await res.json();
                if (!res.ok) return;
                const booked = (data.data || [])
                    .filter((a) => {
                        const st = String(a?.appointment_status || 'added').toLowerCase();
                        return !['failed', 'cancelled'].includes(st);
                    })
                    .map((a) => Number(a.schedule_id))
                    .filter((n) => Number.isFinite(n));
                setBookedScheduleIds(new Set(booked));
            } catch {
                // silent
            }
        };
        fetchBookedSchedules();
    }, [patientId]);

    // Fetch specializations
    useEffect(() => {
        const fetchSpec = async () => {
            try {
                const res = await fetch(`${API_URL}/api/auth/doctors/specializations`);
                const data = await res.json();
                if (res.ok) setSpecializations(data.specializations || []);
            } catch { /* silent */ }
        };
        fetchSpec();
    }, []);

    // Auto-search on mount if params exist
    useEffect(() => {
        const hasParams = filters.doctorName || filters.specialization || filters.date;
        if (hasParams) fetchDoctors(filters);
        else fetchDoctors(filters); // show all doctors by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Suggestion debounce
    useEffect(() => {
        const query = filters.doctorName.trim();
        if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
        setSuggestionLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/api/auth/doctors?name=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (res.ok) { setSuggestions(data.doctors || []); setShowSuggestions(true); }
            } catch { setSuggestions([]); }
            finally { setSuggestionLoading(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [filters.doctorName]);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e) => {
            if (nameWrapperRef.current && !nameWrapperRef.current.contains(e.target))
                setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const fetchDoctors = async (data) => {
        setLoading(true);
        setError('');
        setSearched(true);
        try {
            const params = new URLSearchParams();
            if (data.doctorName.trim()) params.append('name', data.doctorName.trim());
            if (data.specialization) params.append('specialization', data.specialization);
            if (data.date) params.append('date', data.date);

            const schedulesUrl = data.date
                ? `${API_URL}/api/schedules/date/${encodeURIComponent(data.date)}`
                : `${API_URL}/api/schedules`;

            const [docRes, schedRes] = await Promise.all([
                fetch(`${API_URL}/api/auth/doctors?${params.toString()}`),
                fetch(schedulesUrl)
            ]);

            const docData = await docRes.json();
            const schedData = await schedRes.json();

            if (docRes.ok) setDoctors(docData.doctors || []);
            else { setError(docData.message || 'Failed to fetch doctors.'); setDoctors([]); }

            if (schedData.success) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const active = schedData.data.filter(s => {
                    const d = new Date(s.schedule_date);
                    return (s.status === 'active' || s.status === 'full') && d >= today;
                });
                setSchedules(active);
            }
        } catch {
            setError('Unable to connect to server. Please try again.');
            setDoctors([]);
        } finally {
            setLoading(false);
        }
    };

    const getDoctorSchedules = (doctorId) => {
        let list = schedules.filter(s => s.doctor_id === doctorId);
        if (filters.date) list = list.filter(s => s.schedule_date.slice(0, 10) === filters.date);
        return list;
    };

    const formatDate = (dateString) => formatScheduleDateLK(dateString);

    const handleBook = (schedule) => {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            alert('Please login to book an appointment.');
            navigate('/login');
            return;
        }
        navigate(`/appointments/new/${schedule.id}/${schedule.doctor_id}`, {
            state: { schedule, from: '/ecare/doctors' }
        });
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setShowSuggestions(false);
        // Update URL params
        const p = {};
        if (filters.doctorName.trim()) p.name = filters.doctorName.trim();
        if (filters.specialization) p.specialization = filters.specialization;
        if (filters.date) p.date = filters.date;
        setSearchParams(p);
        fetchDoctors(filters);
    };

    const handleSelectSuggestion = (name) => {
        const newFilters = { ...filters, doctorName: name };
        setFilters(newFilters);
        setShowSuggestions(false);
        fetchDoctors(newFilters);
    };

    const handleViewInfo = (doctor) => { setSelectedDoctor(doctor); setShowModal(true); };
    const closeModal = () => { setShowModal(false); setSelectedDoctor(null); };

    const visibleSuggestions = suggestions.slice(0, SUGGESTION_LIMIT);
    const extraCount = suggestions.length - SUGGESTION_LIMIT;

    return (
        <div className="dsr-page">
            <ECareNavBar />

            {/* Filter Bar */}
            <div className="dsr-filter-bar">
                <form className="dsr-filter-form" onSubmit={handleSearch}>
                    {/* Doctor Name */}
                    <div className="dsr-name-wrapper" ref={nameWrapperRef}>
                        <div className="dsr-input-group">
                            <span className="material-symbols-outlined dsr-input-icon">person</span>
                            <input
                                type="text"
                                name="doctorName"
                                placeholder="Doctor name"
                                maxLength={40}
                                value={filters.doctorName}
                                onChange={handleChange}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                className="dsr-input"
                                autoComplete="off"
                            />
                            {suggestionLoading && (
                                <span className="material-symbols-outlined dsr-spin">sync</span>
                            )}
                        </div>
                        {showSuggestions && visibleSuggestions.length > 0 && (
                            <ul className="dsr-suggestions">
                                {visibleSuggestions.map((doc) => (
                                    <li key={doc.id} className="dsr-suggestion-item"
                                        onMouseDown={() => handleSelectSuggestion(doc.name)}>
                                        <span className="material-symbols-outlined dsr-sug-icon">person</span>
                                        <span className="dsr-sug-name">
                                            <HighlightMatch text={doc.name} query={filters.doctorName} />
                                        </span>
                                        {doc.specialization && (
                                            <span className="dsr-sug-spec">{doc.specialization}</span>
                                        )}
                                    </li>
                                ))}
                                {extraCount > 0 && (
                                    <li className="dsr-sug-more" onMouseDown={() => setShowSuggestions(false)}>
                                        <span className="material-symbols-outlined">expand_more</span>
                                        {extraCount} more result{extraCount !== 1 ? 's' : ''}
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>

                    {/* Specialization */}
                    <div className="dsr-input-group">
                        <span className="material-symbols-outlined dsr-input-icon">local_hospital</span>
                        <select
                            name="specialization"
                            value={filters.specialization}
                            onChange={handleChange}
                            className="dsr-select"
                        >
                            <option value="">Any Specialization</option>
                            {specializations.map((spec, i) => (
                                <option key={i} value={spec}>{spec}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date */}
                    <div className="dsr-input-group">
                        <span className="material-symbols-outlined dsr-input-icon">calendar_month</span>
                        <input
                            type="date"
                            name="date"
                            value={filters.date}
                            onChange={handleChange}
                            className="dsr-input"
                            autoComplete="off"
                        />
                    </div>

                    <button type="submit" className="dsr-search-btn" disabled={loading}>
                        <span className="material-symbols-outlined">
                            {loading ? 'sync' : 'search'}
                        </span>
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </form>
            </div>

            {/* Results */}
            <div className="dsr-content">
                {error && <p className="dsr-error">{error}</p>}

                {loading && (
                    <div className="dsr-loading">
                        <span className="material-symbols-outlined dsr-loading-icon">sync</span>
                        <span>Loading doctors...</span>
                    </div>
                )}

                {searched && !loading && (
                    <>
                        <div className="dsr-results-header">
                            <div className="dsr-results-count">
                                <span className="material-symbols-outlined">groups</span>
                                {doctors.length} Doctor{doctors.length !== 1 ? 's' : ''} Found
                            </div>
                            <button className="dsr-back-btn" onClick={() => navigate('/eCare')}>
                                <span className="material-symbols-outlined">arrow_back</span>
                                Back
                            </button>
                        </div>

                        {doctors.length === 0 ? (
                            <div className="dsr-empty">
                                <span className="material-symbols-outlined dsr-empty-icon">person_search</span>
                                <p>No doctors found matching your search.</p>
                                <span>Try different filters or search terms.</span>
                            </div>
                        ) : (
                            <div className="dsr-cards-grid">
                                {doctors.map((doctor) => {
                                    const doctorSchedules = getDoctorSchedules(doctor.id);
                                    return (
                                        <div key={doctor.id} className="dsr-card">
                                            <div className="dsr-card-header">
                                                <div className="dsr-avatar">
                                                    <span className="material-symbols-outlined">person</span>
                                                </div>
                                                <div className="dsr-card-info">
                                                    <h4 className="dsr-doctor-name">Dr. {doctor.name}</h4>
                                                    <span className="dsr-spec-tag">{doctor.specialization}</span>
                                                </div>
                                                <button className="dsr-btn-info" onClick={() => handleViewInfo(doctor)}>
                                                    <span className="material-symbols-outlined">info</span>
                                                </button>
                                            </div>

                                            <div className="dsr-card-body">
                                                {doctor.hospital && (
                                                    <div className="dsr-detail">
                                                        <span className="material-symbols-outlined">location_on</span>
                                                        <span>{doctor.hospital}</span>
                                                    </div>
                                                )}
                                                {doctor.phone && (
                                                    <div className="dsr-detail">
                                                        <span className="material-symbols-outlined">phone</span>
                                                        <span>{doctor.phone}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Schedules */}
                                            <div className="dsr-schedules">
                                                <div className="dsr-schedules-label">
                                                    <span className="material-symbols-outlined">event_note</span>
                                                    Available Schedules
                                                </div>
                                                {doctorSchedules.length === 0 ? (
                                                    <div className="dsr-no-schedules">
                                                        <span className="material-symbols-outlined">event_busy</span>
                                                        No upcoming schedules
                                                    </div>
                                                ) : (
                                                    doctorSchedules.map(s => {
                                                        const isFull = s.booked_count >= s.max_patients || s.status === 'full';
                                                        const isAlreadyBooked = bookedScheduleIds.has(Number(s.id));
                                                        const spotsLeft = s.max_patients - s.booked_count;
                                                        return (
                                                            <div key={s.id} className="dsr-schedule-row">
                                                                <div className="dsr-schedule-info">
                                                                    <div className="dsr-schedule-date">
                                                                        <span className="material-symbols-outlined">calendar_today</span>
                                                                        {formatDate(s.schedule_date)}
                                                                    </div>
                                                                    <div className="dsr-schedule-time">
                                                                        <span className="material-symbols-outlined">schedule</span>
                                                                        {s.start_time} – {s.end_time}
                                                                    </div>
                                                                    <div className={`dsr-schedule-spots ${isFull ? 'spots-full' : spotsLeft <= 3 ? 'spots-low' : ''}`}>
                                                                        <span className="material-symbols-outlined">group</span>
                                                                        {isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    className={`dsr-book-btn ${
                                                                        isFull ? 'dsr-book-btn-full' : ''
                                                                    } ${isAlreadyBooked ? 'dsr-book-btn-already' : ''}`}
                                                                    onClick={() => !(isFull || isAlreadyBooked) && handleBook(s)}
                                                                    disabled={isFull || isAlreadyBooked}
                                                                >
                                                                    {isAlreadyBooked ? 'Already Booked' : (isFull ? 'Full' : 'Book')}
                                                                </button>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Search Disclaimer at Bottom */}
                <div className="dsr-bottom-disclaimer">
                    <span className="material-symbols-outlined">info</span>
                    <p>Search results are based on real-time availability. Always confirm with the channeling center for urgent matters.</p>
                </div>
            </div>

            {/* Footer */}
            <footer className="ecare-footer">
                <div className="footer-content">
                    <p>&copy; 2026 NCC eCare - Narammala Channeling Center. All rights reserved.</p>
                </div>
            </footer>

            {/* Doctor Info Modal */}
            {showModal && selectedDoctor && (
                <div className="dsr-modal-overlay" onClick={closeModal}>
                    <div className="dsr-modal" onClick={e => e.stopPropagation()}>
                        <div className="dsr-modal-header">
                            <h3>Doctor Information</h3>
                            <button className="dsr-modal-close" onClick={closeModal}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="dsr-modal-body">
                            <div className="dsr-modal-avatar">
                                <span className="material-symbols-outlined">person</span>
                            </div>
                            <div className="dsr-modal-info">
                                <h4 className="dsr-modal-name">Dr. {selectedDoctor.name}</h4>
                                <span className="dsr-modal-spec">{selectedDoctor.specialization}</span>
                                <div className="dsr-modal-details">
                                    <div className="dsr-modal-row">
                                        <strong>Hospital</strong>
                                        <span>{selectedDoctor.hospital || 'Not Specified'}</span>
                                    </div>
                                    <div className="dsr-modal-row">
                                        <strong>Phone</strong>
                                        <span>{selectedDoctor.phone || 'Not Specified'}</span>
                                    </div>
                                    <div className="dsr-modal-row">
                                        <strong>Email</strong>
                                        <span>{selectedDoctor.email || 'Not Specified'}</span>
                                    </div>
                                    <div className="dsr-modal-row">
                                        <strong>Consulting Fee</strong>
                                        <span className="dsr-modal-fee">Rs. {selectedDoctor.consulting_fee}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorSearchResults;
