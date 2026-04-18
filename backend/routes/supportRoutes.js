const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type! Only PDF, JPG, JPEG, and PNG are allowed.'));
    }
});

// Patient routes
router.post('/tickets', upload.single('attachment'), supportController.createTicket);
router.get('/tickets/patient/:patientId', supportController.getTicketsByPatient);
router.delete('/tickets/:ticketId', supportController.deleteTicket);
router.get('/tickets/patient/:patientId/updates', supportController.checkUnseenUpdates);
router.put('/tickets/patient/:patientId/seen', supportController.markTicketsAsSeen);

// HR Staff routes
router.get('/tickets/all', supportController.getAllTickets);
router.get('/tickets', supportController.getAllTickets); // Compatibility alias
router.put('/tickets/:id/status', supportController.updateTicketStatus);
router.put('/tickets/:id/soft-delete', supportController.softDeleteTicket);

module.exports = router;
