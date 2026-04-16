const db = require('../config/db');

exports.getDoctors = async (req, res) => {
    try {
        const { name, specialization, date } = req.query;

        let query = 'SELECT DISTINCT d.id, d.name, d.specialization, d.email, d.phone, d.hospital, d.consulting_fee FROM doctors d';
        const params = [];
        const whereClauses = [];

        if (date && date.trim() !== '') {
            query += ' JOIN doc_availability_slots s ON d.id = s.doctor_id';
            whereClauses.push('s.day_of_week = DAYNAME(?)');
            params.push(date);
            whereClauses.push('s.is_available = 1');
        }

        if (name && name.trim() !== '') {
            whereClauses.push('d.name LIKE ?');
            params.push(`%${name.trim()}%`);
        }

        if (specialization && specialization.trim() !== '') {
            whereClauses.push('d.specialization = ?');
            params.push(specialization.trim());
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        // Use db.query (not db.execute) for dynamically built queries
        const [doctors] = await db.query(query, params);

        res.status(200).json({
            message: 'Doctors fetched successfully',
            doctors: doctors
        });

    } catch (error) {
        console.error('Error fetching doctors:', error);
        res.status(500).json({ message: 'Server error while fetching doctors' });
    }
};


exports.getSpecializations = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT DISTINCT specialization FROM doctors ORDER BY specialization ASC'
        );
        const specializations = rows.map(r => r.specialization);
        res.status(200).json({ specializations });
    } catch (error) {
        console.error('Error fetching specializations:', error);
        res.status(500).json({ message: 'Server error while fetching specializations' });
    }
};

exports.deleteDoctorAccount = async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await db.getConnection();

        // Get current date in Sri Lanka timezone (Asia/Colombo)
        const slDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });

        // Check for upcoming or ongoing appointments
        const [upcomingSlots] = await connection.execute(
            "SELECT id FROM appointment_schedules WHERE doctor_id = ? AND schedule_date >= ?",
            [id, slDate]
        );

        if (upcomingSlots.length > 0) {
            return res.status(400).json({ 
                message: 'Cannot delete doctor account. There are upcoming or ongoing appointments.' 
            });
        }

        await connection.beginTransaction();

        // 1. Delete from doctors
        const [result] = await connection.execute("DELETE FROM doctors WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Doctor account not found' });
        }

        await connection.commit();
        res.status(200).json({ message: 'Doctor account and all associated data successfully deleted' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error deleting account:', error);
        res.status(500).json({ message: 'Server error while deleting account' });
    } finally {
        if (connection) connection.release();
    }
};

exports.getDoctorDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [doctors] = await db.execute(
            'SELECT id, name, specialization, slmc_id, nic, email, phone, hospital, consulting_fee, status FROM doctors WHERE id = ?',
            [id]
        );
        if (doctors.length === 0) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        res.status(200).json(doctors[0]);
    } catch (error) {
        console.error('Error fetching doctor details:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateDoctorProfile = async (req, res) => {
    const { id } = req.params;
    const { name, specialization, slmc_id, nic, email, phone, hospital, consulting_fee } = req.body;
    try {
        const [result] = await db.execute(
            'UPDATE doctors SET name=?, specialization=?, slmc_id=?, nic=?, email=?, phone=?, hospital=?, consulting_fee=? WHERE id=?',
            [name, specialization, slmc_id, nic, email, phone, hospital, consulting_fee, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        res.status(200).json({ message: 'Doctor profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
