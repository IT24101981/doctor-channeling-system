const db = require('../config/db');
const crypto = require('crypto');
const axios = require('axios');

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
    const merchantID = (
        process.env.PAYHERE_MERCHANT_ID ||
        process.env.PAYHERE_MERCHENT_ID ||
        ''
    ).trim();
    const merchantSecret = (process.env.PAYHERE_SECRET_CODE || '').trim();

    try {
        if (!merchantID || !merchantSecret) {
            throw new Error('Merchant ID or Secret is missing in Environment Variables');
        }

        // create hash upperCase(MD5(MerchantID + paymentID + Amount + Currency + UpperCase(MD5(MerchantSecret))))
        const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
        const amountFormatted = Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            useGrouping: false
        });

        const hashRaw = merchantID + paymentID + amountFormatted + currency + hashedSecret;
        const hash = crypto.createHash('md5').update(hashRaw).digest('hex').toUpperCase();

        res.status(200).json({
            hash,
            merchantID
        });
    } catch (error) {
        console.error('Error in generateHash:', error.message || error);
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
        const env = process.env.PAYHERE_TEST_MODE === 'true' ? 'SANDBOX' : 'LIVE';
        const amt = amount != null ? Number(amount) : 0;
        await db.execute(
            `INSERT INTO payments
            (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status, payment_environment)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            [orderKey, a.patient_ID, a.doctor_id, a.schedule_id, appointment_id, amt, env]
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
    const merchantSecret = (process.env.PAYHERE_SECRET_CODE || '').trim();
    if (!merchantSecret) {
        console.error('handleNotification: PAYHERE_SECRET_CODE is not set');
        return res.status(500).send('Misconfigured server');
    }
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();

    const amountFormatted = Number(payhere_amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        useGrouping: false
    });
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

            const notifyEnvironment = isTestMode ? 'SANDBOX' : 'LIVE';
            const amountNum = payhere_amount != null ? Number(payhere_amount) : 0;

            const [updResult] = await db.execute(
                `UPDATE payments 
                 SET payment_status = ?, 
                     payhere_payment_id = ?, 
                     payment_method = ?, 
                     card_last_digits = ?,
                     payment_environment = ?
                 WHERE internal_order_id = ?`,
                [paymentStatus, final_payment_id, final_method, final_card_digits, notifyEnvironment, internalPaymentID]
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
                                (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status, payhere_payment_id, payment_method, card_last_digits, payment_environment)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                                    final_card_digits,
                                    notifyEnvironment
                                ]
                            );
                        } catch (insErr) {
                            if (insErr.code !== 'ER_DUP_ENTRY') throw insErr;
                            await db.execute(
                                `UPDATE payments 
                                 SET payment_status = ?, payhere_payment_id = ?, payment_method = ?, card_last_digits = ?, payment_environment = ?
                                 WHERE internal_order_id = ?`,
                                [paymentStatus, final_payment_id, final_method, final_card_digits, notifyEnvironment, internalPaymentID]
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
                            final_card_digits,
                            notifyEnvironment
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
                                    (internal_order_id, patient_id, doctor_id, appointment_schedule_id, appointment_id, amount, payment_status, payhere_payment_id, payment_method, card_last_digits, payment_environment)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                                        final_card_digits,
                                        notifyEnvironment
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
                                 SET payment_status = ?, payhere_payment_id = ?, payment_method = ?, card_last_digits = ?, payment_environment = ?
                                 WHERE internal_order_id = ?`,
                                [
                                    paymentStatus,
                                    final_payment_id,
                                    final_method,
                                    final_card_digits,
                                    notifyEnvironment,
                                    internalPaymentID
                                ]
                            );
                        } finally {
                            if (conn) conn.release();
                        }
                    }
                }
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('handleNotification DB error:', error?.code, error?.sqlMessage || error?.message || error);
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
    try {
        const [rows] = await db.execute(`
            SELECT 
                p.appointment_id,
                CONCAT(pt.first_name, ' ', pt.second_name) AS patient_name,
                d.name AS doctor_name,
                p.internal_order_id AS transaction_id,
                p.payment_method,
                p.amount,
                p.payment_status AS status,
                p.payment_environment,
                p.card_last_digits,
                p.created_at,
                EXISTS (
                    SELECT 1 FROM refund_requests rr
                    WHERE rr.status = 'pending'
                      AND (rr.payment_id = p.id OR rr.internal_order_id = p.internal_order_id)
                ) AS pending_refund_request

                FROM
                    payments p
                JOIN 
                patients pt ON p.patient_id = pt.id
                LEFT JOIN
                doctors d ON p.doctor_id = d.id
                ORDER BY 
                p.created_at DESC -- Show newest transactions first
            `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching all payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.deleteOldPayments = async (req, res) => {
    try {
        const [result] = await db.execute(
            `DELETE FROM payments WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)`
        );
        res.status(200).json({ message: `Deleted ${result.affectedRows} old payment(s)`, count: result.affectedRows });
    } catch (error) {
        console.error('Error deleting old payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.deleteSandboxPayments = async (req, res) => {
    try {
        const [result] = await db.execute(
            `DELETE FROM payments WHERE payment_environment = 'SANDBOX'`
        );
        res.status(200).json({ message: `Deleted ${result.affectedRows} sandbox payment(s)`, count: result.affectedRows });
    } catch (error) {
        console.error('Error deleting sandbox payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
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

    // Prefer PayHere public API refunds endpoint unless explicitly opting into merchant-v1.
    const allowMerchantRefunds = String(process.env.PAYHERE_ALLOW_MERCHANT_REFUNDS || '').trim() === 'true';
    let refundApiUrl = String(process.env.PAYHERE_REFUND_API_URL || '').trim();
    if (!refundApiUrl) {
        const envRefundUrl = String(process.env.PAYHERE_REFUND_URL || '').trim();
        const envLooksMerchant = /\/merchant\/v1\//i.test(envRefundUrl);
        refundApiUrl = envRefundUrl && (!envLooksMerchant || allowMerchantRefunds)
            ? envRefundUrl
            : 'https://api.payhere.co/api/v1/refunds';
    }
    const payhereRefundAuthCode = String(process.env.PAYHERE_REFUND_AUTH_CODE || '').trim();
    const payhereApiKey = String(process.env.PAYHERE_API_KEY || '').trim();

    if (!refundApiUrl) {
        return res.status(500).json({ message: 'Refund API URL is not configured in environment variables' });
    }

    let refundsHost = '';
    try {
        refundsHost = new URL(refundApiUrl).hostname;
    } catch (_) {
        return res.status(500).json({ message: 'Invalid PAYHERE_REFUND_URL / PAYHERE_REFUND_API_URL' });
    }
    const usesPublicRefundsApi = refundsHost === 'api.payhere.co';
    const apiKeyLooksLikeMerchantId = /^\d{5,}$/.test(payhereApiKey);
    if (usesPublicRefundsApi && apiKeyLooksLikeMerchantId) {
        return res.status(500).json({
            message:
                'PAYHERE_API_KEY looks like a Merchant ID. Use the API key from PayHere → Integrations (not the numeric merchant id).'
        });
    }

    if (usesPublicRefundsApi && !payhereApiKey) {
        return res.status(500).json({
            message:
                'PAYHERE_API_KEY is required for api.payhere.co refunds. Use the API key from PayHere → Integrations (not Merchant ID or OAuth base64).'
        });
    }
    if (!usesPublicRefundsApi && !payhereRefundAuthCode && !payhereApiKey) {
        return res.status(500).json({ message: 'PayHere refund auth credentials are not configured in environment variables' });
    }
    try {
        // #region agent log
        fetch('http://127.0.0.1:7369/ingest/41c668f3-cb4e-4259-ac8e-af504c4e8c5b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2c06af'},body:JSON.stringify({sessionId:'2c06af',runId:'initial',hypothesisId:'H1',location:'paymentController.js:processRefund:start',message:'Refund flow started',data:{orderId:internalOrderId,refundApiUrl,hasApiKey:Boolean(payhereApiKey),hasRefundAuthCode:Boolean(payhereRefundAuthCode),hasAmount:amount != null,reason:String(reason || '')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const [rows] = await db.execute(
            `SELECT id, amount, payment_status, payhere_payment_id
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