import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import DoctorNavBar from '../Components/DoctorNavBar';
import './css/doctorAppoinmentViwe.css';

const DoctorAppointmentView = () => {
    const navigate = useNavigate();
    const containerRef = useRef();
    const [appointments, setAppointments] = useState([]);
    const [doctor, setDoctor] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(true);

    useGSAP(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

        tl.fromTo(".page-header",
            { y: -30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8 }
        );

        tl.fromTo(".filter-box",
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6 },
            0.3
        );

        tl.fromTo(".appointments-card",
            { scale: 0.95, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5 },
            0.5
        );
    }, { scope: containerRef, dependencies: [loading] });

    useEffect(() => {
        const doctorInfo = JSON.parse(localStorage.getItem('doctorInfo'));
        const token = localStorage.getItem('token');

        if (!doctorInfo || !token) {
            navigate('/staff-login');
            return;
        }

        setDoctor(doctorInfo);
        fetchAppointments(doctorInfo.id);
    }, [navigate]);

    const fetchAppointments = async (doctorId, start = '', end = '') => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/api/appointments/doctor/${doctorId}`, {
                params: { startDate: start, endDate: end }
            });
            setAppointments(response.data.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching appointments:', error);
            setLoading(false);
        }
    };

    const filterByDate = () => {
        if (doctor) {
            fetchAppointments(doctor.id, startDate, endDate);
        }
    };

    const handleBack = () => {
        navigate('/doctor-availability');
    };

    return (
        <div className="doctor-appointments-page" ref={containerRef}>
            <DoctorNavBar />

            <div className="appointments-container">
                <div className="page-header">
                    <div className="header-info">
                        <button className="btn-back" onClick={handleBack}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                            </svg>
                            Back to Dashboard
                        </button>
                        <h1>Dr. {doctor?.name}</h1>
                        <span className="spec-badge">{doctor?.specialization}</span>
                    </div>
                </div>

                <div className="appointments-card">
                    <div className="card-header">
                        <h2>My Appointments</h2>
                        <div className="filter-box">
                            <div className="input-group">
                                <label htmlFor="startDate">From</label>
                                <input 
                                    type="date" 
                                    id="startDate" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="endDate">To</label>
                                <input 
                                    type="date" 
                                    id="endDate" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                            <button className="btn-filter" onClick={filterByDate}>Apply Filter</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Fetching your appointments...</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="appointments-table">
                                <thead>
                                    <tr>
                                        <th>Patient Name</th>
                                        <th>Schedule Date</th>
                                        <th>Time Slot</th>
                                        <th>Fee</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {appointments.length > 0 ? (
                                        appointments.map((app) => (
                                            <tr key={app.id}>
                                                <td className="patient-cell">
                                                    <div className="patient-avatar">
                                                        {app.patient_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span>{app.patient_name}</span>
                                                </td>
                                                <td>{new Date(app.schedule_date).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}</td>
                                                <td className="time-cell">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14">
                                                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm.5-10H11v5l4.3 2.5.7-1.1-3.5-2.1V10z" />
                                                    </svg>
                                                    {app.start_time.substring(0, 5)} - {app.end_time.substring(0, 5)}
                                                </td>
                                                <td className="price-cell">LKR {Number(app.price).toLocaleString()}</td>
                                                <td>
                                                    <span className={`status-pill status-${app.appointment_status}`}>
                                                        {app.appointment_status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5" className="empty-state">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48">
                                                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z" />
                                                </svg>
                                                <p>No appointments found for the selected criteria.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DoctorAppointmentView;
