const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendMail } = require('../utils/emailSender');

// Get all staff members
exports.getAllStaff = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, username, role, account_status, phone_number, email, created_at FROM staff');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({ message: 'Server error while fetching staff' });
    }
};

// Create a new staff member
exports.createStaff = async (req, res) => {
    const { username, password, role, phone_number, email, account_status } = req.body;

    try {
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Username, password, and role are required' });
        }

        // Check if username already exists
        const [existing] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const trimmedEmail =
            email && String(email).trim() !== '' ? String(email).trim() : null;
        const trimmedPhone =
            phone_number != null && String(phone_number).trim() !== ''
                ? String(phone_number).trim()
                : null;

        if (trimmedEmail) {
            const [emailRows] = await db.execute('SELECT id FROM staff WHERE email = ?', [trimmedEmail]);
            if (emailRows.length > 0) {
                return res.status(409).json({ message: 'Email already exists' });
            }
        }
        if (trimmedPhone) {
            const [phoneRows] = await db.execute('SELECT id FROM staff WHERE phone_number = ?', [trimmedPhone]);
            if (phoneRows.length > 0) {
                return res.status(409).json({ message: 'Phone number already exists' });
            }
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert into database
        const [result] = await db.execute(
            'INSERT INTO staff (username, password_hash, role, account_status, phone_number, email) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, role, account_status || 'Active', trimmedPhone, trimmedEmail]
        );

        // If email is provided, send credentials to the staff member.
        let emailSent = false;
        let emailProvider = null;
        if (trimmedEmail) {
            const baseUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
            const staffLoginUrl = baseUrl ? `${baseUrl}/ecare/staff-login` : null;

            const subject = 'Your NCC eCare staff account credentials';
            const text =
                `Hello ${username},\n\n` +
                `An NCC eCare staff account has been created for you.\n\n` +
                `Username: ${username}\n` +
                `Password: ${password}\n` +
                `Role: ${role}\n` +
                (staffLoginUrl ? `\nStaff login: ${staffLoginUrl}\n` : '') +
                `\nFor security, please sign in and change your password as soon as possible.\n`;

            try {
                const result = await sendMail({
                    to: trimmedEmail,
                    subject,
                    text,
                    html:
                        `<p>Hello <b>${username}</b>,</p>` +
                        `<p>An NCC eCare staff account has been created for you.</p>` +
                        `<p><b>Username:</b> ${username}<br>` +
                        `<b>Password:</b> ${password}<br>` +
                        `<b>Role:</b> ${role}</p>` +
                        (staffLoginUrl
                            ? `<p><b>Staff login:</b> <a href="Cick here to login">https://nccecare.vercel.app/eCare/staff-login</a></p>`
                            : '') +
                        `<p style="color:#64748b;font-size:14px;">For security, please sign in and change your password as soon as possible.</p>`
                });
                if (result && result.sent === true) {
                    emailSent = true;
                    emailProvider = result.provider || null;
                }
            } catch (err) {
                console.error('Error sending staff credentials email:', err);
            }
        }

        res.status(201).json({
            message: 'Staff created successfully',
            id: result.insertId,
            emailSent,
            ...(emailProvider ? { emailProvider } : {})
        });
    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ message: 'Server error while creating staff' });
    }
};

// Update an existing staff member
exports.updateStaff = async (req, res) => {
    const id = req.params.id;
    const { username, password, role, phone_number, email, account_status } = req.body;

    try {
        // Fetch current staff member
        const [staff] = await db.execute('SELECT * FROM staff WHERE id = ?', [id]);
        if (staff.length === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        const trimmedEmail =
            email != null && String(email).trim() !== '' ? String(email).trim() : null;
        const trimmedPhone =
            phone_number != null && String(phone_number).trim() !== ''
                ? String(phone_number).trim()
                : null;

        if (trimmedEmail) {
            const [emailRows] = await db.execute('SELECT id FROM staff WHERE email = ? AND id != ?', [
                trimmedEmail,
                id
            ]);
            if (emailRows.length > 0) {
                return res.status(409).json({ message: 'Email already exists' });
            }
        }
        if (trimmedPhone) {
            const [phoneRows] = await db.execute(
                'SELECT id FROM staff WHERE phone_number = ? AND id != ?',
                [trimmedPhone, id]
            );
            if (phoneRows.length > 0) {
                return res.status(409).json({ message: 'Phone number already exists' });
            }
        }

        let updateQuery = 'UPDATE staff SET username = ?, role = ?, account_status = ?, phone_number = ?, email = ?';
        let queryParams = [username, role, account_status, trimmedPhone, trimmedEmail];

        // Only update password if provided
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            updateQuery += ', password_hash = ?';
            queryParams.push(hashedPassword);
        }

        updateQuery += ' WHERE id = ?';
        queryParams.push(id);

        await db.execute(updateQuery, queryParams);

        res.status(200).json({ message: 'Staff updated successfully' });
    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ message: 'Server error while updating staff' });
    }
};

// Delete a staff member
exports.deleteStaff = async (req, res) => {
    const id = req.params.id;

    try {
        const [result] = await db.execute('DELETE FROM staff WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        res.status(200).json({ message: 'Staff deleted successfully' });
    } catch (error) {
        console.error('Error deleting staff:', error);
        res.status(500).json({ message: 'Server error while deleting staff' });
    }
};

// Reset staff password — generates a new random password, hashes it, and saves it
exports.resetStaffPassword = async (req, res) => {
    const id = req.params.id;

    try {
        // Verify the staff member exists
        const [staff] = await db.execute('SELECT id FROM staff WHERE id = ?', [id]);
        if (staff.length === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        // Generate a secure random password (10 chars, upper + lower + digits)
        const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lower = 'abcdefghjkmnpqrstuvwxyz';
        const nums  = '23456789';
        const all   = upper + lower + nums;

        let pwdChars = [
            upper[Math.floor(Math.random() * upper.length)],
            upper[Math.floor(Math.random() * upper.length)],
            lower[Math.floor(Math.random() * lower.length)],
            lower[Math.floor(Math.random() * lower.length)],
            nums[Math.floor(Math.random()  * nums.length)],
            nums[Math.floor(Math.random()  * nums.length)],
        ];
        for (let i = pwdChars.length; i < 10; i++) {
            pwdChars.push(all[Math.floor(Math.random() * all.length)]);
        }
        // Shuffle
        for (let i = pwdChars.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
        }
        const newPassword = pwdChars.join('');

        // Hash and persist
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.execute('UPDATE staff SET password_hash = ? WHERE id = ?', [hashedPassword, id]);

        res.status(200).json({
            message: 'Password reset successful',
            newPassword: newPassword
        });
    } catch (error) {
        console.error('Error resetting staff password:', error);
        res.status(500).json({ message: 'Server error while resetting password' });
    }
};
