// src/routes/patient.routes.ts
import { Router } from 'express';
import { patientController } from '../controllers/patient.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// PATIENT MANAGEMENT ROUTES
router.post('/guest-submit', patientController.submitGuestPatient);

// GET /api/patients - Get all patients
// Nurses can see all patients (but filtered data in controller)

router.get('/', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.getAllPatients);

// GET /api/patients/:id - Get a single patient by ID
// Nurses can see single patient details (but filtered data in controller)
router.get('/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.getPatientById);

// PUT /api/patients/:id - Update patient information
// Nurses should NOT be able to update patient info
router.put('/:id', authenticateToken, authorizeRoles(['owner', 'staff']), patientController.updatePatient);

// DENTAL RECORD MANAGEMENT ROUTES
// Nurses CAN create, view, update, and delete dental records

// POST /api/patients/:patientId/dental-records - Create a new dental record for a patient
router.post('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.createDentalRecord);

// GET /api/patients/:patientId/dental-records - Get all dental records for a specific patient
router.get('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.getDentalRecordsByPatientId);

// GET /api/patients/:patientId/dental-records/:recordId - Get a specific dental record for a patient
router.get('/:patientId/dental-records/:recordId', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.getSpecificDentalRecordForPatient);

// GET /api/dental-records/:id - Get a single dental record by its ID (global access)
router.get('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.getDentalRecordById);

// PUT /api/dental-records/:id - Update a dental record
router.put('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.updateDentalRecord);

// DELETE /api/dental-records/:id - Delete a dental record
router.delete('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), patientController.deleteDentalRecord);

export default router;
