const db = require('../config/db');

// Patient: Create a new support ticket
exports.createTicket = async (req, res) => {
    const { patientId, patientName, patientEmail, subject, description } = req.body;
    let attachmentPath = null;
    
    // multer stores the file in req.file
    if (req.file) {
        attachmentPath = req.file.path.replace(/\\/g, '/'); // Normalize path
    }

    try {
        if (!patientId || !patientName || !patientEmail || !subject || !description) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const [result] = await db.execute(
            'INSERT INTO support_tickets (patient_id, patient_name, patient_email, subject, description, attachment_path) VALUES (?, ?, ?, ?, ?, ?)',
            [patientId, patientName, patientEmail, subject, description, attachmentPath]
        );

        res.status(201).json({ message: 'Ticket created successfully', ticketId: result.insertId });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ message: 'Server error while creating ticket' });
    }
};

// Patient: Get tickets by patient ID
exports.getTicketsByPatient = async (req, res) => {
    const { patientId } = req.params;

    try {
        const [tickets] = await db.execute(
            `SELECT id, patient_id, patient_name, patient_email, subject, description, status, hr_reply, attachment_path, created_at, updated_at 
             FROM support_tickets 
             WHERE patient_id = ? AND is_deleted = 0 
             ORDER BY created_at DESC`,
            [patientId]
        );

        res.status(200).json({ tickets });
    } catch (error) {
        console.error('Error fetching patient tickets:', error);
        res.status(500).json({ message: 'Server error while fetching tickets' });
    }
};

// Patient: Soft delete a ticket
exports.deleteTicket = async (req, res) => {
    const { ticketId } = req.params;
    const { patientId } = req.body;

    try {
        // Verify the ticket belongs to this patient
        const [tickets] = await db.execute(
            'SELECT * FROM support_tickets WHERE id = ? AND patient_id = ?',
            [ticketId, patientId]
        );

        if (tickets.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        // Soft delete
        await db.execute(
            'UPDATE support_tickets SET is_deleted = 1 WHERE id = ?',
            [ticketId]
        );

        res.status(200).json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({ message: 'Server error while deleting ticket' });
    }
};

// HR Staff: Get all tickets (non-deleted)
exports.getAllTickets = async (req, res) => {
    try {
        const [tickets] = await db.execute(
            `SELECT st.id, st.patient_id, st.patient_name, st.patient_email, st.subject, st.description, st.status, 
                    st.hr_reply, st.attachment_path, st.created_at, st.updated_at,
                    p.first_name, p.second_name, p.phone AS patient_phone
             FROM support_tickets st
             LEFT JOIN patients p ON st.patient_id = p.id
             WHERE st.is_deleted = 0
             ORDER BY st.created_at DESC`
        );

        res.status(200).json({ tickets });
    } catch (error) {
        console.error('Error fetching all tickets:', error);
        res.status(500).json({ message: 'Server error while fetching tickets' });
    }
};

// HR Staff: Update ticket status (Pending / Resolved / Rejected)
exports.updateTicketStatus = async (req, res) => {
    const { id } = req.params;
    const { status, hr_reply } = req.body;

    try {
        if (!status || !['Pending', 'Resolved', 'Rejected', 'In Progress'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const [result] = await db.execute(
            'UPDATE support_tickets SET status = ?, hr_reply = ?, has_new_update = 1 WHERE id = ? AND is_deleted = 0',
            [status, hr_reply || null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.status(200).json({ message: 'Ticket status updated successfully' });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({ message: 'Server error while updating ticket status' });
    }
};

// HR Staff: Soft delete a ticket
exports.softDeleteTicket = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.execute(
            'UPDATE support_tickets SET is_deleted = 1 WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.status(200).json({ message: 'Ticket soft deleted successfully' });
    } catch (error) {
        console.error('Error soft deleting ticket:', error);
        res.status(500).json({ message: 'Server error while soft deleting ticket' });
    }
};

// Patient: Check for unseen updates
exports.checkUnseenUpdates = async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await db.execute(
            'SELECT COUNT(*) as count FROM support_tickets WHERE patient_id = ? AND has_new_update = 1 AND is_deleted = 0',
            [patientId]
        );
        res.status(200).json({ hasUpdates: rows[0].count > 0 });
    } catch (error) {
        console.error('Error checking updates:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Patient: Mark tickets as seen
exports.markTicketsAsSeen = async (req, res) => {
    const { patientId } = req.params;
    try {
        await db.execute(
            'UPDATE support_tickets SET has_new_update = 0 WHERE patient_id = ?',
            [patientId]
        );
        res.status(200).json({ message: 'Tickets marked as seen' });
    } catch (error) {
        console.error('Error marking tickets as seen:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
