const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/signup', authController.registerPatient);
router.post('/doctor/signup', authController.registerDoctor);
router.post('/login', authController.login);
router.post('/staff-login', authController.staffLogin);
router.post('/forgot-password/request', authController.forgotPasswordRequest);
router.post('/forgot-password/verify-otp', authController.forgotPasswordVerifyOtp);
router.post('/forgot-password/reset', authController.forgotPasswordReset);
router.put('/admin/change-password', authController.changeAdminPassword);
router.put('/staff/change-password', authController.changeStaffPassword);

module.exports = router;
