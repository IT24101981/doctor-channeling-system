const db = require('../config/db');
const crypto = require('crypto');
const axios = require('axios');
const { sendMail } = require('../utils/emailSender');
const { buildRefundProcessedPatientEmail, colomboDateTimeLabel } = require('../utils/refundFlowPatientEmail');
const { buildReceiptEmailHtml, buildReceiptEmailText } = require('../utils/receiptEmailHtml');
const { buildReceiptFailEmailHtml, buildReceiptFailEmailText } = require('../utils/receiptFailEmailHtml');
const { buildReceiptPdfBufferFromJsPDF } = require('../utils/generateReceiptPdfNode');
const { appendDeletedPaymentsToGoogleSheet } = require('../utils/googleSheetsPaymentArchive');

async function getPayHereOAuthToken() {
    const oauthUrl = String(process.env.PAYHERE_OAUTH_URL || '').trim();
    const appId = String(process.env.PAYHERE_APP_ID || '').trim();
    const appSecret = String(process.env.PAYHERE_APP_SECRET || '').trim();

    if (!oauthUrl || !appId || !appSecret) {
        return null;
    }

    const basic = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

    const tokenRes = await axios.post(oauthUrl, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${basic}`
        },
        timeout: 20000
    });

    const token = tokenRes?.data?.access_token || tokenRes?.data?.token || null;
    // #region agent log
    fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H5',location:'paymentController.js:getPayHereOAuthToken',message:'OAuth token response received',data:{hasOAuthUrl:Boolean(oauthUrl),hasAppId:Boolean(appId),hasAppSecret:Boolean(appSecret),hasToken:Boolean(token),status:tokenRes?.status || null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return token ? String(token).trim() : null;
}

/**
 * ORD{appointmentId}_{timestamp}  → existing appointment checkout
 * ORD{scheduleId}_{patientId}_{timestamp} → new booking (finalize) checkout
 */
function parseInternalOrderId(orderKey) {
    const s = String(orderKey || '').trim();
    if (!/^ORD/i.test(s)) return null;
    const rest = s.replace(/^ORD/i, '');
    const parts = rest.split('_').filter(Boolean);
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        return { kind: 'appointment', appointmentId: Number(parts[0]) };
    }
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        return {
            kind: 'pending_slot',
            scheduleId: Number(parts[0]),
            patientId: Number(parts[1])
        };
    }
    return null;
}

async function sendPaymentResultEmail(internalOrderId, paymentStatus) {
    // Only terminal outcomes should notify patients.
    const terminal =
        paymentStatus === 'SUCCESS' ||
        paymentStatus === 'FAILED' ||
        paymentStatus === 'CANCELED' ||
        paymentStatus === 'CHARGEDBACK';
    if (!terminal) return;

    try {
        // Idempotence guard (best-effort). If the log table doesn't exist yet, continue.
        try {
            await db.execute(
                'INSERT INTO payment_email_logs (internal_order_id, payment_status) VALUES (?, ?)',
                [internalOrderId, paymentStatus]
            );
        } catch (e) {
            if (e?.code === 'ER_DUP_ENTRY') return;
            if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }

        const [rows] = await db.execute(
            `SELECT
                p.internal_order_id,
                p.amount,
                p.payment_status,
                p.patient_id,
                p.doctor_id,
                p.appointment_id,
                p.appointment_schedule_id,
                pt.first_name,
                pt.second_name,
                pt.email,
                d.name AS doctor_name,
                d.specialization,
                s.schedule_date,
                s.start_time,
                a.booking_queue_no
             FROM payments p
             JOIN patients pt ON pt.id = p.patient_id
             JOIN doctors d ON d.id = p.doctor_id
             JOIN appointment_schedules s ON s.id = p.appointment_schedule_id
             LEFT JOIN appointments a ON a.id = p.appointment_id
             WHERE p.internal_order_id = ?
             LIMIT 1`,
            [internalOrderId]
        );

        if (!rows.length) return;
        const p = rows[0];

        const patientName = `${p.first_name || ''} ${p.second_name || ''}`.trim() || 'Patient';
        const email = String(p.email || '').trim();
        if (!email) return;

        let appointmentId = p.appointment_id != null ? Number(p.appointment_id) : null;
        let appointmentNo = p.booking_queue_no != null ? Number(p.booking_queue_no) : null;

        if (appointmentId == null || !Number.isFinite(appointmentId)) {
            // Fallback: resolve appointment by (patient, schedule) using the latest booking row.
            const [ap] = await db.execute(
                `SELECT id, booking_queue_no
                 FROM appointments
                 WHERE patient_ID = ? AND schedule_id = ?
                 ORDER BY id DESC
                 LIMIT 1`,
                [p.patient_id, p.appointment_schedule_id]
            );
            if (ap.length) {
                appointmentId = Number(ap[0].id);
                appointmentNo = ap[0].booking_queue_no != null ? Number(ap[0].booking_queue_no) : null;
            }
        }

        const dateTimeLabel = `${p.schedule_date || '—'} ${p.start_time || ''}`.trim() || '—';
        const pdfData = {
            paymentID: internalOrderId,
            appointmentId: appointmentId != null ? appointmentId : null,
            appointmentNo: appointmentNo != null ? appointmentNo : null,
            patientName,
            doctorName: p.doctor_name,
            specialization: p.specialization,
            dateTime: dateTimeLabel,
            totalAmount: Number(p.amount || 0)
        };

        const subject =
            paymentStatus === 'SUCCESS'
                ? 'Booking successful — NCC eCare'
                : 'Payment failed — NCC eCare';

        if (paymentStatus === 'SUCCESS') {
            const html = buildReceiptEmailHtml(pdfData);
            const text = buildReceiptEmailText(pdfData);
            const pdfBuffer = buildReceiptPdfBufferFromJsPDF(pdfData);

            await sendMail({
                to: email,
                subject,
                html,
                text,
                attachments: [
                    {
                        filename: `NCC-Receipt-${internalOrderId}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            });
        } else {
            const html = buildReceiptFailEmailHtml(pdfData);
            const text = buildReceiptFailEmailText(pdfData);
            await sendMail({ to: email, subject, html, text });
        }
    } catch (e) {
        console.error('sendPaymentResultEmail error:', e.message);
    }
}

/**
 * After a payment is marked REFUNDED: find the booking row and set appointment_status = 'cancelled'
 * (matches manual cancel slot logic). Tries: payments.appointment_id → appointments.payment_id →
 * refund_requests → ORD{apptId}_* order id → schedule+patient for ORD{sched}_{pat}_*.
 */
async function markAppointmentCancelledAfterRefund(payment, internalOrderId) {
    let apptId = payment.appointment_id != null ? Number(payment.appointment_id) : null;
    if (!Number.isFinite(apptId)) {
        apptId = null;
    }

    if (apptId == null && payment.id != null) {
        try {
            const [byPay] = await db.execute(
                'SELECT id FROM appointments WHERE payment_id = ? LIMIT 1',
                [payment.id]
            );
            if (byPay.length && byPay[0].id != null) {
                apptId = Number(byPay[0].id);
            }
        } catch (e) {
            console.warn('markAppointmentCancelledAfterRefund (payment_id):', e.message);
        }
    }

    if (apptId == null) {
        try {
            const [rrRows] = await db.execute(
                `SELECT appointment_id FROM refund_requests WHERE internal_order_id = ? ORDER BY id DESC LIMIT 1`,
                [internalOrderId]
            );
            if (rrRows.length && rrRows[0].appointment_id != null) {
                apptId = Number(rrRows[0].appointment_id);
            }
        } catch (rrSelErr) {
            if (rrSelErr?.code !== 'ER_NO_SUCH_TABLE') {
                console.warn('markAppointmentCancelledAfterRefund (refund_requests):', rrSelErr.message);
            }
        }
    }

    if (apptId == null) {
        const parsed = parseInternalOrderId(internalOrderId);
        if (parsed?.kind === 'appointment' && Number.isFinite(parsed.appointmentId)) {
            apptId = parsed.appointmentId;
        } else if (
            parsed?.kind === 'pending_slot' &&
            payment.patient_id != null &&
            payment.appointment_schedule_id != null
        ) {
            try {
                const [ap] = await db.execute(
                    `SELECT id FROM appointments WHERE patient_ID = ? AND schedule_id = ? ORDER BY id DESC LIMIT 1`,
                    [payment.patient_id, payment.appointment_schedule_id]
                );
                if (ap.length && ap[0].id != null) {
                    apptId = Number(ap[0].id);
                }
            } catch (e) {
                console.warn('markAppointmentCancelledAfterRefund (schedule+patient):', e.message);
            }
        }
    }

    if (apptId == null) {
        console.warn(
            'markAppointmentCancelledAfterRefund: no appointment resolved for order',
            internalOrderId,
            'payment id',
            payment.id
        );
        return;
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [apptId]);
        if (existing.length > 0) {
            const appointment = existing[0];
            const prevStatus = String(appointment.appointment_status || 'added').toLowerCase();
            if (prevStatus !== 'cancelled') {
                await connection.execute(`UPDATE appointments SET appointment_status = 'cancelled' WHERE id = ?`, [apptId]);
                const wasCountedSlot = prevStatus !== 'failed' && Number(appointment.booking_queue_no) > 0;
                if (wasCountedSlot) {
                    const [schedules] = await connection.execute(
                        'SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE',
                        [appointment.schedule_id]
                    );
                    if (schedules.length > 0) {
                        const schedule = schedules[0];
                        const newBookedCount = Math.max(0, Number(schedule.booked_count) - 1);
                        let scheduleUpdate = 'UPDATE appointment_schedules SET booked_count = ?';
                        const scheduleParams = [newBookedCount];
                        if (schedule.status === 'full') {
                            scheduleUpdate += ', status = ?';
                            scheduleParams.push('active');
                        }
                        scheduleUpdate += ' WHERE id = ?';
                        scheduleParams.push(appointment.schedule_id);
                        await connection.execute(scheduleUpdate, scheduleParams);
                    }
                }
            }
        }
        await connection.commit();
    } catch (apptErr) {
        await connection.rollback();
        console.error('markAppointmentCancelledAfterRefund: failed:', apptErr.message);
    } finally {
        connection.release();
    }
}

async function sendPatientRefundCompletedEmail(payment, internalOrderId, refundedAmount) {
    try {
        if (!payment?.patient_id) return;
        const [patRows] = await db.execute(
            `SELECT email, first_name, second_name FROM patients WHERE id = ?`,
            [payment.patient_id]
        );
        if (!patRows.length) return;
        const pt = patRows[0];
        const email = String(pt.email || '').trim();
        if (!email) return;

        const [meta] = await db.execute(
            `SELECT d.name AS doctor_name, s.schedule_date
             FROM payments p
             JOIN appointment_schedules s ON s.id = p.appointment_schedule_id
             JOIN doctors d ON d.id = p.doctor_id
             WHERE p.internal_order_id = ?
             LIMIT 1`,
            [internalOrderId]
        );
        const doctorName = meta[0]?.doctor_name;
        const scheduleRaw = meta[0]?.schedule_date;
        const scheduleDateLabel =
            scheduleRaw != null ? String(scheduleRaw).split('T')[0].replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : undefined;

        const patientName = `${pt.first_name || ''} ${pt.second_name || ''}`.trim() || 'Patient';
        const amt = refundedAmount != null ? Number(refundedAmount) : Number(payment.amount);
        const { html, text, subject } = buildRefundProcessedPatientEmail({
            patientName,
            orderRef: internalOrderId,
            refundAmount: amt,
            originalAmount: Number(payment.amount),
            doctorName,
            scheduleDateLabel,
            processedDateLabel: colomboDateTimeLabel()
        });
        await sendMail({ to: email, subject, html, text });
    } catch (e) {
        console.error('sendPatientRefundCompletedEmail:', e.message);
    }
}

exports.getPaymentDetails = async (req, res) => {
    //create URL query (?patientID=1&appointment_schedule_id=1)
    const { patientID, appointment_schedule_id } = req.query;

    try {
        // appointment_id = DB PK (payments / PayHere). appointment_queue_no = position in this
        // schedule (1st, 2nd, …) — matches "No. booked_count+1" on the confirm-appointment page.
        const [rows] = await db.execute(
            `SELECT p.first_name, p.second_name,
                    d.name AS doctor_name, d.specialization,
                    aps.booked_count, aps.schedule_date, aps.start_time, aps.price AS channelingFee,
                    aps.id AS appointment_schedule_id,
                    appt.id AS appointment_id,
                    appt.booking_queue_no AS appointment_queue_no
             FROM patients p
             INNER JOIN appointment_schedules aps ON aps.id = ?
             INNER JOIN doctors d ON d.id = aps.doctor_id
             INNER JOIN appointments appt ON appt.id = (
                 SELECT a.id
                 FROM appointments a
                 WHERE a.patient_ID = p.id AND a.schedule_id = aps.id
                   AND COALESCE(a.appointment_status, 'added') <> 'failed'
                 ORDER BY a.id DESC
                 LIMIT 1
             )
             WHERE p.id = ?`,
            [appointment_schedule_id, patientID]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'No payment details found (404)' });
        }
        res.status(200).json(rows[0]);

    } catch (error) {
        console.error('Error fetching payment details:', error);
        res.status(500).json({ message: 'Internal server error (500)' });

    }
};

//payhere hashing (for security purpose)

exports.generateHash = async (req, res) => {
    // get payhere credentials from .env file
    const { paymentID, amount, currency, patientID, appointmentScheduleId, sandbox } = req.body;
    const merchantID = (process.env.PAYHERE_MERCHANT_ID || '').trim();
    const merchantSecret = (process.env.PAYHERE_SECRET_CODE || '').trim();

    try {
        if (!merchantID || !merchantSecret) {
            throw new Error('Merchant ID or Secret is missing in Environment Variables');
        }

        console.log('--- PayHere Hash Debugging ---');
        console.log('Merchant ID:', merchantID);
        console.log('Payment ID:', paymentID);
        console.log('Amount:', amount);
        console.log('Currency:', currency);

        // create hash upperCase(MD5(MerchantID + paymentID + Amount + Currency + UpperCase(MD5(MerchantSecret))))
        const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
        
        const amountFormatted = Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            useGrouping: false
        });

        const hashRaw = merchantID + paymentID + amountFormatted + currency + hashedSecret;
        console.log('Full Hash Raw String:', hashRaw);
        
        const hash = crypto.createHash('md5').update(hashRaw).digest('hex').toUpperCase();
        console.log('Generated Hash:', hash);
        console.log('------------------------------');

        res.status(200).json({
            hash,
            merchantID: merchantID
        });
    } catch (error) {
        console.error('Error in generateHash:', error.message);
        res.status(500).json({ message: 'Could not initialize payment. Please check backend environment variables.' });
    }
};

/** Create a PENDING payment row before PayHere (existing appointment flow) so /notify can UPDATE it. */
exports.reserveCheckout = async (req, res) => {
    const { internal_order_id, appointment_id, amount } = req.body;
    if (!internal_order_id || appointment_id == null) {
        return res.status(400).json({ message: 'internal_order_id and appointment_id required' });
    }
    const orderKey = String(internal_order_id).trim();
    try {
        const [dup] = await db.execute('SELECT id FROM payments WHERE internal_order_id = ? LIMIT 1', [orderKey]);
        if (dup.length > 0) {
            return res.status(200).json({ ok: true, existed: true });
        }
        const [appts] = await db.execute(
            'SELECT id, schedule_id, doctor_id, patient_ID FROM appointments WHERE id = ?',
            [appointment_id]
        );
        if (appts.length === 0) {
            return res.status(404).json({ message: 'Appointment not found' });
        }
        const a = appts[0];
        const amt = amount != null ? Number(amount) : 0;
        await db.execute(
            `INSERT INTO payments
            (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
            [orderKey, a.patient_ID, a.doctor_id, a.schedule_id, appointment_id, amt]
        );
        return res.status(201).json({ ok: true });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(200).json({ ok: true, existed: true });
        }
        console.error('reserveCheckout error:', e);
        return res.status(500).json({ message: 'Could not reserve checkout' });
    }
};

exports.handleNotification = async (req, res) => {
    const {
        merchant_id,
        order_id, // PayHere sends order_id
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig,
        payment_id, // PayHere internal payment ID
        method,
        card_last_digits
    } = req.body;

    // For our internal logic, we'll use paymentID to refer to our order_id
    const internalPaymentID = String(order_id == null ? '' : order_id).trim();

    // md5 signature verification
    const merchantSecret = process.env.PAYHERE_SECRET_CODE.trim();
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();

    const amountFormatted = Number(payhere_amount).toLocaleString('en-us', { minimumFractionDigits: 2 }).replaceAll(',', '');
    const hashString = merchant_id + internalPaymentID + amountFormatted + payhere_currency + status_code + hashedSecret;
    const localMd5sig = crypto.createHash('md5')
        .update(hashString)
        .digest('hex')
        .toUpperCase();

    const isTestMode = process.env.PAYHERE_TEST_MODE === 'true' && md5sig === 'TEST_MODE';

    if (localMd5sig === md5sig || isTestMode) {
        try {
            // mapping status codes (PayHere may send string or number)
            // 2: Success, 0: Pending, -1: Canceled, -2: Failed, -3: Chargedback
            const sc = String(status_code ?? '').trim();
            let paymentStatus = 'PENDING';
            if (sc === '2' || status_code === 2) {
                paymentStatus = 'SUCCESS';
            } else if (sc === '0' || status_code === 0) {
                paymentStatus = 'PENDING';
            } else if (sc === '-1' || status_code === -1) {
                paymentStatus = 'CANCELED';
            } else if (sc === '-2' || status_code === -2) {
                paymentStatus = 'FAILED';
            } else if (sc === '-3' || status_code === -3) {
                paymentStatus = 'CHARGEDBACK';
            }

            // PayHere sends card_no, not card_last_digits in sandbox usually
            const payhere_card_no = req.body.card_no || '';
            const final_card_digits = payhere_card_no ? payhere_card_no.slice(-4) : (card_last_digits || '0000');

            const final_payment_id = payment_id || 'N/A';
            const final_method = method || 'N/A';
            const amountNum = payhere_amount != null ? Number(payhere_amount) : 0;

            const [updResult] = await db.execute(
                `UPDATE payments 
                 SET payment_status = ?, 
                     payhere_payment_id = ?, 
                     payment_method = ?, 
                     card_last_digits = ?
                 WHERE internal_order_id = ?`,
                [paymentStatus, final_payment_id, final_method, final_card_digits, internalPaymentID]
            );

            if (updResult.affectedRows === 0) {
                const parsed = parseInternalOrderId(internalPaymentID);
                if (parsed?.kind === 'appointment') {
                    const [appts] = await db.execute(
                        'SELECT id, schedule_id, doctor_id, patient_ID FROM appointments WHERE id = ?',
                        [parsed.appointmentId]
                    );
                    if (appts.length > 0) {
                        const a = appts[0];
                        try {
                            await db.execute(
                                `INSERT INTO payments
                                (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status, payhere_payment_id, payment_method, card_last_digits)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    internalPaymentID,
                                    a.patient_ID,
                                    a.doctor_id,
                                    a.schedule_id,
                                    parsed.appointmentId,
                                    amountNum,
                                    paymentStatus,
                                    final_payment_id,
                                    final_method,
                                    final_card_digits
                                ]
                            );
                        } catch (insErr) {
                            if (insErr.code !== 'ER_DUP_ENTRY') throw insErr;
                            await db.execute(
                                `UPDATE payments 
                                 SET payment_status = ?, payhere_payment_id = ?, payment_method = ?, card_last_digits = ?
                                 WHERE internal_order_id = ?`,
                                [paymentStatus, final_payment_id, final_method, final_card_digits, internalPaymentID]
                            );
                        }
                    }
                } else if (parsed?.kind === 'pending_slot') {
                    if (paymentStatus === 'SUCCESS') {
                        const appointmentController = require('./appointmentController');
                        await appointmentController.ensurePendingBookingAndPaymentFromNotify({
                            schedule_id: parsed.scheduleId,
                            patient_ID: parsed.patientId,
                            internal_order_id: internalPaymentID,
                            amount: amountNum,
                            paymentStatus,
                            final_payment_id,
                            final_method,
                            final_card_digits
                        });
                    } else {
                        let conn;
                        try {
                            conn = await db.getConnection();
                            await conn.beginTransaction();

                            const [schedRows] = await conn.execute(
                                'SELECT doctor_id, booked_count FROM appointment_schedules WHERE id = ? FOR UPDATE',
                                [parsed.scheduleId]
                            );
                            if (schedRows.length > 0) {
                                const docId = schedRows[0].doctor_id;
                                const bookingQueueNo = (Number(schedRows[0].booked_count) || 0) + 1;
                                const [apRes] = await conn.execute(
                                    `INSERT INTO appointments (schedule_id, doctor_id, patient_ID, booking_queue_no, appointment_status)
                                     VALUES (?, ?, ?, ?, 'failed')`,
                                    [parsed.scheduleId, docId, parsed.patientId, bookingQueueNo]
                                );
                                const apptId = apRes.insertId;
                                const [pRes] = await conn.execute(
                                    `INSERT INTO payments
                                    (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status, payhere_payment_id, payment_method, card_last_digits)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        internalPaymentID,
                                        parsed.patientId,
                                        docId,
                                        parsed.scheduleId,
                                        apptId,
                                        amountNum,
                                        paymentStatus,
                                        final_payment_id,
                                        final_method,
                                        final_card_digits
                                    ]
                                );
                                const payId = pRes.insertId;
                                await conn.execute(
                                    'UPDATE appointments SET payment_id = ? WHERE id = ?',
                                    [payId, apptId]
                                );
                            }
                            await conn.commit();
                        } catch (insErr) {
                            if (conn) await conn.rollback();
                            if (insErr.code !== 'ER_DUP_ENTRY') throw insErr;
                            await db.execute(
                                `UPDATE payments
                                 SET payment_status = ?, payhere_payment_id = ?, payment_method = ?, card_last_digits = ?
                                 WHERE internal_order_id = ?`,
                                [
                                    paymentStatus,
                                    final_payment_id,
                                    final_method,
                                    final_card_digits,
                                    internalPaymentID
                                ]
                            );
                        } finally {
                            if (conn) conn.release();
                        }
                    }
                }
            }

            // Send patient email (with receipt PDF attachment on SUCCESS).
            // Best-effort: never block PayHere callback.
            if (paymentStatus) {
                sendPaymentResultEmail(internalPaymentID, paymentStatus).catch(() => {});
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('Database update error:', error);
            res.status(500).send('DB Error');
        }
    } else {
        res.status(400).send('Invalid signature');
    }
}

exports.getPaymentStatus = async (req, res) => {
    const { orderID } = req.params;
    const key = orderID != null ? String(orderID).trim() : '';
    try {
        const [rows] = await db.execute(
            'SELECT payment_status, appointment_id FROM payments WHERE internal_order_id = ?',
            [key]
        );

        if (rows.length === 0) {
            return res.status(200).json({ status: 'NOT_FOUND', appointment_id: null });
        }

        res.status(200).json({
            status: rows[0].payment_status,
            appointment_id: rows[0].appointment_id != null ? Number(rows[0].appointment_id) : null
        });
    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getAllPaymentsForCashier = async (req, res) => {
    const baseSelect = `
            SELECT
                p.appointment_id,
                NULLIF(TRIM(CONCAT(COALESCE(pt.first_name, ''), ' ', COALESCE(pt.second_name, ''))), '') AS patient_name,
                d.name AS doctor_name,
                p.internal_order_id AS transaction_id,
                p.payment_method,
                p.amount,
                p.payment_status AS status,
                p.card_last_digits,
                p.created_at
            FROM payments p
            LEFT JOIN patients pt ON p.patient_id = pt.id
            LEFT JOIN doctors d ON p.doctor_id = d.id
            ORDER BY p.created_at DESC`;

    try {
        const [rows] = await db.execute(`
            SELECT
                p.appointment_id,
                NULLIF(TRIM(CONCAT(COALESCE(pt.first_name, ''), ' ', COALESCE(pt.second_name, ''))), '') AS patient_name,
                d.name AS doctor_name,
                p.internal_order_id AS transaction_id,
                p.payment_method,
                p.amount,
                p.payment_status AS status,
                p.card_last_digits,
                p.created_at,
                EXISTS (
                    SELECT 1 FROM refund_requests rr
                    WHERE rr.internal_order_id = p.internal_order_id
                      AND rr.status = 'pending'
                ) AS pending_refund_request
            FROM payments p
            LEFT JOIN patients pt ON p.patient_id = pt.id
            LEFT JOIN doctors d ON p.doctor_id = d.id
            ORDER BY p.created_at DESC
            `);
        res.status(200).json(rows);
    } catch (error) {
        if (error?.code === 'ER_NO_SUCH_TABLE') {
            try {
                const [rows] = await db.execute(baseSelect);
                const withFlag = rows.map((r) => ({ ...r, pending_refund_request: 0 }));
                return res.status(200).json(withFlag);
            } catch (e2) {
                console.error('Error fetching all payments:', e2);
                return res.status(500).json({ message: 'Internal server error' });
            }
        }
        console.error('Error fetching all payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.deleteOldPayments = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                p.id,
                p.internal_order_id,
                NULLIF(TRIM(CONCAT(COALESCE(pt.first_name, ''), ' ', COALESCE(pt.second_name, ''))), '') AS patient_name,
                d.name AS doctor_name,
                p.amount,
                p.payment_method,
                p.payment_status,
                p.card_last_digits,
                COALESCE(p.appointment_id, ap_id.id, ap_pid.id) AS appointment_id,
                p.created_at
            FROM payments p
            LEFT JOIN appointments ap_id ON ap_id.id = p.appointment_id
            LEFT JOIN appointments ap_pid ON ap_pid.payment_id = p.id AND p.appointment_id IS NULL
            LEFT JOIN patients pt ON pt.id = COALESCE(p.patient_id, ap_id.patient_ID, ap_pid.patient_ID)
            LEFT JOIN doctors d ON d.id = COALESCE(p.doctor_id, ap_id.doctor_id, ap_pid.doctor_id)
            WHERE p.created_at < DATE_SUB(NOW(), INTERVAL 10 YEAR)`
        );

        if (rows.length === 0) {
            return res.status(200).json({ message: 'Deleted 0 old payment(s)', count: 0, archivedToSheet: false });
        }

        const deletedBy = req.staff?.username != null ? String(req.staff.username) : String(req.staff?.id ?? '');
        const archive = await appendDeletedPaymentsToGoogleSheet(rows, {
            deletedAt: new Date(),
            deletedBy
        });

        if (!archive.skipped && !archive.ok) {
            return res.status(502).json({
                message:
                    'Could not save deleted payment details to Google Sheet. No payments were removed. Fix Google Sheets credentials or sharing, then try again.',
                error: archive.error
            });
        }

        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const [result] = await db.execute(`DELETE FROM payments WHERE id IN (${placeholders})`, ids);

        res.status(200).json({
            message: `Deleted ${result.affectedRows} old payment(s)`,
            count: result.affectedRows,
            archivedToSheet: !archive.skipped
        });
    } catch (error) {
        console.error('Error deleting old payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.deleteSandboxPayments = async (req, res) => {
    return res.status(410).json({
        message: 'payment_environment has been removed from schema, so sandbox deletion is no longer supported.'
    });
};

exports.updatePaymentStatus = async (req, res) => {
    const { orderID } = req.params;
    const { status } = req.body;

    const ALLOWED_STATUSES = ['SUCCESS', 'PENDING', 'FAILED', 'CANCELED', 'REFUNDED', 'CHARGEDBACK'];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    try {
        const [result] = await db.execute(
            'UPDATE payments SET payment_status = ? WHERE internal_order_id = ?',
            [status, orderID]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        if (status === 'REFUNDED') {
            const [payRows] = await db.execute(
                `SELECT id, appointment_id, patient_id, appointment_schedule_id, amount
                 FROM payments WHERE internal_order_id = ? LIMIT 1`,
                [orderID]
            );
            if (payRows.length > 0) {
                const row = payRows[0];
                await markAppointmentCancelledAfterRefund(row, orderID);
                sendPatientRefundCompletedEmail(row, orderID, row.amount).catch(() => {});
            }
        }
        res.status(200).json({ message: 'Payment status updated successfully' });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.processRefund = async (req, res) => {
    const { orderID } = req.params;
    const { amount, reason } = req.body || {};
    const internalOrderId = String(orderID || '').trim();

    if (!internalOrderId) {
        return res.status(400).json({ message: 'orderID is required' });
    }

    const refundApiUrl = String(
        process.env.PAYHERE_REFUND_API_URL ||
        process.env.PAYHERE_REFUND_URL ||
        'https://api.payhere.co/api/v1/refunds'
    ).trim();
    const payhereRefundAuthCode = String(process.env.PAYHERE_REFUND_AUTH_CODE || '').trim();
    const payhereApiKey = String(process.env.PAYHERE_API_KEY || '').trim();

    if (!refundApiUrl) {
        return res.status(500).json({ message: 'Refund API URL is not configured in environment variables' });
    }
    if (!payhereRefundAuthCode && !payhereApiKey) {
        return res.status(500).json({ message: 'PayHere refund auth credentials are not configured in environment variables' });
    }
    try {
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H1',location:'paymentController.js:processRefund:start',message:'Refund flow started',data:{orderId:internalOrderId,refundApiUrl,hasApiKey:Boolean(payhereApiKey),hasRefundAuthCode:Boolean(payhereRefundAuthCode),hasAmount:amount != null,reason:String(reason || '')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const [rows] = await db.execute(
            `SELECT id, appointment_id, patient_id, appointment_schedule_id, amount, payment_status, payhere_payment_id
             FROM payments
             WHERE internal_order_id = ?
             LIMIT 1`,
            [internalOrderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        const payment = rows[0];
        if (!payment.payhere_payment_id || payment.payhere_payment_id === 'N/A') {
            return res.status(400).json({ message: 'Cannot refund: payhere payment id is missing' });
        }
        if (payment.payment_status === 'REFUNDED') {
            return res.status(409).json({ message: 'Payment is already refunded' });
        }
        if (payment.payment_status !== 'SUCCESS') {
            return res.status(400).json({ message: `Only SUCCESS payments can be refunded. Current status: ${payment.payment_status}` });
        }

        try {
            const [pendingReq] = await db.execute(
                `SELECT id FROM refund_requests WHERE internal_order_id = ? AND status = 'pending' LIMIT 1`,
                [internalOrderId]
            );
            if (pendingReq.length === 0) {
                return res.status(403).json({
                    message:
                        'No pending refund request for this payment. The patient must submit a refund request from eCare appointment history first.'
                });
            }
        } catch (rrErr) {
            if (rrErr?.code !== 'ER_NO_SUCH_TABLE') {
                throw rrErr;
            }
        }

        const refundAmount = amount != null ? Number(amount) : Number(payment.amount);
        if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ message: 'Invalid refund amount' });
        }

        const allowedReasons = ['requested_by_customer', 'duplicate', 'fraudulent'];
        const normalizedReason = allowedReasons.includes(String(reason || '').trim())
            ? String(reason).trim()
            : 'requested_by_customer';

        const payload = {
            payment_id: String(payment.payhere_payment_id),
            amount: refundAmount.toFixed(2),
            reason: normalizedReason,
            reference: internalOrderId
        };
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H3',location:'paymentController.js:processRefund:paymentCheck',message:'Payment eligibility checked',data:{dbPaymentStatus:payment.payment_status,hasPayherePaymentId:Boolean(payment.payhere_payment_id && payment.payhere_payment_id !== 'N/A'),payherePaymentId:String(payment.payhere_payment_id || ''),refundAmount:payload.amount},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        // PayHere public refunds API expects Bearer API key.
        // merchant/v1 endpoints may require OAuth token depending on merchant config.
        let authorizationHeader = '';
        const isMerchantApi = /\/merchant\/v1\//i.test(refundApiUrl);
        let authSource = 'none';

        if (isMerchantApi) {
            const oauthToken = await getPayHereOAuthToken();
            if (oauthToken) {
                authorizationHeader = `Bearer ${oauthToken}`;
                authSource = 'oauth_token';
            }
            if (!authorizationHeader && payhereRefundAuthCode) {
                const hasPrefix = /^basic\s+|^bearer\s+/i.test(payhereRefundAuthCode);
                authorizationHeader = hasPrefix
                    ? payhereRefundAuthCode
                    : `Basic ${payhereRefundAuthCode}`;
                authSource = hasPrefix ? 'refund_auth_code_prefixed' : 'refund_auth_code_basic';
            }
            if (!authorizationHeader && payhereApiKey) {
                authorizationHeader = `Bearer ${payhereApiKey}`;
                authSource = 'api_key_bearer_fallback';
            }
        } else if (payhereApiKey) {
            authorizationHeader = `Bearer ${payhereApiKey}`;
            authSource = 'api_key_bearer';
        } else if (payhereRefundAuthCode) {
            const hasPrefix = /^bearer\s+/i.test(payhereRefundAuthCode);
            authorizationHeader = hasPrefix
                ? payhereRefundAuthCode
                : `Bearer ${payhereRefundAuthCode}`;
            authSource = hasPrefix ? 'refund_auth_code_bearer_prefixed' : 'refund_auth_code_bearer';
        }

        if (!authorizationHeader) {
            return res.status(500).json({ message: 'Could not build PayHere authorization header. Check refund credentials.' });
        }
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H2',location:'paymentController.js:processRefund:authBuilt',message:'Refund auth header decided',data:{refundApiUrl,isMerchantApi,authSource,authScheme:authorizationHeader.startsWith('Bearer ') ? 'Bearer' : (authorizationHeader.startsWith('Basic ') ? 'Basic' : 'Other')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: authorizationHeader
        };
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H4',location:'paymentController.js:processRefund:requestOut',message:'Refund request sending',data:{requestHost:(() => { try { return new URL(refundApiUrl).host; } catch (_) { return 'invalid-url'; } })(),reference:payload.reference,reason:payload.reason},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const refundRes = await axios.post(refundApiUrl, payload, {
            headers,
            timeout: 20000
        });

        const ok = refundRes?.status >= 200 && refundRes?.status < 300;
        const body = refundRes?.data;
        const payhereAccepted = refundRes?.status === 204 || body?.status === 1 || body?.status === '1' || body?.success === true;
        if (!ok || !payhereAccepted) {
            return res.status(502).json({
                message: 'PayHere refund request was not accepted',
                provider_response: body ?? null
            });
        }

        await db.execute(
            'UPDATE payments SET payment_status = ? WHERE internal_order_id = ?',
            ['REFUNDED', internalOrderId]
        );

        try {
            await db.execute(
                `UPDATE refund_requests
                 SET status = 'completed', resolved_at = CURRENT_TIMESTAMP
                 WHERE internal_order_id = ? AND status = 'pending'`,
                [internalOrderId]
            );
        } catch (rrErr) {
            if (rrErr?.code !== 'ER_NO_SUCH_TABLE') {
                console.warn('refund_requests completion update:', rrErr.message);
            }
        }

        await markAppointmentCancelledAfterRefund(payment, internalOrderId);

        sendPatientRefundCompletedEmail(payment, internalOrderId, refundAmount).catch(() => {});

        return res.status(200).json({
            message: 'Refund processed successfully',
            orderID: internalOrderId,
            provider_response: body ?? null
        });
    } catch (error) {
        const providerBody = error?.response?.data;
        const providerStatus = error?.response?.status;
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H4',location:'paymentController.js:processRefund:catch',message:'Refund request failed',data:{providerStatus:providerStatus || null,providerBody:providerBody || null,errorMessage:error?.message || 'unknown'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.error('processRefund error:', providerStatus || '', providerBody || error.message);
        return res.status(providerStatus && providerStatus >= 400 && providerStatus < 600 ? providerStatus : 500).json({
            message: 'Refund request failed',
            provider_status: providerStatus || null,
            provider_response: providerBody || null
        });
    }
};
