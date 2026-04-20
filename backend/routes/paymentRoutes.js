const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyStaffToken } = require('../middleware/authMiddleware');

// Public routes (used by patients and PayHere)
router.get('/details', paymentController.getPaymentDetails);
router.post('/generate-hash', paymentController.generateHash);
router.post('/reserve-checkout', paymentController.reserveCheckout);
router.post('/notify', paymentController.handleNotification);
router.get('/status/:orderID', paymentController.getPaymentStatus);

// Cashier-only routes (require staff JWT)
router.get('/all-transactions', verifyStaffToken, paymentController.getAllPaymentsForCashier);
router.put('/update-status/:orderID', verifyStaffToken, paymentController.updatePaymentStatus);
router.post('/refund/:orderID', verifyStaffToken, paymentController.processRefund);
router.delete('/delete-old', verifyStaffToken, paymentController.deleteOldPayments);
router.delete('/delete-sandbox', verifyStaffToken, paymentController.deleteSandboxPayments);

module.exports = router;