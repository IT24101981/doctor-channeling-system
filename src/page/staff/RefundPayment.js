import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../css/CashierDashboard.css';
import LogoHospital from '../../images/LogoHospital.png';
import { formatMediumDateTimeLK } from '../../utils/sriLankaTime';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const authHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('staffToken')}` }
});

const isOlderThan10Years = (dateStr) => {
    if (!dateStr) return false;
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    return new Date(dateStr) < tenYearsAgo;
};

const statusBadgeClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending') return 'pending';
    if (s === 'completed') return 'success';
    if (s === 'rejected') return 'failed';
    return 'refunded';
};

const RefundPayment = () => {
    const navigate = useNavigate();
    const [refunds, setRefunds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    const [modal, setModal] = useState({ open: false, type: '', data: null });
    const [toast, setToast] = useState({ show: false, message: '' });
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const showToast = (msg) => {
        setToast({ show: true, message: msg });
        setTimeout(() => setToast({ show: false, message: '' }), 3000);
    };

    useEffect(() => {
        document.title = 'Refund Requests — NCC eCare';

        const fetchRefunds = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_BASE}/api/refund-requests/all`, authHeaders());
                const data = response.data?.data || [];
                setRefunds(data);
                setError(null);
            } catch (err) {
                console.error('Error fetching refunds:', err);
                setError('Failed to load refund requests. Please check your connection.');
            } finally {
                setLoading(false);
            }
        };

        fetchRefunds();
        return () => {
            document.title = 'Doctor Channeling System';
        };
    }, []);

    const oldRefunds = refunds.filter((r) => isOlderThan10Years(r.requested_at));

    const PAGE_SIZE = 20;
    const totalPages = Math.max(1, Math.ceil(refunds.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageRefunds = refunds.slice(pageStart, pageStart + PAGE_SIZE);
    const showingFrom = refunds.length === 0 ? 0 : pageStart + 1;
    const showingTo = pageStart + pageRefunds.length;

    useEffect(() => {
        if (safePage !== currentPage) setCurrentPage(safePage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safePage]);

    const buildPageItems = () => {
        const pages = [];
        const push = (v) => pages.push(v);
        if (totalPages <= 9) {
            for (let i = 1; i <= totalPages; i += 1) push(i);
            return pages;
        }
        push(1);
        const left = Math.max(2, safePage - 2);
        const right = Math.min(totalPages - 1, safePage + 2);
        if (left > 2) push('…');
        for (let i = left; i <= right; i += 1) push(i);
        if (right < totalPages - 1) push('…');
        push(totalPages);
        return pages;
    };

    const handleDeleteOldRefunds = () => {
        if (oldRefunds.length === 0) {
            showToast('These refunds are less than 10 years old. There are no eligible refunds to delete.');
            return;
        }
        setModal({ open: true, type: 'deleteOldRefunds', data: oldRefunds });
    };

    const confirmDeleteOldRefunds = async () => {
        if (deleteSubmitting || !modal?.data) return;
        try {
            setDeleteSubmitting(true);
            const response = await axios.delete(`${API_BASE}/api/refund-requests/delete-old`, authHeaders());
            setRefunds((prev) => prev.filter((r) => !isOlderThan10Years(r.requested_at)));
            const archived = response.data?.archivedToSheet ? ' Details saved to Google Sheet (Sheet2).' : '';
            showToast(`Deleted ${response.data?.count ?? modal.data.length} old refund request(s).${archived}`);
        } catch (err) {
            console.error('Error deleting old refunds:', err);
            showToast(err?.response?.data?.message || 'Failed to delete old refunds');
        } finally {
            setDeleteSubmitting(false);
            setModal({ open: false, type: '', data: null });
        }
    };

    const closeModal = () => setModal({ open: false, type: '', data: null });

    const handleLogout = () => {
        localStorage.clear();
        navigate('/ecare/staff-login');
    };

    return (
        <div className="cashier-page-wrapper">
            <nav className="cashier-navbar">
                <div className="cashier-navbar-brand">
                    <div className="cashier-logo-icon">
                        <img src={LogoHospital} alt="NCC Logo" />
                    </div>
                    <div className="cashier-brand-text">
                        <span className="brand-name">NCC eCare</span>
                        <span className="brand-tagline">Refund Requests</span>
                    </div>
                </div>

                <div className="cashier-navbar-actions">
                    <div className="cashier-staff-badge">
                        <span className="material-symbols-outlined">badge</span>
                        <span>Staff: <strong>{localStorage.getItem('staffUser') ? 'Cashier/Admin' : 'Staff'}</strong></span>
                    </div>
                    <button className="cashier-nav-btn btn-logout" onClick={handleLogout}>
                        <span className="material-symbols-outlined">logout</span>
                        Logout
                    </button>
                </div>
            </nav>

            <div className="cashier-main-content">
                <div className="cashier-hero">
                    <div className="cashier-hero-content">
                        <h1>Refund Requests</h1>
                        <p>View refund requests and delete only older than 10 years.</p>
                    </div>
                    <div className="bg-circles">
                        <div className="circle circle-1"></div>
                        <div className="circle circle-2"></div>
                    </div>
                </div>

                {loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '13px' }}>
                        Loading refund requests...
                    </div>
                )}

                {error && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#B91C1C', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <div className="cashier-table-section">
                        <h2>Refund Table</h2>

                        <div className="cashier-toolbar">
                            <button
                                className="cashier-toolbar-btn delete-old"
                                onClick={handleDeleteOldRefunds}
                                disabled={deleteSubmitting}
                                title="Deletes only refunds older than 10 years"
                            >
                                <span className="material-symbols-outlined">delete</span>
                                Delete Old (&gt;10 yrs)
                            </button>
                        </div>

                        <div className="cashier-table-meta">
                            <span>
                                Showing <strong>{showingFrom}-{showingTo}</strong> of <strong>{refunds.length}</strong> refund requests
                            </span>
                        </div>

                        <div className="cashier-table-wrapper">
                            {refunds.length > 0 ? (
                                <table className="cashier-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 54 }}>#</th>
                                            <th>Requested</th>
                                            <th>Status</th>
                                            <th>Patient</th>
                                            <th>Doctor</th>
                                            <th>Amount</th>
                                            <th>Appointment</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageRefunds.map((r, idx) => (
                                            <tr key={r.id}>
                                                <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                                                    {pageStart + idx + 1}
                                                </td>
                                                <td style={{ color: '#64748B' }}>
                                                    {r.requested_at ? formatMediumDateTimeLK(r.requested_at) : 'N/A'}
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${statusBadgeClass(r.status)}`}>
                                                        {String(r.status || '').toUpperCase()}
                                                    </span>
                                                    {isOlderThan10Years(r.requested_at) && (
                                                        <span className="sandbox-tag" title="Eligible for delete (>10 years)">OLD</span>
                                                    )}
                                                </td>
                                                <td style={{ fontWeight: 500 }}>{r.patient_name}</td>
                                                <td style={{ color: '#64748B' }}>{r.doctor_name}</td>
                                                <td style={{ fontWeight: 600, color: '#0f172aff' }}>
                                                    LKR {Number(r.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748B' }}>
                                                    {r.appointment_id ?? 'N/A'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="cashier-empty-state">
                                    <span className="material-symbols-outlined">inbox</span>
                                    <h3>No refund requests found</h3>
                                    <p>Try again later.</p>
                                </div>
                            )}
                        </div>

                        {refunds.length > 0 && totalPages > 1 && (
                            <div className="cashier-pagination">
                                <button
                                    type="button"
                                    className="cashier-page-btn nav"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={safePage === 1}
                                    aria-label="Previous page"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
                                </button>

                                {buildPageItems().map((item, idx) => (
                                    item === '…' ? (
                                        <span key={`ellipsis-${idx}`} className="cashier-page-ellipsis">…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            type="button"
                                            className={`cashier-page-btn ${item === safePage ? 'active' : ''}`}
                                            onClick={() => setCurrentPage(Number(item))}
                                        >
                                            {item}
                                        </button>
                                    )
                                ))}

                                <button
                                    type="button"
                                    className="cashier-page-btn nav"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={safePage === totalPages}
                                    aria-label="Next page"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {modal.open && (
                <div className="cashier-modal-overlay" onClick={closeModal}>
                    <div className="cashier-modal" onClick={(e) => e.stopPropagation()}>
                        {modal.type === 'deleteOldRefunds' && (
                            <>
                                <h3>Delete Old Refund Requests</h3>
                                <p>
                                    This will permanently delete <strong>{modal.data.length}</strong> refund request(s) requested more than 10 years ago. This action cannot be undone.
                                </p>
                                <div className="modal-actions">
                                    <button className="modal-btn cancel" onClick={closeModal} disabled={deleteSubmitting}>
                                        Cancel
                                    </button>
                                    <button
                                        className="modal-btn confirm-danger"
                                        onClick={confirmDeleteOldRefunds}
                                        disabled={deleteSubmitting}
                                    >
                                        {deleteSubmitting ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {toast.show && <div className="cashier-toast">{toast.message}</div>}
        </div>
    );
};

export default RefundPayment;

