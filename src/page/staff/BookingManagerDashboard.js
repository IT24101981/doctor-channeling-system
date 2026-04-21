import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/StaffDashboard.css';
import ECareNavBar from '../../Components/eCareNavBar';

const BookingManagerDashboard = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.clear();
        navigate('/ecare/staff-login');
    };

    return (
        <div className="staff-dashboard" style={{ backgroundColor: '#cedee7' }}>
            <ECareNavBar />

            <main className="dashboard-content">
                <div className="dashboard-welcome-card" style={{ background: 'linear-gradient(135deg, #022b61ff 0%, #a4ccffff 100%)' }}>
                    <h2>Welcome, Booking Manager Schedules 🏷️</h2>
                    <p>Oversee doctor schedules and patient appointments</p>
                </div>

                <div className="dashboard-grid">
                    <div className="dashboard-card" onClick={() => navigate('/schedules/manage')} style={{ cursor: 'pointer' }}>
                        <h3>📅 Manage Schedules</h3>
                        <p>View and edit bookings</p>
                    </div>
                    <div className="dashboard-card" onClick={() => navigate('/schedules/create')} style={{ cursor: 'pointer' }}>
                        <h3>➕  Create Schedules</h3>
                        <p>Create new doctor schedules</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BookingManagerDashboard;
