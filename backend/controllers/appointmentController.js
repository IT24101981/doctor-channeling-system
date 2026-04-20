const db = require('../config/db');

/** Match PayHere / DB variations (trim, case). */
const SQL_PAYMENT_IS_SUCCESS = `UPPER(TRIM(COALESCE(p.payment_status, ''))) = 'SUCCESS'`;

/** Rows we may reuse for completing a checkout (not failed/cancelled placeholders). */
const SQL_APPOINTMENT_REUSABLE = `COALESCE(a.appointment_status, 'added') NOT IN ('failed', 'cancelled')`;

exports.finalizeAppointment = async (req, res) => {
    const { pending_appointment, payhere_order_id, amount } = req.body;

    if (!pending_appointment || !payhere_order_id) {
        return res.status(400).json({ success: false, message: 'Missing required data' });
    }

    const schedule_id = Number(pending_appointment.schedule_id);
    const patient_ID = Number(pending_appointment.patient_ID);
    if (!Number.isFinite(schedule_id) || !Number.isFinite(patient_ID)) {
        return res.status(400).json({ success: false, message: 'Invalid schedule or patient' });
    }

    const payAmount = amount != null ? Number(amount) : Number(pending_appointment.channelingFee);
    const amountValue = Number.isFinite(payAmount) ? payAmount : 0;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [payRows] = await connection.execute(
            `SELECT id, payment_status, appointment_id FROM payments WHERE internal_order_id = ? LIMIT 1 FOR UPDATE`,
            [payhere_order_id]
        );

        if (payRows.length === 0) {
            await connection.rollback();
            return res.status(202).json({
                success: false,
                message: 'Payment not confirmed yet. Wait for PayHere notification or try again shortly.',
                awaiting: true
            });
        }

        const st = String(payRows[0].payment_status || '')
            .trim()
            .toUpperCase();
        if (['FAILED', 'CANCELED', 'CHARGEDBACK', 'DUPLICATE'].includes(st)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Payment was declined, cancelled, or did not complete.'
            });
        }
        if (st !== 'SUCCESS') {
            await connection.rollback();
            return res.status(202).json({
                success: false,
                message: 'Payment is still processing.',
                awaiting: true
            });
        }

        const linkedAppt = payRows[0].appointment_id;
        if (linkedAppt != null && Number(linkedAppt) > 0) {
            await connection.execute(
                `UPDATE appointments SET payment_id = COALESCE(payment_id, ?), appointment_status = 'added' WHERE id = ?`,
                [payRows[0].id, Number(linkedAppt)]
            );
            await connection.commit();
            return res.status(200).json({
                success: true,
                message: 'Payment already recorded',
                data: { id: Number(linkedAppt) }
            });
        }

        // SUCCESS row from notify without appointment_id yet (edge) — attach booking + increment slot
        const [schedules] = await connection.execute(
            'SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE',
            [schedule_id]
        );
        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }
        const schedule = schedules[0];
        const doctor_id = schedule.doctor_id;

        const [alreadyPaidHere] = await connection.execute(
            `SELECT 1 AS ok
             FROM appointments a
             INNER JOIN payments p ON p.appointment_id = a.id
             WHERE a.schedule_id = ? AND a.patient_ID = ? AND ${SQL_PAYMENT_IS_SUCCESS}
             LIMIT 1`,
            [schedule_id, patient_ID]
        );
        const skipReuse = alreadyPaidHere.length > 0;

        let openBooking = [];
        if (!skipReuse) {
            const [rows] = await connection.execute(
                `SELECT a.id FROM appointments a
                 WHERE a.schedule_id = ? AND a.patient_ID = ?
                   AND ${SQL_APPOINTMENT_REUSABLE}
                   AND NOT EXISTS (
                       SELECT 1 FROM payments p
                       WHERE p.appointment_id = a.id AND ${SQL_PAYMENT_IS_SUCCESS}
                   )
                 ORDER BY a.id ASC
                 LIMIT 1
                 FOR UPDATE`,
                [schedule_id, patient_ID]
            );
            openBooking = rows;
        }

        let newAppointmentId;

        if (openBooking.length > 0) {
            newAppointmentId = openBooking[0].id;
            await connection.execute(
                `UPDATE appointments SET doctor_id = ?, appointment_status = 'added' WHERE id = ?`,
                [doctor_id, newAppointmentId]
            );
        } else {
            if (schedule.status !== 'active') {
                await connection.rollback();
                return res.status(400).json({ success: false, message: `Schedule is currently ${schedule.status}` });
            }
            if (schedule.booked_count >= schedule.max_patients) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Schedule is full' });
            }

            const booking_queue_no = schedule.booked_count + 1;
            const [appointmentResult] = await connection.execute(
                `INSERT INTO appointments
                (schedule_id, doctor_id, patient_ID, booking_queue_no, appointment_status)
                VALUES (?, ?, ?, ?, 'added')`,
                [schedule_id, doctor_id, patient_ID, booking_queue_no]
            );
            newAppointmentId = appointmentResult.insertId;

            const newBookedCount = schedule.booked_count + 1;
            let updateScheduleQuery = 'UPDATE appointment_schedules SET booked_count = ?';
            const updateParams = [newBookedCount];
            if (newBookedCount >= schedule.max_patients) {
                updateScheduleQuery += ', status = ?';
                updateParams.push('full');
            }
            updateScheduleQuery += ' WHERE id = ?';
            updateParams.push(schedule_id);
            await connection.execute(updateScheduleQuery, updateParams);
        }

        await connection.execute(
            `UPDATE payments SET appointment_id = ?, patient_id = ?, doctor_id = ?, appointment_schedule_id = ?
             WHERE internal_order_id = ?`,
            [newAppointmentId, patient_ID, doctor_id, schedule_id, payhere_order_id]
        );

        const [payIdRows] = await connection.execute(
            'SELECT id FROM payments WHERE internal_order_id = ? LIMIT 1',
            [payhere_order_id]
        );
        if (payIdRows.length > 0) {
            await connection.execute(
                `UPDATE appointments SET payment_id = ?, appointment_status = 'added' WHERE id = ?`,
                [payIdRows[0].id, newAppointmentId]
            );
        }

        await connection.commit();
        res.status(200).json({
            success: true,
            message: 'Appointment finalized successfully',
            data: { id: newAppointmentId }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Duplicate payment or booking conflict. Please refresh or contact support.'
            });
        }
        console.error('Finalize appointment error:', error.message, error.code || '', error.sqlMessage || '');
        res.status(500).json({
            success: false,
            message: 'Server error while finalizing appointment',
            ...(process.env.NODE_ENV !== 'production' && error.sqlMessage
                ? { detail: error.sqlMessage }
                : {})
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.createAppointment = async (req, res) => {
    const {
        schedule_id,
        doctor_id,
        patient_ID
    } = req.body;

    if (!patient_ID) {
        return res.status(401).json({ success: false, message: 'Authentication required. patient_ID missing.' });
    }

    if (!schedule_id || !doctor_id) {
        return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check schedule exists and is active, using FOR UPDATE lock
        const [schedules] = await connection.execute(
            'SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE',
            [schedule_id]
        );

        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        const schedule = schedules[0];

        if (schedule.status !== 'active') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Schedule is currently ${schedule.status}` });
        }

        if (schedule.booked_count >= schedule.max_patients) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Schedule is full' });
        }

        const booking_queue_no = schedule.booked_count + 1;

        const [result] = await connection.execute(
            `INSERT INTO appointments 
            (schedule_id, doctor_id, patient_ID, booking_queue_no, appointment_status) 
            VALUES (?, ?, ?, ?, 'added')`,
            [schedule_id, doctor_id, patient_ID, booking_queue_no]
        );

        const newBookedCount = schedule.booked_count + 1;
        let updateScheduleQuery = 'UPDATE appointment_schedules SET booked_count = ?';
        const updateParams = [newBookedCount];

        if (newBookedCount >= schedule.max_patients) {
            updateScheduleQuery += ', status = ?';
            updateParams.push('full');
        }

        updateScheduleQuery += ' WHERE id = ?';
        updateParams.push(schedule_id);

        await connection.execute(updateScheduleQuery, updateParams);

        await connection.commit();
        const newAppointmentId = Number(result.insertId);
        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            data: { id: newAppointmentId }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Could not create booking (conflict). Please try again.'
            });
        }
        console.error('Create appointment error:', error.message, error.code || '', error.sqlMessage || '');
        res.status(500).json({
            success: false,
            message: 'Server error while booking appointment',
            ...(process.env.NODE_ENV !== 'production' && error.sqlMessage
                ? { detail: error.sqlMessage }
                : {})
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.getAppointmentsBySchedule = async (req, res) => {
    const { schedule_id } = req.params;
    try {
        const [appointments] = await db.execute(`
            SELECT a.*, p.first_name, p.second_name, p.phone AS customer_phone,
                   CASE
                       WHEN EXISTS (
                           SELECT 1 FROM payments pay
                           WHERE pay.appointment_id = a.id
                             AND UPPER(TRIM(COALESCE(pay.payment_status, ''))) = 'REFUNDED'
                       ) THEN 'refunded'
                       WHEN EXISTS (
                           SELECT 1 FROM payments pay
                           WHERE pay.appointment_id = a.id
                             AND UPPER(TRIM(COALESCE(pay.payment_status, ''))) = 'SUCCESS'
                       ) THEN 'paid'
                       ELSE 'pending'
                   END AS appointment_payment_status
            FROM appointments a
            LEFT JOIN patients p ON a.patient_ID = p.id
            WHERE a.schedule_id = ?
            ORDER BY a.created_at ASC
        `, [schedule_id]);

        res.status(200).json({ success: true, message: 'Appointments fetched successfully', data: appointments });
    } catch (error) {
        console.error('Get appointments by schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching appointments' });
    }
};

exports.getPatientAppointments = async (req, res) => {
    const { patient_id } = req.params;
    try {
        const [appointments] = await db.execute(`
            SELECT 
                a.id as appointment_id,
                a.schedule_id as schedule_id,
                a.appointment_status,
                a.payment_id,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM payments p
                        WHERE p.appointment_id = a.id
                          AND UPPER(TRIM(COALESCE(p.payment_status, ''))) = 'REFUNDED'
                    ) THEN 'refunded'
                    WHEN EXISTS (
                        SELECT 1 FROM payments p
                        WHERE p.appointment_id = a.id
                          AND UPPER(TRIM(COALESCE(p.payment_status, ''))) = 'SUCCESS'
                    ) THEN 'paid'
                    ELSE 'pending'
                END AS appointment_payment_status,
                a.created_at as booking_date,
                s.schedule_date,
                s.start_time,
                s.end_time,
                s.price,
                d.name as doctor_name,
                d.specialization as doctor_specialization,
                d.hospital as doctor_hospital,
                (
                    SELECT p.internal_order_id FROM payments p
                    WHERE p.appointment_id = a.id
                      AND UPPER(TRIM(COALESCE(p.payment_status, ''))) = 'SUCCESS'
                    ORDER BY p.id DESC
                    LIMIT 1
                ) AS payment_order_id,
                (
                    SELECT p.updated_at FROM payments p
                    WHERE p.appointment_id = a.id
                      AND UPPER(TRIM(COALESCE(p.payment_status, ''))) = 'SUCCESS'
                    ORDER BY p.id DESC
                    LIMIT 1
                ) AS payment_paid_at,
                EXISTS (
                    SELECT 1 FROM refund_requests rr
                    WHERE rr.appointment_id = a.id AND rr.status = 'pending'
                ) AS refund_request_pending
            FROM appointments a
            JOIN appointment_schedules s ON a.schedule_id = s.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.patient_ID = ?
            ORDER BY a.created_at DESC, a.id DESC
        `, [patient_id]);

        res.status(200).json({ success: true, message: 'Patient appointments fetched successfully', data: appointments });
    } catch (error) {
        console.error('Get patient appointments error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching appointments' });
    }
};

exports.updateAppointment = async (req, res) => {
    const { id } = req.params;
    const { appointment_status } = req.body;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }
        const appointment = existing[0];

        let updates = [];
        let params = [];

        if (appointment_status) { updates.push('appointment_status = ?'); params.push(appointment_status); }

        if (updates.length > 0) {
            params.push(id);
            await connection.execute(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, params);

            // If appointment cancelled, decrease the booked_count in schedule (not for failed / no-slot rows)
            const prevStatus = String(appointment.appointment_status || 'added');
            const wasCountedSlot =
                prevStatus !== 'failed' && Number(appointment.booking_queue_no) > 0;
            if (appointment_status === 'cancelled' && prevStatus !== 'cancelled' && wasCountedSlot) {
                const [schedules] = await connection.execute('SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE', [appointment.schedule_id]);
                if (schedules.length > 0) {
                    const schedule = schedules[0];
                    const newBookedCount = Math.max(0, schedule.booked_count - 1);

                    let scheduleUpdate = 'UPDATE appointment_schedules SET booked_count = ?';
                    let scheduleParams = [newBookedCount];

                    // If it was full, it's now active again
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

        await connection.commit();
        res.status(200).json({ success: true, message: 'Appointment updated successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Update appointment error:', error);
        res.status(500).json({ success: false, message: 'Server error while updating appointment' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.deleteAppointment = async (req, res) => {
    const { id } = req.params;

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }
        const appointment = existing[0];
        const scheduleId = appointment.schedule_id;
        const apptStat = String(appointment.appointment_status || 'added');
        const bookedQueueNo = Number(appointment.booking_queue_no || 0);

        // Execute DELETE FROM appointments WHERE id = ?
        await connection.execute('DELETE FROM appointments WHERE id = ?', [id]);

        // Then, decrement the booked_count if the appointment was active (not already cancelled/failed)
        // and had a valid queue number.
        const shouldDecrement = apptStat !== 'cancelled' && apptStat !== 'failed' && bookedQueueNo > 0;

        if (shouldDecrement) {
            const [schedules] = await connection.execute(
                'SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE',
                [scheduleId]
            );

            if (schedules.length > 0) {
                const schedule = schedules[0];
                const newBookedCount = Math.max(0, schedule.booked_count - 1);

                let scheduleUpdate = 'UPDATE appointment_schedules SET booked_count = ?';
                const scheduleParams = [newBookedCount];

                // If the schedule was previously 'full', update the status back to 'active'
                if (schedule.status === 'full') {
                    scheduleUpdate += ', status = ?';
                    scheduleParams.push('active');
                }

                scheduleUpdate += ' WHERE id = ?';
                scheduleParams.push(scheduleId);

                await connection.execute(scheduleUpdate, scheduleParams);
            }
        }

        await connection.commit();
        res.status(200).json({ success: true, message: 'Appointment deleted successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Delete appointment error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting appointment' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * PayHere /notify can arrive before the browser calls /finalize — no payments row yet.
 * Creates booking + payment for ORD{schedule}_{patient}_{ts} orders (idempotent).
 */
exports.ensurePendingBookingAndPaymentFromNotify = async ({
    schedule_id,
    patient_ID,
    internal_order_id,
    amount,
    paymentStatus,
    final_payment_id,
    final_method,
    final_card_digits,
    notifyEnvironment
}) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [dupOrder] = await connection.execute(
            'SELECT id FROM payments WHERE internal_order_id = ? LIMIT 1',
            [internal_order_id]
        );
        if (dupOrder.length > 0) {
            await connection.commit();
            return;
        }

        const [schedules] = await connection.execute(
            'SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE',
            [schedule_id]
        );
        if (schedules.length === 0) {
            await connection.rollback();
            return;
        }
        const schedule = schedules[0];
        const doctor_id = schedule.doctor_id;

        const [alreadyPaidHereNotify] = await connection.execute(
            `SELECT 1 AS ok
             FROM appointments a
             INNER JOIN payments p ON p.appointment_id = a.id
             WHERE a.schedule_id = ? AND a.patient_ID = ? AND ${SQL_PAYMENT_IS_SUCCESS}
             LIMIT 1`,
            [schedule_id, patient_ID]
        );
        const skipReuseNotify = alreadyPaidHereNotify.length > 0;

        let openBooking = [];
        if (!skipReuseNotify) {
            const [rows] = await connection.execute(
                `SELECT a.id FROM appointments a
                 WHERE a.schedule_id = ? AND a.patient_ID = ?
                   AND ${SQL_APPOINTMENT_REUSABLE}
                   AND NOT EXISTS (
                       SELECT 1 FROM payments p
                       WHERE p.appointment_id = a.id AND ${SQL_PAYMENT_IS_SUCCESS}
                   )
                 ORDER BY a.id ASC
                 LIMIT 1
                 FOR UPDATE`,
                [schedule_id, patient_ID]
            );
            openBooking = rows;
        }

        let newAppointmentId;

        if (openBooking.length > 0) {
            newAppointmentId = openBooking[0].id;
            await connection.execute(
                `UPDATE appointments SET doctor_id = ?, appointment_status = 'added' WHERE id = ?`,
                [doctor_id, newAppointmentId]
            );
        } else {
            if (schedule.status !== 'active' || schedule.booked_count >= schedule.max_patients) {
                await connection.rollback();
                return;
            }

            const booking_queue_no = schedule.booked_count + 1;
            const [appointmentResult] = await connection.execute(
                `INSERT INTO appointments
                (schedule_id, doctor_id, patient_ID, booking_queue_no, appointment_status)
                VALUES (?, ?, ?, ?, 'added')`,
                [schedule_id, doctor_id, patient_ID, booking_queue_no]
            );
            newAppointmentId = appointmentResult.insertId;

            const newBookedCount = schedule.booked_count + 1;
            let updateScheduleQuery = 'UPDATE appointment_schedules SET booked_count = ?';
            const updateParams = [newBookedCount];
            if (newBookedCount >= schedule.max_patients) {
                updateScheduleQuery += ', status = ?';
                updateParams.push('full');
            }
            updateScheduleQuery += ' WHERE id = ?';
            updateParams.push(schedule_id);
            await connection.execute(updateScheduleQuery, updateParams);
        }

        try {
            const [payHeader] = await connection.execute(
                `INSERT INTO payments
                (appointment_id, internal_order_id, patient_id, doctor_id, appointment_schedule_id, amount, payment_status, payhere_payment_id, payment_method, card_last_digits, payment_environment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newAppointmentId,
                    internal_order_id,
                    patient_ID,
                    doctor_id,
                    schedule_id,
                    amount,
                    paymentStatus,
                    final_payment_id,
                    final_method,
                    final_card_digits,
                    notifyEnvironment || null
                ]
            );
            const paymentRowId = payHeader.insertId;
            if (paymentRowId) {
                await connection.execute(
                    `UPDATE appointments SET payment_id = ?, appointment_status = 'added' WHERE id = ?`,
                    [paymentRowId, newAppointmentId]
                );
            }
        } catch (insErr) {
            if (insErr.code !== 'ER_DUP_ENTRY') throw insErr;
        }

        await connection.commit();
    } catch (e) {
        if (connection) await connection.rollback();
        console.error('ensurePendingBookingAndPaymentFromNotify error:', e);
        throw e;
    } finally {
        if (connection) connection.release();
    }
};

exports.getDoctorAppointments = async (req, res) => {
    const { doctor_id } = req.params;
    const { startDate, endDate } = req.query;

    try {
        let query = `
            SELECT 
                a.id,
                a.appointment_status,
                a.booking_queue_no,
                CONCAT(p.first_name, ' ', p.second_name) as patient_name,
                s.schedule_date,
                s.start_time,
                s.end_time,
                s.price
            FROM appointments a
            JOIN patients p ON a.patient_ID = p.id
            JOIN appointment_schedules s ON a.schedule_id = s.id
            WHERE a.doctor_id = ?
        `;
        let params = [doctor_id];

        if (startDate) {
            query += ` AND s.schedule_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND s.schedule_date <= ?`;
            params.push(endDate);
        }

        query += ` ORDER BY s.schedule_date DESC, s.start_time DESC`;

        const [appointments] = await db.execute(query, params);

        res.status(200).json({ success: true, message: 'Doctor appointments fetched successfully', data: appointments });
    } catch (error) {
        console.error('Get doctor appointments error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching appointments' });
    }
};
