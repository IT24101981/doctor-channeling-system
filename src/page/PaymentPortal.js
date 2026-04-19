import { useEffect, useState } from 'react';
import './css/paymentPortal.css';
import axios from 'axios';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import ECareNavBar from '../Components/eCareNavBar';
import LogoHospital from '../images/LogoHospital.png';
import { formatScheduleDateLK, formatWallTime12 } from '../utils/sriLankaTime';


const PAYMENT_CONTEXT_KEY = 'paymentContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/** Public backend base (ngrok → port 5000). PayHere calls this host — not localhost. */
const NGROK_PUBLIC_BASE = (
    process.env.REACT_APP_NGROK_BASE || 'https://unboldly-nonpantheistic-dwight.ngrok-free.dev'
).replace(/\/$/, '');

/** Full notify URL; override entirely with REACT_APP_PAYHERE_NOTIFY_URL if needed. */
const PAYHERE_NOTIFY_URL =
    process.env.REACT_APP_PAYHERE_NOTIFY_URL || `${NGROK_PUBLIC_BASE}/api/payment/notify`;

/** PayHere sometimes passes a string; guard against objects / whitespace. */
const resolvePayHereOrderId = (raw) => {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'object' && raw.order_id != null) return String(raw.order_id).trim();
    return String(raw).trim();
};

const TERMINAL_PAYMENT_FAIL = ['FAILED', 'CANCELED', 'CHARGEDBACK', 'DUPLICATE'];

//load until payhere notify has written real status
async function pollPaymentUntilResolved(orderId) {
    for (let i = 0; i < 28; i++) {
        try {
            const { data } = await axios.get(
                `${API_BASE}/api/payment/status/${encodeURIComponent(orderId)}`
            );
            const st = String(data.status ?? '').toUpperCase();
            if (st === 'SUCCESS') {
                return {
                    ok: true,
                    appointment_id: data.appointment_id != null ? Number(data.appointment_id) : null
                };
            }
            if (TERMINAL_PAYMENT_FAIL.includes(st)) {
                return { ok: false, status: data.status };
            }
        } catch {
            /* retry */
        }
        await new Promise((r) => setTimeout(r, i < 10 ? 500 : 1200));
    }
    return { ok: false, status: 'TIMEOUT' };
}

const readStoredPaymentContext = () => {
    try {
        const raw = sessionStorage.getItem(PAYMENT_CONTEXT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

function readScheduleIdFromPendingSession() {
    try {
        const raw = sessionStorage.getItem('pending_appointment');
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (p.schedule_id == null) return null;
        return String(p.schedule_id);
    } catch {
        return null;
    }
}

function readScheduleIdFromPayHereCtx() {
    try {
        const raw = sessionStorage.getItem('payhere_order_ctx');
        if (!raw) return null;
        const c = JSON.parse(raw);
        const sid = c.pending_appointment?.schedule_id;
        if (sid == null) return null;
        return String(sid);
    } catch {
        return null;
    }
}

/** MySQL / JSON may return number, bigint, or string — normalize for UI. */
function displayScalar(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'bigint') return val.toString();
    const n = Number(val);
    if (Number.isFinite(n) && String(val).trim() !== '') return String(n);
    return String(val);
}

/** Queue no. as 01, 02, … (matches booking page). */
function formatBookingQueueNo(val) {
    if (val == null || val === '') return null;
    const n = Number(typeof val === 'bigint' ? val.toString() : val);
    if (!Number.isFinite(n) || n < 1) return displayScalar(val);
    return String(Math.floor(n)).padStart(2, '0');
}

const PaymentPortal = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Get patientId from the 'user' object in localStorage
    const storedUser = localStorage.getItem('user');
    let user = null;
    let patientId = null;
    try {
        user = storedUser ? JSON.parse(storedUser) : null;
        patientId = user ? user.id : null;
    } catch {
        /* invalid stored user */
    }

    const scheduleFromUrl = searchParams.get('appointment_schedule_id');
    const appointmentFromUrl = searchParams.get('appointment_id');
    const storedCtx = readStoredPaymentContext();

    const appointmentScheduleId =
        scheduleFromUrl ||
        readScheduleIdFromPendingSession() ||
        readScheduleIdFromPayHereCtx() ||
        (location.state?.appointmentScheduleId != null && location.state?.appointmentScheduleId !== ''
            ? String(location.state.appointmentScheduleId)
            : null) ||
        (storedCtx?.appointmentScheduleId != null && storedCtx?.appointmentScheduleId !== ''
            ? String(storedCtx.appointmentScheduleId)
            : null);

    const idFromUrl = appointmentFromUrl && String(appointmentFromUrl).trim() !== ''
        ? String(appointmentFromUrl).trim()
        : null;
    const idFromState = location.state?.appointmentId != null && location.state.appointmentId !== ''
        ? String(location.state.appointmentId)
        : null;
    const idFromStorage = storedCtx?.appointmentId != null && storedCtx.appointmentId !== ''
        ? String(storedCtx.appointmentId)
        : null;
    const appointmentIdFromBooking = idFromUrl || idFromState || idFromStorage;


            //validate appointment, user for payment portal
    useEffect(() => {
        document.title = "Payment Portal";

        if (!patientId) {
            setLoading(false);
            setError('not_logged_in');
            return;
        }

        if (!appointmentScheduleId) {
            setLoading(false);
            setError('no_appointment');
            return;
        }

        const pendingItem = sessionStorage.getItem('pending_appointment');
        if (pendingItem) {
            const pendingData = JSON.parse(pendingItem);
            const queueNo = pendingData.booking_queue_no ?? pendingData.appointment_No;
            const mappedDetails = {
                first_name: pendingData.patientName.split(' ')[0],
                second_name: pendingData.patientName.split(' ').slice(1).join(' ') || '',
                doctor_name: pendingData.doctorName,
                specialization: pendingData.specialization,
                schedule_date: pendingData.schedule_date,
                start_time: pendingData.start_time,
                channelingFee: pendingData.channelingFee,
                appointment_schedule_id: pendingData.schedule_id,
                appointment_queue_no: queueNo,
                booking_queue_no: queueNo,
                appointment_No: queueNo,
                slots_snapshot:
                    pendingData.max_patients != null
                        ? `${Number(pendingData.booked_count_at_checkout) || 0} / ${Number(pendingData.max_patients)}`
                        : null
            };
            setDetails(mappedDetails);
            setLoading(false);
        } else {
            const fetchDetails = async () => {
                try {
                    const response = await axios.get(
                        `${API_BASE}/api/payment/details?patientID=${patientId}&appointment_schedule_id=${appointmentScheduleId}`
                    );
                    setDetails(response.data);
                    setLoading(false);
                } catch {
                    setError('fetch_failed');
                    setLoading(false);
                }
            };
            fetchDetails();
        }

        return () => {
            document.title = "Doctor Channeling System";
        };
    }, [patientId, appointmentScheduleId, searchParams]);

    if (loading) {
        return (
            <div className="payment-page-wrapper">
                <ECareNavBar />
                <div className="payment-container">
                    {/* Skeleton left side */}
                    <div className="payment-left">
                        <div className="payment-left-content">
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '180px', height: '40px', marginBottom: '40px', borderRadius: '8px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '90%', height: '45px', marginBottom: '15px', borderRadius: '8px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '70%', height: '45px', marginBottom: '25px', borderRadius: '8px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '100%', height: '20px', marginBottom: '10px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '85%', height: '20px', marginBottom: '40px', borderRadius: '6px' }}></div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <div className="skeleton-bar skeleton-pulse" style={{ width: '140px', height: '44px', borderRadius: '12px' }}></div>
                                <div className="skeleton-bar skeleton-pulse" style={{ width: '160px', height: '44px', borderRadius: '12px' }}></div>
                            </div>
                        </div>
                        <div className="bg-circles">
                            <div className="circle circle-1"></div>
                            <div className="circle circle-2"></div>
                        </div>
                    </div>

                    {/* Skeleton right side */}
                    <div className="payment-right">
                        <div className="summary-box">
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '60%', height: '28px', margin: '0 auto 30px', borderRadius: '8px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '100%', height: '18px', marginBottom: '18px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '90%', height: '18px', marginBottom: '18px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '80%', height: '18px', marginBottom: '18px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '75%', height: '18px', marginBottom: '18px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '85%', height: '18px', marginBottom: '18px', borderRadius: '6px' }}></div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '70%', height: '18px', marginBottom: '25px', borderRadius: '6px' }}></div>
                            <div style={{ borderTop: '1px solid #eee', paddingTop: '15px', marginBottom: '30px' }}>
                                <div className="skeleton-bar skeleton-pulse" style={{ width: '60%', height: '20px', marginBottom: '8px', borderRadius: '6px' }}></div>
                                <div className="skeleton-bar skeleton-pulse" style={{ width: '45%', height: '14px', borderRadius: '6px' }}></div>
                            </div>
                            <div className="skeleton-bar skeleton-pulse" style={{ width: '100%', height: '50px', borderRadius: '50px' }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    //validate user for payment portal
    if (error === 'not_logged_in' || !user) {
        return (
            <>
                <ECareNavBar />
                <div className="payment-container">
                    <div className="payment-right">
                        <div className="summary-box">
                            <h2>Can't detect User!</h2>
                            <p>Please ensure you are logged in.</p>
                            <button className="login-btn" onClick={() => window.location.href = "/login"}>
                                Login
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }
    //validate appointment for payment portal
    if (error === 'no_appointment') {
        return (
            <>
                <ECareNavBar />
                <div className="payment-container">
                    <div className="payment-right">
                        <div className="summary-box">
                            <h2>No Appointment Found</h2>
                            <p>Please book an appointment first before proceeding to payment.</p>
                            <button className="login-btn" onClick={() => navigate('/ecare/doctors')}>
                                Find a Doctor
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (error === 'fetch_failed' || !details) {
        return (
            <>
                <ECareNavBar />
                <div className="payment-container">
                    <div className="payment-right">
                        <div className="summary-box">
                            <h2>Error Loading Payment Details</h2>
                            <p>We couldn't load your payment information. Please try again.</p>
                            <button className="login-btn" onClick={() => window.location.reload()}>
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    //time format design

    const formatScheduleDateTime = (scheduleDate, startTime) => {
        try {
            const raw = scheduleDate ? String(scheduleDate).split('T')[0] : '';
            const dateStr = raw ? formatScheduleDateLK(raw) : String(scheduleDate || '');
            const timeStr = startTime ? formatWallTime12(startTime) : '';
            return timeStr ? `${dateStr} · ${timeStr}` : dateStr;
        } catch {
            return `${scheduleDate} ${startTime || ''}`;
        }
    };

    //names and appointment details

    const apiApptId = details.appointment_id;
    const resolvedAppointmentId =
        (apiApptId != null && apiApptId !== '' ? apiApptId : null) ?? appointmentIdFromBooking;

    const scheduleIdForDisplay =
        displayScalar(details.appointment_schedule_id) ?? appointmentScheduleId ?? '—';

    const bookingQueueRaw =
        details.booking_queue_no ?? details.appointment_queue_no ?? details.appointment_No;
    const bookingNoDisplay = formatBookingQueueNo(bookingQueueRaw);

    const channelingFeeNum = parseFloat(details.channelingFee);
    const channelingFee = Number.isFinite(channelingFeeNum) ? channelingFeeNum : 0;
    const serviceChargeNum = parseFloat(details.serviceCharge);
    const serviceCharge = Number.isFinite(serviceChargeNum) ? serviceChargeNum : 0;

    const paymentData = {
        patientName: `${details.first_name} ${details.second_name}`,
        doctorName: details.doctor_name,
        specialization: details.specialization,
        appointmentScheduleId: scheduleIdForDisplay,
        appointmentNo: bookingNoDisplay,
        appointmentId: resolvedAppointmentId,
        dateTime: formatScheduleDateTime(details.schedule_date, details.start_time),
        channelingFee,
        serviceCharge,
        totalAmount: channelingFee + serviceCharge,
    };
    //payhere payment button
    const handlePayHereClick = async () => {
        let paymentID = '';
        const pendingItem = sessionStorage.getItem('pending_appointment');
        //validate patient id for payment portal
        if (pendingItem) {
            if (patientId == null || String(patientId).trim() === '') {
                alert('Please log in again before paying.');
                return;
            }
            paymentID = 'ORD' + appointmentScheduleId + '_' + patientId + '_' + Date.now();
        } else {
            //validate appointment id for payment portal
            const appointmentID = paymentData.appointmentId;
            if (appointmentID == null || appointmentID === '') {
                alert('Appointment number is missing. Please complete your booking again from the appointment page.');
                return;
            }
            paymentID = 'ORD' + appointmentID + '_' + Date.now();
        }
        //validate amount for payment portal
        const amount = paymentData.totalAmount;
        const currency = 'LKR';

        const isSandbox = true; // change to false for live/production

        if (typeof window.payhere === 'undefined' || !window.payhere.startPayment) {
            alert('PayHere script failed to load. Refresh the page or check your internet connection.');
            return;
        }
        //validate payhere script for payment portal
        try {
            //validate appointment schedule id for payment portal
            const payQs = new URLSearchParams();
            if (appointmentScheduleId) payQs.set('appointment_schedule_id', String(appointmentScheduleId));
            if (paymentData.appointmentId != null && paymentData.appointmentId !== '') {
                payQs.set('appointment_id', String(paymentData.appointmentId));
            }
            const payReturnBase = `${window.location.origin}/ecare/payment`;
            const payReturnUrl = payQs.toString() ? `${payReturnBase}?${payQs.toString()}` : payReturnBase;

            // get backend hash
            const hashResponse = await axios.post(`${API_BASE}/api/payment/generate-hash`,
                {
                    paymentID: paymentID,
                    amount: amount,
                    currency: currency,
                    patientID: patientId,
                    appointmentScheduleId: appointmentScheduleId,
                    sandbox: isSandbox
                }
            );
            const { hash, merchantID } = hashResponse.data;

            //validate pending item for payment portal
            if (!pendingItem) {
                //validate reserve checkout for payment portal
                const reserveRes = await axios.post(
                    `${API_BASE}/api/payment/reserve-checkout`,
                    {
                        internal_order_id: paymentID,
                        appointment_id: Number(paymentData.appointmentId),
                        amount: amount
                    },
                    { validateStatus: (s) => s >= 200 && s < 500 }
                );
                if (reserveRes.status >= 400) {
                    const m = reserveRes.data?.message || 'Could not reserve payment';
                    alert(m);
                    return;
                }
            }

            //validate payhere order context for payment portal
            try {
                sessionStorage.setItem(
                    'payhere_order_ctx',
                    JSON.stringify({
                        paymentID,
                        mode: pendingItem ? 'pending' : 'existing',
                        pending_appointment: pendingItem ? JSON.parse(pendingItem) : null,
                        amount
                    })
                );
            } catch {
                /* ignore */
            }

            // payhere payment obj
            const payment = {
                "sandbox": isSandbox,
                "merchant_id": merchantID,
                "return_url": payReturnUrl,
                "cancel_url": payReturnUrl,
                "notify_url": PAYHERE_NOTIFY_URL,
                "order_id": paymentID,
                "items": "Doctor Appointment",
                "amount": amount,
                "currency": currency,
                "hash": hash,
                "first_name": details.first_name,
                "last_name": details.second_name,
                "email": user.email,
                "phone": user.phone || "0771234567",
                "address": "Narammala",
                "city": "Narammala",
                "country": "Sri Lanka",
            };

            // PayHere Callbacks - Register BEFORE starting payment
            window.payhere.onCompleted = async function onCompleted(order_id) {
                const oid = resolvePayHereOrderId(order_id);
                if (!oid) {
                    console.error('PayHere onCompleted: missing order_id', order_id);
                    navigate('/ecare/payment/failed');
                    return;
                }
                //validate pending item for payment portal
                let pendingItemStr = sessionStorage.getItem('pending_appointment');
                if (!pendingItemStr) {
                    try {
                        const rawCtx = sessionStorage.getItem('payhere_order_ctx');
                        if (rawCtx) {
                            const ctx = JSON.parse(rawCtx);
                            if (ctx.paymentID === oid && ctx.pending_appointment) {
                                pendingItemStr = JSON.stringify(ctx.pending_appointment);
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }
                //validate pending data for payment portal
                if (pendingItemStr) {
                    let pendingData;
                    try {
                        //validate pending data for payment portal
                        pendingData = JSON.parse(pendingItemStr);
                    } catch (e) {
                        //validate invalid pending data for payment portal
                        console.error('Invalid pending_appointment', e);
                        navigate('/ecare/payment/failed');
                        return;
                    }

                    try {
                        //validate poll payment until resolved for payment portal
                        const polled = await pollPaymentUntilResolved(oid);
                        if (!polled.ok) {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                            return;
                        }

                        //validate finalize appointment for payment portal
                        const finalizeRes = await axios.post(
                            `${API_BASE}/api/appointments/finalize`,
                            {
                                pending_appointment: pendingData,
                                payhere_order_id: oid,
                                amount: amount
                            },
                            { validateStatus: (s) => s >= 200 && s < 500 }
                        );

                        const payload = finalizeRes.data || {};
                        const finOk =
                            finalizeRes.status === 200 &&
                            payload.success === true &&
                            payload.data?.id != null;
                        const finRejected =
                            finalizeRes.status === 400 ||
                            (finalizeRes.status === 200 && payload.success === false);

                        if (finRejected) {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                            return;
                        }

                        if (!finOk && finalizeRes.status === 202) {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                            return;
                        }

                        if (!finOk && polled.appointment_id != null && Number.isFinite(polled.appointment_id)) {
                            sessionStorage.removeItem('pending_appointment');
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/success', {
                                state: {
                                    ...paymentData,
                                    paymentID: oid,
                                    appointmentId: polled.appointment_id,
                                    appointmentNo:
                                        pendingData.booking_queue_no ?? pendingData.appointment_No
                                }
                            });
                            return;
                        }

                        if (!finOk) {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                            return;
                        }

                        sessionStorage.removeItem('pending_appointment');
                        sessionStorage.removeItem('payhere_order_ctx');
                        navigate('/ecare/payment/success', {
                            state: {
                                ...paymentData,
                                paymentID: oid,
                                appointmentId: payload.data.id,
                                appointmentNo:
                                    pendingData.booking_queue_no ?? pendingData.appointment_No
                            }
                        });
                    } catch (e) {
                        //validate finalize error for payment portal
                        console.error('Finalize error', e);
                        const polled = await pollPaymentUntilResolved(oid);
                        if (polled.ok && polled.appointment_id != null) {
                            sessionStorage.removeItem('pending_appointment');
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/success', {
                                state: {
                                    ...paymentData,
                                    paymentID: oid,
                                    appointmentId: polled.appointment_id,
                                    appointmentNo:
                                        pendingData.booking_queue_no ?? pendingData.appointment_No
                                }
                            });
                        } else {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                        }
                    }
                    return;
                }

                let attempts = 0;
                const maxAttempts = 15;

                const checkStatus = async () => {
                    attempts++;
                    try {
                        const response = await axios.get(
                            `${API_BASE}/api/payment/status/${encodeURIComponent(oid)}`
                        );
                        const status = String(response.data?.status ?? '').toUpperCase();

                        if (status === 'SUCCESS') {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/success', {
                                state: {
                                    ...paymentData,
                                    paymentID: oid,
                                    appointmentId: response.data?.appointment_id
                                }
                            });
                            return;
                        }
                        if (TERMINAL_PAYMENT_FAIL.includes(status)) {
                            sessionStorage.removeItem('payhere_order_ctx');
                            navigate('/ecare/payment/failed');
                            return;
                        }
                    } catch {
                        /* retry poll */
                    }

                    if (attempts < maxAttempts) {
                        setTimeout(checkStatus, 2000);
                    } else {
                        alert('Payment verification is taking longer than expected. Please check your appointments later.');
                    }
                };

                checkStatus();
            };

            window.payhere.onDismissed = function onDismissed() {
                sessionStorage.removeItem('payhere_order_ctx');
                navigate('/ecare/payment/failed');
            };

            window.payhere.onError = function onError() {
                sessionStorage.removeItem('payhere_order_ctx');
                navigate('/ecare/payment/failed');
            };

            window.payhere.startPayment(payment);
        }
        catch (error) {
            const apiMsg = error?.response?.data?.message;
            const msg =
                (typeof apiMsg === 'string' && apiMsg.trim()) ||
                'Unable to start payment. Please try again.';
            alert(msg);
        }

    }



    return (
        <div className="payment-page-wrapper">
            <ECareNavBar />
            <div className="payment-container">
                {/* left side - Payment Portal Info */}
                <div className="payment-left">
                    <div className="payment-left-content">
                        <div className="brand-logo-large">
                            <img src={LogoHospital} alt="NCC Logo" />
                            <span>NCC eCare</span>
                        </div>
                        <h1>Safe & Secure Payment</h1>
                        <p>Complete your booking by paying securely with PayHere. Your health and data security are our top priorities.</p>

                        <div className="trust-badges">
                            <div className="badge">
                                <span className="material-symbols-outlined">lock</span>
                                <span>SSL Secured</span>
                            </div>
                            <div className="badge">
                                <span className="material-symbols-outlined">verified</span>
                                <span>Verified Provider</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-circles">
                        <div className="circle circle-1"></div>
                        <div className="circle circle-2"></div>
                    </div>
                </div>

                {/* right - Summary Details */}
                <div className="payment-right">
                    <div className="summary-box">
                        <h2>Payment Summary</h2>
                        <div className="details">
                            <p><span>Patient name:</span> {paymentData.patientName}</p>
                            <p><span>Doctor name:</span> {paymentData.doctorName}</p>
                            <p><span>Specialization:</span> {paymentData.specialization}</p>
                            <p><span>Appointment schedule No:</span> {paymentData.appointmentScheduleId}</p>
                            <p><span>Booking queue no:</span> {paymentData.appointmentNo ?? '—'}</p>
                            {details.slots_snapshot != null && details.slots_snapshot !== '' && (
                                <p><span>Slots (when you continued):</span> {details.slots_snapshot}</p>
                            )}
                            <p><span>Date/Time:</span> {paymentData.dateTime}</p>
                            <div className="fee-row">
                                <p><span>Fee:</span> {paymentData.totalAmount} LKR</p>
                            </div>
                        </div>

                        <button className="payhere-btn" onClick={handlePayHereClick}>
                            Pay with <span>PayHere</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentPortal;