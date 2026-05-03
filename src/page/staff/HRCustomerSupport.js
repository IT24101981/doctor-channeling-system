import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoHospital from '../../images/LogoHospital.png';
import { formatMediumDateLK } from '../../utils/sriLankaTime';
import '../css/CustomerSupport.css';
import '../css/CashierDashboard.css';
import { API_BASE_URL } from '../../config';

const API_URL = API_BASE_URL;

const HRCustomerSupport = () => {
    const navigate = useNavigate();
    const [user] = useState(() => {
        const storedUser = localStorage.getItem('staffUser') || localStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [notification, setNotification] = useState(null);
    const [replyModal, setReplyModal] = useState({ show: false, ticketId: null, action: null });
    const [replyText, setReplyText] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordErrors, setPasswordErrors] = useState({});
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const categories = useMemo(() => [
        "Appointments",
        "Medical reports",
        "Technical Issues",
        "Payments and Billing",
        "General Assistance"
    ], []);

    const getPriority = (description) => {
        const desc = description.toLowerCase();
        
        const criticalKeywords = ["severe symptoms", "chest pain", "breathing issues", "outage", "down", "no one can book", "data breach", "privacy", "someone else's info", "total payment failure", "unpaid"];
        if (criticalKeywords.some(key => desc.includes(key))) return { label: "Critical (P1)", level: "Critical" };

        const highKeywords = ["medical report explainer error", "nonsensical", "account lockout", "cannot log in", "prescription", "view prescription", "duplicate charging", "charged twice"];
        if (highKeywords.some(key => desc.includes(key))) return { label: "High (P2)", level: "High" };

        const mediumKeywords = ["rescheduling", "move appointment", "clarification", "contact details", "upload issue", "attach pdf", "availability", "from leave"];
        if (mediumKeywords.some(key => desc.includes(key))) return { label: "Medium (P3)", level: "Medium" };

        const lowKeywords = ["feedback", "suggest feature", "insurance", "profile update", "phone number", "email address", "how-to", "profile picture"];
        if (lowKeywords.some(key => desc.includes(key))) return { label: "Low (P4)", level: "Low" };

        return { label: "Medium (P3)", level: "Medium" };
    };

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/support/tickets/all`);
            const data = await response.json();
            if (response.ok) {
                setTickets(data.tickets || []);
            } else {
                showNotification(data.message || 'Failed to fetch tickets', 'error');
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
            showNotification('Check your connection and try again.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showNotification]);

    useEffect(() => {
        if (user) fetchTickets();
    }, [user, fetchTickets]);

    const getFullName = (userData) => {
        if (!userData) return "Staff Member";
        if (userData.name) return userData.name;
        const first = userData.firstName || "";
        const last = userData.lastName || "";
        const full = `${first} ${last}`.trim();
        return full || userData.username || "Staff Member";
    };

    const displayName = useMemo(() => getFullName(user), [user]);

    const summary = useMemo(() => {
        const solved = tickets.filter(t => t.status === 'Resolved').length;
        const pending = tickets.filter(t => t.status === 'Pending').length;
        const raised = tickets.length;
        const deletedCount = tickets.filter(t => t.is_deleted).length;
        return { solved, pending, raised, deleted: deletedCount };
    }, [tickets]);

    const filteredTickets = useMemo(() => {
        let filtered = tickets.filter(t => t.status === statusFilter);
        if (categoryFilter !== 'All') {
            filtered = filtered.filter(t => t.subject === categoryFilter);
        }
        return filtered;
    }, [tickets, statusFilter, categoryFilter]);

    const categoryCounts = useMemo(() => {
        const counts = { All: tickets.filter(t => t.status === statusFilter).length };
        categories.forEach(cat => {
            counts[cat] = tickets.filter(t => t.status === statusFilter && t.subject === cat).length;
        });
        return counts;
    }, [tickets, statusFilter, categories]);

    const handleDeleteTicket = async (ticketId) => {
        if (!window.confirm('Are you sure you want to delete this ticket? (Soft Delete)')) return;
        try {
            const response = await fetch(`${API_URL}/api/support/tickets/${ticketId}/soft-delete`, {
                method: 'PUT',
            });
            if (response.ok) {
                showNotification('Ticket deleted successfully!');
                fetchTickets();
            } else {
                const data = await response.json();
                showNotification(data.message || 'Failed to delete ticket', 'error');
            }
        } catch (error) {
            showNotification('Check your connection and try again.', 'error');
        }
    };

    const submitStatusUpdate = async () => {
        const { ticketId, action } = replyModal;
        
        const ticket = tickets.find(t => t.id === ticketId);
        if (ticket && ticket.status !== 'Pending' && ticket.status !== 'In Progress') {
            showNotification(`already ${ticket.status.toLowerCase()}`, 'error');
            setReplyModal({ show: false, ticketId: null, action: null });
            return;
        }
        if (!replyText.trim() && action === 'Rejected') {
            showNotification('Please provide a reason for rejection', 'error');
            return;
        }
        if (!replyText.trim() && action === 'Resolved') {
            showNotification('Please provide a solution', 'error');
            return;
        }
        if (replyText.trim().length < 10 && (action === 'Resolved' || action === 'Rejected')) {
            showNotification('Reply must be at least 10 characters long', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/support/tickets/${ticketId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: action, hr_reply: replyText }),
            });
            if (response.ok) {
                showNotification(`Ticket updated to ${action}!`);
                setReplyModal({ show: false, ticketId: null, action: null });
                setReplyText('');
                fetchTickets();
            } else {
                const data = await response.json();
                showNotification(data.message || 'Failed to update status', 'error');
            }
        } catch (error) {
            showNotification('Check your connection and try again.', 'error');
        }
    };

    const handleUpdateStatus = (ticketId, newStatus) => {
        setReplyModal({ show: true, ticketId, action: newStatus });
        setReplyText('');
    };

    const formatDate = (dateString) => formatMediumDateLK(dateString);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/ecare/staff-login');
    };

    const handlePasswordModalClose = () => {
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
        setPasswordErrors({});
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    };

    const pwdRules = {
        length: newPassword.length >= 6,
        lowercase: /[a-z]/.test(newPassword),
        uppercase: /[A-Z]/.test(newPassword),
        symbol: /[^a-zA-Z0-9]/.test(newPassword),
    };
    const pwdValid = Object.values(pwdRules).every(Boolean);

    const handleChangePasswordSave = async () => {
        const errs = {};
        if (!pwdValid) errs.newPassword = 'Password does not meet all requirements.';
        if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
        if (Object.keys(errs).length > 0) {
            setPasswordErrors(errs);
            return;
        }

        setPasswordErrors({});
        try {
            const storedUser = JSON.parse(localStorage.getItem('staffUser') || '{}');
            const username = storedUser.username;
            if (!username) {
                showNotification('Session expired. Please log in again.', 'error');
                return;
            }

            const response = await fetch(`${API_URL}/api/auth/staff/change-password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, newPassword }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const msg = data?.message || 'Failed to change password. Please try again.';
                setPasswordErrors({ newPassword: msg });
                return;
            }

            handlePasswordModalClose();
            showNotification('Password changed successfully!');
        } catch (error) {
            console.error('Change password error:', error);
            setPasswordErrors({ newPassword: 'Failed to change password. Please try again.' });
        }
    };

    return (
        <div className="cs-page">
            <nav className="cashier-navbar">
                <div className="cashier-navbar-brand">
                    <div className="cashier-logo-icon">
                        <img src={LogoHospital} alt="NCC Logo" />
                    </div>
                    <div className="cashier-brand-text">
                        <span className="brand-name">NCC eCare</span>
                        <span className="brand-tagline">HR Portal</span>
                    </div>
                </div>

                <div className="cashier-navbar-actions">
                    <div className="cashier-staff-badge">
                        <span className="material-symbols-outlined">badge</span>
                        <span>Role: <strong>HR</strong></span>
                    </div>

                    <button
                        onClick={() => setShowPasswordModal(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#1E3A5F',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            transition: 'background-color 0.2s ease'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#162E4A'; }}
                        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#1E3A5F'; }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>lock</span>
                        Change Password
                    </button>

                    <button className="cashier-nav-btn btn-logout" onClick={handleLogout}>
                        <span className="material-symbols-outlined">logout</span>
                        Logout
                    </button>
                </div>
            </nav>
            {notification && (
                <div className={`cs-notification ${notification.type}`}>
                    <span>{notification.message}</span>
                </div>
            )}
            <main className="cs-main">
                <div className="cs-topic-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>NCC eCare Customer Support (HR)</h2>
                    {user && user.role === 'HR' && (
                        <button 
                            onClick={() => window.history.back()} 
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                background: 'white',
                                color: '#1E3A5F',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
                            Back to Dashboard
                        </button>
                    )}
                </div>

                <div className="cs-user-card cs-user-card-hr">
                    <div className="cs-user-info">
                        <div className="cs-user-avatar cs-avatar-hr">
                            <span className="material-symbols-outlined" style={{ color: 'white', fontSize: '32px' }}>account_circle</span>
                        </div>
                        <div className="cs-user-details">
                            <span className="cs-user-label">Logged in as</span>
                            <h3 className="cs-user-name">{displayName}</h3>
                            <span className="cs-user-badge cs-badge-hr">HR Staff Member</span>
                        </div>
                    </div>
                </div>

                <div className="cs-summary-container">
                    <div className="cs-summary-card cs-summary-raised">
                        <h4>Total Raised</h4>
                        <span className="cs-summary-value">{summary.raised}</span>
                    </div>
                    <div className="cs-summary-card cs-summary-pending">
                        <h4>Awaiting Attention</h4>
                        <span className="cs-summary-value">{summary.pending}</span>
                    </div>
                    <div className="cs-summary-card cs-summary-solved">
                        <h4>Approved/Solved</h4>
                        <span className="cs-summary-value">{summary.solved}</span>
                    </div>
                    <div className="cs-summary-card cs-summary-deleted">
                        <h4>Deleted</h4>
                        <span className="cs-summary-value">{summary.deleted}</span>
                    </div>
                </div>

                <div className="cs-hr-filters">
                    <button className={`cs-filter-btn ${statusFilter === 'Pending' ? 'active' : ''}`} onClick={() => { setStatusFilter('Pending'); setCategoryFilter('All'); }}>Pending</button>
                    <button className={`cs-filter-btn ${statusFilter === 'Rejected' ? 'active' : ''}`} onClick={() => { setStatusFilter('Rejected'); setCategoryFilter('All'); }}>Rejected</button>
                    <button className={`cs-filter-btn ${statusFilter === 'Resolved' ? 'active' : ''}`} onClick={() => { setStatusFilter('Resolved'); setCategoryFilter('All'); }}>Resolved</button>
                </div>

                <div className="cs-category-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
                    <button 
                        className={`cs-cat-tab ${categoryFilter === 'All' ? 'active' : ''}`}
                        onClick={() => setCategoryFilter('All')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: '1px solid #E2E8F0',
                            background: categoryFilter === 'All' ? '#1E3A5F' : 'white',
                            color: categoryFilter === 'All' ? 'white' : '#64748b',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        All ({categoryCounts.All})
                    </button>
                    {categories.map(cat => (
                        <button 
                            key={cat}
                            className={`cs-cat-tab ${categoryFilter === cat ? 'active' : ''}`}
                            onClick={() => setCategoryFilter(cat)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '20px',
                                border: '1px solid #E2E8F0',
                                background: categoryFilter === cat ? '#1E3A5F' : 'white',
                                color: categoryFilter === cat ? 'white' : '#64748b',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            {cat} ({categoryCounts[cat]})
                        </button>
                    ))}
                </div>

                <div className="cs-topic-header" style={{ borderBottom: 'none' }}>
                    <h2>{statusFilter} Tickets</h2>
                </div>

                <div className="cs-tickets-list">
                    {loading ? (
                        <div className="cs-loading"><div className="cs-spinner"></div></div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="cs-empty"><p>No {statusFilter.toLowerCase()} tickets found</p></div>
                    ) : (
                        filteredTickets.map((ticket) => (
                            <div className="cs-ticket-item cs-ticket-part" key={ticket.id} style={{ background: 'white', marginBottom: '15px', borderRadius: '12px', border: '1px solid #eee' }}>
                                <div className="cs-ticket-content">
                                    <h3 className="cs-ticket-title">{ticket.subject}</h3>
                                    <p className="cs-ticket-desc">{ticket.description}</p>
                                    <div className="cs-ticket-meta">
                                        <span className="cs-ticket-meta-item">Patient: {ticket.patient_name}</span>
                                        <span className="cs-ticket-meta-item">{formatDate(ticket.created_at)}</span>
                                        {ticket.attachment_path && (
                                            <a href={`${API_URL}/${ticket.attachment_path}`} target="_blank" rel="noopener noreferrer" className="cs-ticket-meta-item" style={{ color: '#2563EB', textDecoration: 'none' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>attach_file</span> View Attachment
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="cs-ticket-actions">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                        {(() => {
                                            const priority = getPriority(ticket.description);
                                            return (
                                                <span className={`cs-priority-badge cs-priority-${priority.level.toLowerCase()}`}>
                                                    {priority.label}
                                                </span>
                                            );
                                        })()}
                                        <span className={`cs-status-badge ${ticket.status === 'Resolved' ? 'cs-status-resolved' : ticket.status === 'Rejected' ? 'cs-status-deleted' : 'cs-status-pending'}`}>
                                            {ticket.status}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {ticket.status === 'Pending' && (
                                            <>
                                                <button className="cs-delete-btn" onClick={() => handleUpdateStatus(ticket.id, 'Resolved')} title="Resolve" style={{ color: '#1E3A5F' }}>
                                                    <span className="material-symbols-outlined">check_circle</span>
                                                </button>
                                                <button className="cs-delete-btn" onClick={() => handleUpdateStatus(ticket.id, 'Rejected')} title="Reject" style={{ color: '#475569' }}>
                                                    <span className="material-symbols-outlined">cancel</span>
                                                </button>
                                            </>
                                        )}
                                        <button className="cs-delete-btn" onClick={() => handleDeleteTicket(ticket.id)} title="Delete">
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {replyModal.show && (
                <div className="cs-modal-overlay" onClick={() => setReplyModal({ show: false, ticketId: null, action: null })}>
                    <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cs-modal-header">
                            <h2>{replyModal.action === 'Resolved' ? 'Provide Solution' : 'Reason for Rejection'}</h2>
                            <button className="cs-modal-close" onClick={() => setReplyModal({ show: false, ticketId: null, action: null })}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="cs-modal-body">
                            <div className="cs-form-group">
                                <label>{replyModal.action === 'Resolved' ? 'Solution' : 'Reason'}</label>
                                <textarea 
                                    value={replyText} 
                                    onChange={(e) => setReplyText(e.target.value)} 
                                    rows={6} 
                                    required 
                                    placeholder={`Enter your ${replyModal.action === 'Resolved' ? 'solution' : 'reason'} here...`}
                                />
                            </div>
                            <div className="cs-modal-footer">
                                <button type="button" className="cs-btn-cancel" onClick={() => setReplyModal({ show: false, ticketId: null, action: null })}>Cancel</button>
                                <button type="button" className="cs-btn-submit" onClick={submitStatusUpdate}>Submit & {replyModal.action}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPasswordModal && (
                <div className="cashier-modal-overlay" onClick={handlePasswordModalClose}>
                    <div className="cashier-modal" onClick={e => e.stopPropagation()} style={{ minWidth: '380px', maxWidth: '460px' }}>
                        <h3 style={{ marginTop: 0, color: '#1E3A5F' }}>Change Password</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    style={{
                                        width: '100%',
                                        padding: '10px 40px 10px 12px',
                                        borderRadius: '8px',
                                        border: passwordErrors.newPassword ? '1px solid #dc3545' : '1px solid #d1d5db',
                                        outline: 'none',
                                        fontSize: '0.95rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: '#1E3A5F',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        fontWeight: '700'
                                    }}
                                >
                                    {showNewPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            {passwordErrors.newPassword && <p style={{ color: '#dc3545', fontSize: '12px', margin: '4px 0 0 2px' }}>{passwordErrors.newPassword}</p>}

                            {newPassword.length > 0 && (
                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {[
                                        { key: 'length', label: 'At least 6 characters' },
                                        { key: 'uppercase', label: 'At least one uppercase letter (A-Z)' },
                                        { key: 'lowercase', label: 'At least one lowercase letter (a-z)' },
                                        { key: 'symbol', label: 'At least one symbol (!@#$...)' },
                                    ].map(({ key, label }) => (
                                        <div
                                            key={key}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '7px',
                                                fontSize: '12px',
                                                color: pwdRules[key] ? '#16a34a' : '#6b7280'
                                            }}
                                        >
                                            <span style={{ fontSize: '14px' }}>{pwdRules[key] ? '✅' : '⬜'}</span>
                                            {label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>Confirm Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    style={{
                                        width: '100%',
                                        padding: '10px 40px 10px 12px',
                                        borderRadius: '8px',
                                        border: passwordErrors.confirmPassword ? '1px solid #dc3545' : '1px solid #d1d5db',
                                        outline: 'none',
                                        fontSize: '0.95rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: '#1E3A5F',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        fontWeight: '700'
                                    }}
                                >
                                    {showConfirmPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            {passwordErrors.confirmPassword && <p style={{ color: '#dc3545', fontSize: '12px', margin: '4px 0 0 2px' }}>{passwordErrors.confirmPassword}</p>}
                        </div>

                        <div className="modal-actions">
                            <button className="modal-btn cancel" onClick={handlePasswordModalClose}>Cancel</button>
                            <button className="modal-btn confirm-primary" onClick={handleChangePasswordSave}>Save Password</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRCustomerSupport;
