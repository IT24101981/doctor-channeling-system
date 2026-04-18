const express = require('express');
const router = express.Router();
const adminStaffController = require('../controllers/adminStaffController');

router.get('/', adminStaffController.getAllStaff);
router.post('/', adminStaffController.createStaff);
router.put('/:id/reset-password', adminStaffController.resetStaffPassword);
router.put('/:id', adminStaffController.updateStaff);
router.delete('/:id', adminStaffController.deleteStaff);

module.exports = router;

