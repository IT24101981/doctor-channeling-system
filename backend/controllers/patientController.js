const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/profiles';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const patientId = req.params.id;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `patient-${patientId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
}).single('profilePhoto');

exports.getProfile = async (req, res) => {
    const { id } = req.params;
    console.log(`GET /api/patient/${id} - Fetching profile`);
    try {

        const [patients] = await db.execute(
            'SELECT id, first_name, second_name, email, phone, nic, profile_photo FROM patients WHERE id = ?',
            [id]
        );

        if (patients.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        res.status(200).json({ patient: patients[0] });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Server error while fetching profile' });
    }
};

exports.updateProfile = async (req, res) => {
    const { id } = req.params;
    const { firstName, secondName, phone } = req.body;
    console.log(`PUT /api/patient/${id} - Updating profile:`, { firstName, secondName, phone });

    try {
        if (!firstName || !secondName || !phone) {
            console.log(`Update failed - missing fields for ID ${id}:`, { firstName, secondName, phone });
            return res.status(400).json({ message: 'Required fields are missing' });
        }

        const nameRegex = /^[A-Za-z\s]+$/;
        const phoneRegex = /^0\d{9}$/;

        if (!nameRegex.test(firstName)) {
            return res.status(400).json({ message: 'First name should only contain characters' });
        }
        if (!nameRegex.test(secondName)) {
            return res.status(400).json({ message: 'Second name should only contain characters' });
        }
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Invalid phone number format' });
        }

        console.log(`Executing SQL: UPDATE patients SET first_name = '${firstName}', second_name = '${secondName}', phone = '${phone}' WHERE id = ${parseInt(id)}`);

        const [result] = await db.execute(
            'UPDATE patients SET first_name = ?, second_name = ?, phone = ? WHERE id = ?',
            [firstName, secondName, phone, parseInt(id)]
        );

        console.log('SQL Result:', result);

        if (result.affectedRows === 0) {
            console.log(`Update failed - no patient found with ID ${id}`);
            return res.status(404).json({ message: 'Patient not found' });
        }

        console.log(`Update successful for ID ${id}. affectedRows: ${result.affectedRows}`);
        res.status(200).json({
            message: 'Profile updated successfully',
            updatedId: id,
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error(`CRITICAL error updating profile for ID ${id}:`, error);
        res.status(500).json({
            message: 'Server error while updating profile',
            error: error.message,
            stack: error.stack
        });
    }
};




exports.uploadPhoto = (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a file' });
        }

        const { id } = req.params;
        const photoPath = `/uploads/profiles/${req.file.filename}`;

        try {
            // Delete old photo if it exists
            const [patients] = await db.execute('SELECT profile_photo FROM patients WHERE id = ?', [id]);
            if (patients.length > 0 && patients[0].profile_photo) {
                // Remove leading slash if it exists for path.join
                const relativePath = patients[0].profile_photo.startsWith('/') ? patients[0].profile_photo.substring(1) : patients[0].profile_photo;
                const oldPath = path.join(__dirname, '..', relativePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }


            const [result] = await db.execute(
                'UPDATE patients SET profile_photo = ? WHERE id = ?',
                [photoPath, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Patient not found' });
            }

            res.status(200).json({
                message: 'Photo uploaded successfully',
                profilePhoto: photoPath
            });
        } catch (error) {
            console.error('Error uploading photo:', error);
            res.status(500).json({ message: 'Server error while uploading photo' });
        }
    });
};

exports.deleteProfile = async (req, res) => {
    const { id } = req.params;
    console.log(`DELETE /api/patient/${id} - Deleting profile`);
    try {

        // Delete profile photo from disk first
        const [patients] = await db.execute('SELECT profile_photo FROM patients WHERE id = ?', [id]);
        if (patients.length > 0 && patients[0].profile_photo) {
            const photoPath = path.join(__dirname, '..', patients[0].profile_photo);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        // Option 2: keep related records in other tables.
        // The DB foreign keys should be configured with `ON DELETE SET NULL`
        // so deleting the patient doesn't delete history rows.
        const [result] = await db.execute('DELETE FROM patients WHERE id = ?', [parseInt(id)]);

        if (result.affectedRows === 0) {
            console.log(`Delete failed - no patient found with ID ${id}`);
            return res.status(404).json({ message: 'Patient not found' });
        }

        console.log(`Delete successful for ID ${id}`);
        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error(`Error deleting profile for ID ${id}:`, error);
        res.status(500).json({ message: 'Server error while deleting profile', error: error.message });
    }
};


