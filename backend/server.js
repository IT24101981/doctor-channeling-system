const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const supportRoutes = require('./routes/supportRoutes');
const availabilityRoutes = require('./routes/availabilityRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const refundRequestRoutes = require('./routes/refundRequestRoutes');

// Always load backend/.env regardless of CWD (root scripts vs backend scripts).
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: comma-separated origins in FRONTEND_URL (e.g. prod + Vercel preview URLs)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Middleware
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/refund-requests', refundRequestRoutes);

// Admin Routes
app.use('/api/admin/doctors', require('./routes/adminDoctorRoutes'));
app.use('/api/admin/staff', require('./routes/adminStaffRoutes'));
app.use('/api/admin/users', require('./routes/adminUserRoutes'));
app.use("/api/admin/doctor-requests", require("./routes/adminDoctorApprovalRoutes"));

// Test Route
app.get('/', (req, res) => {
    res.send('Doctor Channeling System API is running');
});

// Start Server (only when not in Vercel)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
