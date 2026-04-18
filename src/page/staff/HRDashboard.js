import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/StaffDashboard.css';

const HRDashboard = () => {
    const navigate = useNavigate();
    const [staffName, setStaffName] = React.useState('HR Manager');

    React.useEffect(() => {
        const storedStaff = localStorage.getItem('staffUser');
        if (storedStaff) {
            const staffData = JSON.parse(storedStaff);
            const first = staffData.firstName || "";
            const last = staffData.lastName || "";
            const name = staffData.name || `${first} ${last}`.trim() || staffData.username || 'HR Manager';
            setStaffName(name);
        }
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/ecare/staff-login');
    };

    return (
        <div className="staff-dashboard">
            <header className="dashboard-header">
                <h1>
                    <span>👥</span> HR Portal
                </h1>
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </header>

            <main className="dashboard-content">
                <div className="dashboard-welcome-card">
                    <h2>Welcome, {staffName}</h2>
                    <p>Manage employee records, attendance, and recruitment.</p>
                </div>

                                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <h3>Employee Directory</h3>
                        <p>View all staff members</p>
                    </div>
                    <div className="dashboard-card" onClick={() => navigate('/ecare/staff/HRCustomerSupport')} style={{ cursor: 'pointer' }}>
                        <h3>Customer Support</h3>
                        <p>Manage support tickets and patient inquiries</p>
                    </div>
                    <div className="dashboard-card">
                        <h3>Attendance</h3>
                        <p>Track employee attendance</p>
                    </div>
                    <div className="dashboard-card">
                        <h3>Leave Requests</h3>
                        <p>Approve or reject leaves</p>
                    </div>
                    <div 
                        className="dashboard-card" 
                        onClick={() => navigate('/ecare/staff/hr/customer-support')}
                        style={{ cursor: 'pointer', borderLeft: '4px solid #9C27B0' }}
                    >
                        <h3>Customer Support</h3>
                        <p>Manage patient support tickets</p>
                    </div>
                </div>

            </main>
        </div>
    );
};

export default HRDashboard;
