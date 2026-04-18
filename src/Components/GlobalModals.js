import React, { useState, useEffect } from 'react';
import Profile from './Profile';
import AppointmentHistory from './AppointmentHistory';

const GlobalModals = () => {
    const [showProfile, setShowProfile] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [patientUser, setPatientUser] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setPatientUser(JSON.parse(storedUser));
        }

        const handleOpenProfile = () => {
            const user = localStorage.getItem('user');
            if (user) setPatientUser(JSON.parse(user));
            setShowProfile(true);
        };
        
        const handleOpenHistory = () => {
            const user = localStorage.getItem('user');
            if (user) setPatientUser(JSON.parse(user));
            setShowHistory(true);
        };
        
        // Listener for local storage changes (login/logout)
        const handleStorageChange = () => {
            const user = localStorage.getItem('user');
            setPatientUser(user ? JSON.parse(user) : null);
        };

        window.addEventListener('openPatientProfile', handleOpenProfile);
        window.addEventListener('openAppointmentHistory', handleOpenHistory);
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('profileUpdated', handleStorageChange);

        // Also define global functions for backward compatibility if needed
        window.showPatientProfile = handleOpenProfile;
        window.showAppointmentHistory = handleOpenHistory;

        return () => {
            window.removeEventListener('openPatientProfile', handleOpenProfile);
            window.removeEventListener('openAppointmentHistory', handleOpenHistory);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('profileUpdated', handleStorageChange);
        };
    }, []);

    return (
        <>
            {showProfile && patientUser && (
                <Profile
                    patientId={patientUser.id}
                    onClose={() => setShowProfile(false)}
                    onUpdate={(updatedValue) => {
                        if (updatedValue) setPatientUser(updatedValue);
                    }}
                />
            )}
            {showHistory && patientUser && (
                <AppointmentHistory
                    patientId={patientUser.id}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </>
    );
};

export default GlobalModals;
