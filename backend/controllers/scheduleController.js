const db = require('../config/db');

const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

exports.createSchedule = async (req, res) => {
    const { doctor_id, schedule_date, start_time, end_time, max_patients, price } = req.body;

    try {
        // Validation
        if (!doctor_id || !schedule_date || !start_time || !end_time || !max_patients || price === undefined) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(schedule_date) < today) {
            return res.status(400).json({ success: false, message: 'Schedule date cannot be in the past' });
        }



        if (max_patients <= 0) {
            return res.status(400).json({ success: false, message: 'Max patients must be greater than 0' });
        }

        if (price < 0) {
            return res.status(400).json({ success: false, message: 'Price cannot be negative' });
        }

        if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const [result] = await db.execute(
            'INSERT INTO appointment_schedules (doctor_id, schedule_date, start_time, end_time, max_patients, price) VALUES (?, ?, ?, ?, ?, ?)',
            [doctor_id, schedule_date, start_time, end_time, max_patients, price]
        );

        res.status(201).json({ success: true, message: 'Schedule created successfully', data: { id: result.insertId } });
    } catch (error) {
        console.error('Create schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error while creating schedule' });
    }
};

exports.getAllSchedules = async (req, res) => {
    try {
        const [schedules] = await db.execute(`
            SELECT s.*, d.name AS doctor_name, d.specialization 
            FROM appointment_schedules s
            JOIN doctors d ON s.doctor_id = d.id
            WHERE d.status = 'approved'
            ORDER BY s.schedule_date ASC, s.start_time ASC
        `);
        res.status(200).json({ success: true, message: 'Schedules fetched successfully', data: schedules });
    } catch (error) {
        console.error('Get schedules error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching schedules' });
    }
};

exports.getScheduleById = async (req, res) => {
    const { id } = req.params;
    try {
        const [schedules] = await db.execute(`
            SELECT s.*, d.name AS doctor_name, d.specialization 
            FROM appointment_schedules s
            JOIN doctors d ON s.doctor_id = d.id
            WHERE s.id = ? AND d.status = 'approved'
        `, [id]);

        if (schedules.length === 0) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        res.status(200).json({ success: true, message: 'Schedule fetched successfully', data: schedules[0] });
    } catch (error) {
        console.error('Get schedule by id error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching schedule' });
    }
};

exports.getSchedulesByDate = async (req, res) => {
    const { date } = req.params;
    const { specialization, doctor_id } = req.query;

    try {
        let baseQuery = `
            SELECT s.*, d.name AS doctor_name, d.specialization 
            FROM appointment_schedules s
            JOIN doctors d ON s.doctor_id = d.id
            WHERE s.schedule_date = ?
        `;
        const params = [date];

        if (specialization) {
            baseQuery += ' AND d.specialization = ?';
            params.push(specialization);
        }

        if (doctor_id) {
            baseQuery += ' AND s.doctor_id = ?';
            params.push(doctor_id);
        }

        baseQuery += " AND d.status = 'approved'";

        baseQuery += ' ORDER BY d.name ASC, s.start_time ASC';

        const [schedules] = await db.execute(baseQuery, params);
        res.status(200).json({ success: true, message: 'Schedules fetched successfully', data: schedules });
    } catch (error) {
        console.error('Get schedules by date error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching schedules' });
    }
};

exports.updateSchedule = async (req, res) => {
    const { id } = req.params;
    const { schedule_date, start_time, end_time, max_patients, status, price } = req.body;

    try {
        const [existing] = await db.execute('SELECT * FROM appointment_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        const schedule = existing[0];

        let updateQuery = 'UPDATE appointment_schedules SET ';
        const params = [];
        const updates = [];

        if (schedule_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (new Date(schedule_date) < today) {
                return res.status(400).json({ success: false, message: 'Schedule date cannot be in the past' });
            }
            updates.push('schedule_date = ?');
            params.push(schedule_date);
        }

        const newStartTime = start_time || schedule.start_time;
        const newEndTime = end_time || schedule.end_time;

        if (timeToMinutes(newEndTime) <= timeToMinutes(newStartTime)) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        if (start_time) { updates.push('start_time = ?'); params.push(start_time); }
        if (end_time) { updates.push('end_time = ?'); params.push(end_time); }

        if (max_patients !== undefined) {
            if (max_patients < schedule.booked_count) {
                return res.status(400).json({ success: false, message: 'Max patients cannot be less than already booked count' });
            }
            updates.push('max_patients = ?');
            params.push(max_patients);

            // Auto update status if expanding or shrinking capacity
            if (status === undefined) {
                if (max_patients > schedule.booked_count && schedule.status === 'full') {
                    updates.push('status = ?'); params.push('active');
                } else if (max_patients === schedule.booked_count && schedule.status === 'active') {
                    updates.push('status = ?'); params.push('full');
                }
            }
        }

        if (price !== undefined) {
            if (price < 0) {
                return res.status(400).json({ success: false, message: 'Price cannot be negative' });
            }
            updates.push('price = ?');
            params.push(price);
        }

        if (status) { updates.push('status = ?'); params.push(status); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        updateQuery += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        await db.execute(updateQuery, params);
        res.status(200).json({ success: true, message: 'Schedule updated successfully' });
    } catch (error) {
        console.error('Update schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error while updating schedule' });
    }
};

exports.updateScheduleStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'full', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    try {
        const [result] = await db.execute('UPDATE appointment_schedules SET status = ? WHERE id = ?', [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }
        res.status(200).json({ success: true, message: 'Schedule status updated successfully' });
    } catch (error) {
        console.error('Update schedule status error:', error);
        res.status(500).json({ success: false, message: 'Server error while updating schedule status' });
    }
};

exports.deleteSchedule = async (req, res) => {
    const { id } = req.params;
    try {
        const [existing] = await db.execute('SELECT * FROM appointment_schedules WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        if (existing[0].booked_count > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete schedule with existing bookings. Cancel it instead.' });
        }

        await db.execute('DELETE FROM appointment_schedules WHERE id = ?', [id]);
        res.status(200).json({ success: true, message: 'Schedule deleted successfully' });
    } catch (error) {
        console.error('Delete schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting schedule' });
    }
};
