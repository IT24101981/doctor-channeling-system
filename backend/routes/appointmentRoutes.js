const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');

router.post('/', appointmentController.createAppointment);
router.post('/finalize', appointmentController.finalizeAppointment);

router.get('/schedule/:schedule_id', appointmentController.getAppointmentsBySchedule);
router.get('/patient/:patient_id', appointmentController.getPatientAppointments);
router.get('/doctor/:doctor_id', appointmentController.getDoctorAppointments);
router.put('/:id', appointmentController.updateAppointment);
router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
