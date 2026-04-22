const db = require('../config/db');

// Get all availability slots for a doctor
exports.getAvailability = async (req, res) => {
    try {
        const doctorId = req.params.doctorId;

        const [slots] = await db.execute(
            'SELECT * FROM doc_availability_slots WHERE doctor_id = ?',
            [doctorId]
        );

        // Convert integer boolean to true/false for frontend
        const formattedSlots = slots.map(slot => ({
            ...slot,
            is_available: !!slot.is_available
        }));

        res.status(200).json(formattedSlots);
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ message: 'Server error fetching availability' });
    }
};

// Get all availability slots where is_available = 1 joined with doctors table
exports.getAllAvailability = async (req, res) => {
    try {
        const [slots] = await db.execute(`
            SELECT a.*, d.name AS doctor_name, d.specialization, d.consulting_fee
            FROM doc_availability_slots a
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.is_available = 1 AND d.status = 'approved'
            ORDER BY a.day_of_week ASC, a.start_time ASC
        `);

        const formattedSlots = slots.map(slot => ({
            ...slot,
            is_available: !!slot.is_available,
            Marked: !!slot.Marked
        }));

        res.status(200).json(formattedSlots);
    } catch (error) {
        console.error('Error fetching all availability:', error);
        res.status(500).json({ message: 'Server error fetching all availability' });
    }
};

// Add new availability slot
exports.createSlot = async (req, res) => {
    try {
        const { doctor_id, day_of_week, start_time, end_time, capacity, is_available, slot_duration } = req.body;

        const [result] = await db.execute(
            `INSERT INTO doc_availability_slots 
            (doctor_id, day_of_week, start_time, end_time, capacity, is_available, slot_duration) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [doctor_id, day_of_week, start_time, end_time, capacity, is_available ? 1 : 0, slot_duration]
        );

        res.status(201).json({
            message: 'Slot created successfully',
            slotId: result.insertId
        });
    } catch (error) {
        console.error('Error creating slot:', error);
        res.status(500).json({ message: 'Server error creating slot' });
    }
};

// Update availability slot
exports.updateSlot = async (req, res) => {
    try {
        const slotId = req.params.id;
        const { day_of_week, start_time, end_time, capacity, is_available, slot_duration } = req.body;

        await db.execute(
            `UPDATE doc_availability_slots 
            SET day_of_week = ?, start_time = ?, end_time = ?, capacity = ?, is_available = ?, slot_duration = ?, Marked = 0
            WHERE id = ?`,
            [day_of_week, start_time, end_time, capacity, is_available ? 1 : 0, slot_duration, slotId]
        );

        res.status(200).json({ message: 'Slot updated successfully' });
    } catch (error) {
        console.error('Error updating slot:', error);
        res.status(500).json({ message: 'Server error updating slot' });
    }
};

// Delete availability slot
exports.deleteSlot = async (req, res) => {
    try {
        const slotId = req.params.id;

        await db.execute('DELETE FROM doc_availability_slots WHERE id = ?', [slotId]);

        res.status(200).json({ message: 'Slot deleted successfully' });
    } catch (error) {
        console.error('Error deleting slot:', error);
        res.status(500).json({ message: 'Server error deleting slot' });
    }
};

// Toggle slot status
exports.toggleStatus = async (req, res) => {
    try {
        const slotId = req.params.id;
        const { is_available } = req.body;

        await db.execute(
            'UPDATE doc_availability_slots SET is_available = ? WHERE id = ?',
            [is_available ? 1 : 0, slotId]
        );

        res.status(200).json({ message: 'Slot status updated successfully' });
    } catch (error) {
        console.error('Error toggling slot status:', error);
        res.status(500).json({ message: 'Server error toggling slot status' });
    }
};

// Toggle Marked status
exports.toggleMarked = async (req, res) => {
    try {
        const slotId = req.params.id;

        // Fetch current status
        const [slots] = await db.execute('SELECT Marked FROM doc_availability_slots WHERE id = ?', [slotId]);
        if (slots.length === 0) {
            return res.status(404).json({ message: 'Slot not found' });
        }

        const currentMarked = slots[0].Marked;
        const newMarked = currentMarked ? 0 : 1;

        await db.execute(
            'UPDATE doc_availability_slots SET Marked = ? WHERE id = ?',
            [newMarked, slotId]
        );

        res.status(200).json({ message: 'Slot marked status updated successfully', Marked: !!newMarked });
    } catch (error) {
        console.error('Error toggling marked status:', error);
        res.status(500).json({ message: 'Server error toggling marked status' });
    }
};
