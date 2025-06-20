// src/routes/patient.routes.ts
import { Router } from 'express';
import { patientController } from '../controllers/patient.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// PATIENT MANAGEMENT ROUTES
router.post('/guest-submit', patientController.submitGuestPatient);

// NEW ROUTE: Record a visit for a returning guest (logs to Google Sheets)
// This route remains public as per previous discussion
router.post('/returning-guest-visit', patientController.recordReturningGuestVisit);

// GET /api/patients - Get all patients
// Nurses can see all patients (but filtered data in controller)
router.get('/', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getAllPatients); // Added 'doctor'

// GET /api/patients/:id - Get a single patient by ID
// Nurses can see single patient details (but filtered data in controller)
router.get('/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getPatientById); // Added 'doctor'

// PUT /api/patients/:id - Update patient information
// Nurses should NOT be able to update patient info
router.put('/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'doctor']), patientController.updatePatient); // Added 'doctor'

// DENTAL RECORD MANAGEMENT ROUTES
// Nurses CAN create, view, update, and delete dental records

// POST /api/patients/:patientId/dental-records - Create a new dental record for a patient
router.post('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.createDentalRecord); // Added 'doctor'

// GET /api/patients/:patientId/dental-records - Get all dental records for a specific patient
router.get('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getDentalRecordsByPatientId); // Added 'doctor'

// GET /api/patients/:patientId/dental-records/:recordId - Get a specific dental record for a patient
router.get('/:patientId/dental-records/:recordId', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getSpecificDentalRecordForPatient); // Added 'doctor'

// GET /api/dental-records/:id - Get a single dental record by its ID (global access)
router.get('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getDentalRecordById); // Added 'doctor'

// PUT /api/dental-records/:id - Update a dental record
router.put('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.updateDentalRecord); // Added 'doctor'

// DELETE /api/dental-records/:id - Delete a dental record
router.delete('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.deleteDentalRecord); // Added 'doctor'

export default router;