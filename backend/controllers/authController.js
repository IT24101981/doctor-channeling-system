const crypto = require('crypto');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { sendMail } = require('../utils/emailSender');

const verifyRecaptcha = async (token) => {
    if (!token) return false;

    try {
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`
        );
        return response.data.success;
    } catch (error) {
        console.error('reCAPTCHA verification error:', error);
        return false;
    }
};

exports.registerPatient = async (req, res) => {
    const { firstName, secondName, email, phone, nic, password, recaptchaToken } = req.body;

    try {
        // Validation
        if (!firstName || !secondName || !email || !phone || !nic || !password) {
            return res.status(400).json({ message: 'All fields are required' });
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

        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long and contain both letters and numbers' });
        }

        // Verify reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA. Please try again.' });
        }

        // Check if user already exists
        const [existingUsers] = await db.execute(
            'SELECT * FROM patients WHERE email = ? OR nic = ?',
            [email, nic]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'User with this email or NIC already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const [result] = await db.execute(
            'INSERT INTO patients (first_name, second_name, email, phone, nic, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
            [firstName, secondName, email, phone, nic, hashedPassword]
        );

        res.status(201).json({ message: 'Patient registered successfully', userId: result.insertId });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

exports.staffLogin = async (req, res) => {
    const { username, password, role, recaptchaToken } = req.body;

    try {
        // Validation
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Verify reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA. Please try again.' });
        }

        // Check if user exists
        const [staffMembers] = await db.execute(
            'SELECT * FROM staff WHERE username = ?',
            [username]
        );

        if (staffMembers.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const staff = staffMembers[0];

        // Check Role
        if (staff.role !== role) {
            return res.status(401).json({ message: 'Invalid role for this user' });
        }

        // Check Account Status
        if (staff.account_status !== 'Active') {
            return res.status(403).json({ message: 'Account is not active. Please contact administrator.' });
        }

        // Verify Password
        const isMatch = await bcrypt.compare(password, staff.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: staff.id, username: staff.username, role: staff.role },
            process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production',
            { expiresIn: '8h' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: staff.id,
                username: staff.username,
                role: staff.role
            }
        });

    } catch (error) {
        console.error('Staff login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.registerDoctor = async (req, res) => {
    const { name, specialization, slmcId, nic, email, phone, hospital, password, recaptchaToken } = req.body;

    try {
        // Validation
        if (!name || !specialization || !slmcId || !nic || !email || !phone || !password) {
            return res.status(400).json({ message: 'Required fields are missing' });
        }

        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long and contain both letters and numbers' });
        }

        // Verify reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA. Please try again.' });
        }

        // Check if doctor already exists
        const [existingDoctors] = await db.execute(
            'SELECT * FROM doctors WHERE email = ? OR nic = ? OR slmc_id = ?',
            [email, nic, slmcId]
        );

        if (existingDoctors.length > 0) {
            const anyActive = existingDoctors.some(doc => doc.status !== 'canceled');
            if (anyActive) {
                return res.status(409).json({ message: 'Doctor with this email, NIC, or SLMC ID already exists' });
            } else {
                // All colliding records are canceled, we can safely overwrite the first one
                // with new details and set status back to pending
                const idToUpdate = existingDoctors[0].id;
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                
                await db.execute(
                    'UPDATE doctors SET name=?, specialization=?, slmc_id=?, nic=?, email=?, phone=?, hospital=?, password_hash=?, status=? WHERE id=?',
                    [name, specialization, slmcId, nic, email, phone, hospital || null, hashedPassword, 'pending', idToUpdate]
                );
                return res.status(201).json({ message: 'Doctor registered successfully', doctorId: idToUpdate });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new doctor
        const [result] = await db.execute(
            'INSERT INTO doctors (name, specialization, slmc_id, nic, email, phone, hospital, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, specialization, slmcId, nic, email, phone, hospital || null, hashedPassword, 'pending']
        );

        res.status(201).json({ message: 'Doctor registered successfully', doctorId: result.insertId });

    } catch (error) {
        console.error('Doctor registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

exports.login = async (req, res) => {
    const { email, password, recaptchaToken } = req.body;

    try {
        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Verify reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA. Please try again.' });
        }

        // Check patients table first
        const [patients] = await db.execute(
            'SELECT * FROM patients WHERE email = ?',
            [email]
        );

        if (patients.length > 0) {
            const patient = patients[0];
            const isMatch = await bcrypt.compare(password, patient.password_hash);

            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            return res.status(200).json({
                message: 'Login successful',
                userType: 'patient',
                user: {
                    id: patient.id,
                    first_name: patient.first_name,
                    second_name: patient.second_name,
                    email: patient.email,
                    phone: patient.phone,
                    nic: patient.nic
                }
            });
        }

        // Check doctors table
        const [doctors] = await db.execute(
            'SELECT * FROM doctors WHERE email = ?',
            [email]
        );

        if (doctors.length > 0) {
            const doctor = doctors[0];
            const isMatch = await bcrypt.compare(password, doctor.password_hash);

            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            if (doctor.status === 'canceled') {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            return res.status(200).json({
                message: 'Login successful',
                userType: 'doctor',
                user: {
                    id: doctor.id,
                    name: doctor.name,
                    email: doctor.email,
                    specialization: doctor.specialization,
                    status: doctor.status
                }
            });
        }

        // No user found
        return res.status(401).json({ message: 'Invalid credentials' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

async function findUserForPasswordReset(rawEmail) {
    const email = String(rawEmail || '').trim();
    if (!email) return null;

    const [patients] = await db.execute(
        'SELECT email FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email]
    );
    if (patients.length > 0) {
        return { userType: 'patient', canonicalEmail: patients[0].email };
    }

    const [doctors] = await db.execute(
        'SELECT email, status FROM doctors WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email]
    );
    if (doctors.length > 0) {
        if (doctors[0].status === 'canceled') {
            return { inactive: true };
        }
        return { userType: 'doctor', canonicalEmail: doctors[0].email };
    }

    return null;
}

exports.forgotPasswordRequest = async (req, res) => {
    const { email: rawEmail, recaptchaToken } = req.body;

    try {
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA. Please try again.' });
        }

        const account = await findUserForPasswordReset(rawEmail);
        if (!account) {
            return res.status(404).json({ message: 'No account found with this email address' });
        }
        if (account.inactive) {
            return res.status(403).json({
                message: 'This account is no longer active. Please contact support.'
            });
        }

        const canonicalEmail = account.canonicalEmail;
        const otp = String(crypto.randomInt(100000, 1000000));
        const otpHash = await bcrypt.hash(otp, await bcrypt.genSalt(10));
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db.execute('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [
            canonicalEmail
        ]);
        await db.execute(
            'INSERT INTO password_reset_otps (email, user_type, otp_hash, expires_at) VALUES (?, ?, ?, ?)',
            [canonicalEmail, account.userType, otpHash, expiresAt]
        );

        const text = `Your NCC eCare password reset code is: ${otp}\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.`;
        try {
            await sendMail({
                to: canonicalEmail,
                subject: 'Password reset verification code',
                text,
                html: `<p>Your NCC eCare password reset code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p><p style="color:#64748b;font-size:14px;">It expires in 15 minutes. If you did not request this, you can ignore this email.</p>`
            });
        } catch (mailErr) {
            console.error('Forgot password email error:', mailErr);
            await db.execute('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [
                canonicalEmail
            ]);
            return res.status(500).json({
                message: 'Could not send email. Check SMTP settings or try again later.'
            });
        }

        res.status(200).json({ message: 'Verification code sent to your email', email: canonicalEmail });
    } catch (error) {
        console.error('forgotPasswordRequest:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({
                message: 'Password reset is not set up on the server. Run the database migration for password_reset_otps.'
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

exports.forgotPasswordVerifyOtp = async (req, res) => {
    const { email: rawEmail, otp } = req.body;

    try {
        if (!rawEmail || otp === undefined || otp === null || String(otp).trim() === '') {
            return res.status(400).json({ message: 'Email and verification code are required' });
        }

        const account = await findUserForPasswordReset(rawEmail);
        if (!account || account.inactive) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }
        const canonicalEmail = account.canonicalEmail;

        const [rows] = await db.execute(
            'SELECT id, user_type, otp_hash, expires_at FROM password_reset_otps WHERE LOWER(email) = LOWER(?) LIMIT 1',
            [canonicalEmail]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'No reset request found. Request a new code from the login page.' });
        }

        const row = rows[0];
        if (new Date(row.expires_at) < new Date()) {
            await db.execute('DELETE FROM password_reset_otps WHERE id = ?', [row.id]);
            return res.status(400).json({ message: 'Code expired. Request a new one.' });
        }

        const ok = await bcrypt.compare(String(otp).trim(), row.otp_hash);
        if (!ok) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        await db.execute('DELETE FROM password_reset_otps WHERE id = ?', [row.id]);

        const resetToken = jwt.sign(
            {
                purpose: 'password_reset',
                email: canonicalEmail,
                userType: row.user_type
            },
            process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production',
            { expiresIn: '30m' }
        );

        res.status(200).json({ message: 'Verified', resetToken });
    } catch (error) {
        console.error('forgotPasswordVerifyOtp:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.forgotPasswordReset = async (req, res) => {
    const { resetToken, newPassword, confirmPassword } = req.body;

    try {
        if (!resetToken || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(String(newPassword))) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long and contain both letters and numbers' });
        }

        let payload;
        try {
            payload = jwt.verify(
                resetToken,
                process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production'
            );
        } catch {
            return res.status(400).json({
                message: 'Reset session expired. Start again from Forgot Password.'
            });
        }

        if (payload.purpose !== 'password_reset' || !payload.email || !payload.userType) {
            return res.status(400).json({ message: 'Invalid reset session' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        if (payload.userType === 'patient') {
            const [result] = await db.execute(
                'UPDATE patients SET password_hash = ? WHERE email = ?',
                [hashedPassword, payload.email]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Account not found' });
            }
        } else if (payload.userType === 'doctor') {
            const [result] = await db.execute(
                'UPDATE doctors SET password_hash = ? WHERE email = ?',
                [hashedPassword, payload.email]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Account not found' });
            }
        } else {
            return res.status(400).json({ message: 'Invalid account type' });
        }

        res.status(200).json({ message: 'Password updated successfully. You can sign in now.' });
    } catch (error) {
        console.error('forgotPasswordReset:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ── Admin: change own password ────────────────────────────────────────────────
exports.changeAdminPassword = async (req, res) => {
    const { username, newPassword } = req.body;

    try {
        if (!username || !newPassword) {
            return res.status(400).json({ message: 'Username and new password are required' });
        }
        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Verify the admin exists in the staff table
        const [rows] = await db.execute(
            'SELECT id FROM staff WHERE username = ? AND role = ?',
            [username, 'Admin']
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Admin account not found' });
        }

        // Hash and persist
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.execute(
            'UPDATE staff SET password_hash = ? WHERE username = ? AND role = ?',
            [hashedPassword, username, 'Admin']
        );

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('changeAdminPassword error:', error);
        res.status(500).json({ message: 'Server error while changing password' });
    }
};

// ── Any staff: change own password ───────────────────────────────────────────
exports.changeStaffPassword = async (req, res) => {
    const { username, newPassword } = req.body;

    try {
        if (!username || !newPassword) {
            return res.status(400).json({ message: 'Username and new password are required' });
        }
        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Find the staff member (any role)
        const [rows] = await db.execute(
            'SELECT id FROM staff WHERE username = ?',
            [username]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Staff account not found' });
        }

        // Hash and persist
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.execute(
            'UPDATE staff SET password_hash = ? WHERE username = ?',
            [hashedPassword, username]
        );

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('changeStaffPassword error:', error);
        res.status(500).json({ message: 'Server error while changing password' });
    }
};
