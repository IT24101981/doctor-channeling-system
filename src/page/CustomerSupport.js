import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ECareNavBar from '../Components/eCareNavBar';
import { formatMediumDateLK } from '../utils/sriLankaTime';
import './css/CustomerSupport.css';
import { API_BASE_URL } from '../config';

const API_URL = API_BASE_URL;

const CustomerSupport = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [ticketCategory, setTicketCategory] = useState('');
    const [ticketDescription, setTicketDescription] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [creating, setCreating] = useState(false);
    const [notification, setNotification] = useState(null);

    const categories = [
        "Appointments",
        "Medical reports",
        "Technical Issues",
        "Payments and Billing",
        "General Assistance"
    ];

    // Show notification
    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    // Authentication
    useEffect(() => {
        const storedPatient = localStorage.getItem('user');
        if (storedPatient) {
            const patientData = JSON.parse(storedPatient);
            setUser(patientData);
        } else {
            showNotification('Please register or login to use customer support', 'error');
            setTimeout(() => navigate('/signup'), 2000);
        }
    }, [navigate, showNotification]);

    // Fetch patient's tickets
    const fetchTickets = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/support/tickets/patient/${user.id}`);
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
    }, [user, showNotification]);

    useEffect(() => {
        fetchTickets();
        if (user) {
            fetch(`${API_URL}/api/support/tickets/patient/${user.id}/seen`, { method: 'PUT' })
                .catch(err => console.error('Failed to mark tickets as seen', err));
        }
    }, [fetchTickets, user]);

    // Name logic fix
    const getFullName = (userData) => {
        if (!userData) return "User";
        if (userData.name) return userData.name;
        const first = userData.first_name || userData.firstName || "";
        const last = userData.second_name || userData.lastName || "";
        const full = `${first} ${last}`.trim();
        return full || userData.username || "User";
    };

    const displayName = useMemo(() => getFullName(user), [user]);

    // Ticket Summary
    const summary = useMemo(() => {
        const solved = tickets.filter(t => t.status === 'Resolved').length;
        const pending = tickets.filter(t => t.status === 'Pending').length;
        const raised = tickets.length;
        return { solved, pending, raised };
    }, [tickets]);

    // Create ticket
    const handleCreateTicket = async (e) => {
        e.preventDefault();
        if (!ticketCategory || !ticketDescription.trim()) {
            showNotification('Category and description are required', 'error');
            return;
        }

        if (ticketDescription.trim().length < 10) {
            showNotification('Description must be at least 10 characters long', 'error');
            return;
        }

        // Prevent duplication of the same ticket within 10 minutes
        if (tickets.length > 0) {
            const lastTicket = tickets[0];
            if (lastTicket.subject === ticketCategory && lastTicket.description === ticketDescription) {
                const lastTime = new Date(lastTicket.created_at).getTime();
                const now = new Date().getTime();
                if ((now - lastTime) < 10 * 60 * 1000) {
                    showNotification('You cannot submit the exact same ticket within 10 minutes', 'error');
                    return;
                }
            }
        }

        setCreating(true);
        try {
            const formData = new FormData();
            formData.append('patientId', user.id);
            formData.append('patientName', displayName);
            formData.append('patientEmail', user.email);
            formData.append('subject', ticketCategory);
            formData.append('description', ticketDescription);
            if (attachment) {
                formData.append('attachment', attachment);
            }

            const response = await fetch(`${API_URL}/api/support/tickets`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Ticket raised successfully.');
                setShowCreateModal(false);
                setTicketCategory('');
                setTicketDescription('');
                setAttachment(null);
                fetchTickets();
            } else {
                showNotification(data.message || 'Ticket creation failed.', 'error');
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            showNotification('Check your connection and try again.', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTicket = async (ticketId) => {
        if (!window.confirm('Are you sure you want to delete this ticket?')) return;
        try {
            const response = await fetch(`${API_URL}/api/support/tickets/${ticketId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ patientId: user?.id }),
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

    const formatDate = (dateString) => formatMediumDateLK(dateString);

    if (!user) return <div className="cs-page"><div className="cs-loading">Authenticating...</div></div>;

    return (
        <div className="cs-page">
            <ECareNavBar />
            {notification && (
                <div className={`cs-notification ${notification.type}`}>
                    <span>{notification.message}</span>
                </div>
            )}
            <main className="cs-main">
                <div className="cs-topic-header">
                    <h2>NCC eCare Customer Support</h2>
                </div>

                <div className="cs-user-card">
                    <div className="cs-user-info">
                        <div className="cs-user-avatar">
                            <span className="material-symbols-outlined" style={{ color: 'white', fontSize: '32px' }}>account_circle</span>
                        </div>
                        <div className="cs-user-details">
                            <span className="cs-user-label">Logged in as</span>
                            <h3 className="cs-user-name">{displayName}</h3>
                            <span className="cs-user-badge">Registered Patient</span>
                        </div>
                    </div>
                    <button className="cs-create-btn" onClick={() => setShowCreateModal(true)}>
                        <span className="material-symbols-outlined">add</span>
                        Create Ticket
                    </button>
                </div>

                <div className="cs-summary-container">
                    <div className="cs-summary-card cs-summary-raised">
                        <h4>Raised Tickets</h4>
                        <span className="cs-summary-value">{summary.raised}</span>
                    </div>
                    <div className="cs-summary-card cs-summary-pending">
                        <h4>Pending Tickets</h4>
                        <span className="cs-summary-value">{summary.pending}</span>
                    </div>
                    <div className="cs-summary-card cs-summary-solved">
                        <h4>Solved Tickets</h4>
                        <span className="cs-summary-value">{summary.solved}</span>
                    </div>
                </div>

                <div className="cs-topic-header" style={{ borderBottom: 'none' }}>
                    <h2>MySupport Tickets</h2>
                </div>

                <div className="cs-tickets-list">
                    {loading ? (
                        <div className="cs-loading"><div className="cs-spinner"></div></div>
                    ) : tickets.length === 0 ? (
                        <div className="cs-empty"><p>No tickets found</p></div>
                    ) : (
                        tickets.map((ticket) => (
                            <div className="cs-ticket-item cs-ticket-part" key={ticket.id} style={{ background: 'white', marginBottom: '15px', borderRadius: '12px', border: '1px solid #eee' }}>
                                <div className="cs-ticket-content">
                                    <h3 className="cs-ticket-title">{ticket.subject}</h3>
                                    <p className="cs-ticket-desc">{ticket.description}</p>
                                    {ticket.hr_reply && (ticket.status === 'Resolved' || ticket.status === 'Rejected') && (
                                        <div className="cs-ticket-reply" style={{ marginTop: '10px', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                                            <h4 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#333' }}>{ticket.status === 'Resolved' ? 'Solution' : 'Reason for Rejection'}:</h4>
                                            <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>{ticket.hr_reply}</p>
                                        </div>
                                    )}
                                    <div className="cs-ticket-meta" style={{ marginTop: '10px' }}>
                                        <span className="cs-ticket-meta-item">{ticket.patient_name}</span>
                                        <span className="cs-ticket-meta-item">{formatDate(ticket.created_at)}</span>
                                        {ticket.attachment_path && (
                                            <a href={`${API_URL}/${ticket.attachment_path}`} target="_blank" rel="noopener noreferrer" className="cs-ticket-meta-item" style={{ color: '#2563EB', textDecoration: 'none' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>attach_file</span> View Attachment
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="cs-ticket-actions">
                                    <span className={`cs-status-badge ${ticket.status === 'Resolved' ? 'cs-status-resolved' : ticket.status === 'Rejected' ? 'cs-status-deleted' : 'cs-status-pending'}`}>
                                        {ticket.status}
                                    </span>
                                    {ticket.status === 'Pending' && (
                                        <button className="cs-delete-btn" onClick={() => handleDeleteTicket(ticket.id)}>
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {showCreateModal && (
                <div className="cs-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cs-modal-header">
                            <h2>Create Support Ticket</h2>
                            <button className="cs-modal-close" onClick={() => setShowCreateModal(false)}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form className="cs-modal-body" onSubmit={handleCreateTicket}>
                            <div className="cs-form-group">
                                <label>Category <span className="cs-required">*</span></label>
                                <select 
                                    value={ticketCategory} 
                                    onChange={(e) => setTicketCategory(e.target.value)} 
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        border: '1.5px solid #e2e8f0',
                                        borderRadius: '12px',
                                        fontSize: '14px',
                                        backgroundColor: '#fafbfd'
                                    }}
                                >
                                    <option value="" disabled>Select a category</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="cs-form-group">
                                <label>Description <span className="cs-required">*</span></label>
                                <textarea value={ticketDescription} onChange={(e) => setTicketDescription(e.target.value)} rows={6} required />
                            </div>
                            <div className="cs-form-group">
                                <label>
                                    Attachment 
                                    <span style={{fontSize: '12px', color: '#64748b', fontWeight: 'normal', marginLeft: '6px'}}>
                                        (pdf, jpg, jpeg or png, Max 5MB)
                                    </span>
                                </label>
                                <input 
                                    type="file" 
                                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (!file) {
                                            setAttachment(null);
                                            return;
                                        }
                                        
                                        // Validate file type
                                        const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
                                        // Check extension fallback for generic types
                                        const ext = file.name.split('.').pop().toLowerCase();
                                        const validExts = ['pdf', 'jpg', 'jpeg', 'png'];
                                        
                                        if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
                                            showNotification('Invalid file type', 'error');
                                            e.target.value = '';
                                            setAttachment(null);
                                            return;
                                        }

                                        // Validate file size
                                        if (file.size > 5 * 1024 * 1024) {
                                            showNotification('Your file must be less than 5 MB', 'error');
                                            e.target.value = '';
                                            setAttachment(null);
                                            return;
                                        }

                                        setAttachment(file);
                                    }}
                                    style={{ padding: '8px', cursor: 'pointer' }}
                                />
                            </div>
                            <p className="cs-modal-promise">Your problem will be solved within two working days</p>
                            <div className="cs-modal-footer">
                                <button type="button" className="cs-btn-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="cs-btn-submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerSupport;
