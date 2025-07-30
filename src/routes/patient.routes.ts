import { Router } from 'express';
import { patientController } from '../controllers/patient.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// --- PATIENT & FAMILY MANAGEMENT ROUTES ---

// POST /guest-submit - Create a new primary patient (now a Family Head). Publicly accessible.
router.post('/guest-submit', patientController.submitGuestPatient);

// NEW ROUTE: POST /guest-family-submit - Create a new family unit (Head + Members) at once. Publicly accessible.
router.post('/guest-family-submit', patientController.submitGuestFamilyPatient);

// POST /returning-guest-visit - Record a visit for a returning guest. Publicly accessible.
router.post('/returning-guest-visit', patientController.recordReturningGuestVisit);

// ADD MEMBER ROUTE: Add a family member to an existing patient (the Family Head).
// This requires authentication and specific user roles.
router.post(
    '/:headId/members',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'doctor']),
    patientController.addFamilyMember
);

// --- NEW ROUTE for today's returning patients ---
router.get(
    '/returning-today',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']),
    patientController.getTodaysReturningPatients
);

// GET / - Get all patients.
// Nurses can see all patients (data is filtered in the controller).
router.get('/', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getAllPatients);

// GET /:id - Get a single patient by ID.
// Nurses can see single patient details (data is filtered in the controller).
router.get('/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getPatientById);

// PUT /:id - Update patient information.
// Nurses cannot update general patient info.
router.put('/:id', authenticateToken, authorizeRoles(['owner', 'staff']), patientController.updatePatient);


// --- APPOINTMENT SCHEDULING & REMINDER ROUTES ---
// POST /:patientId/schedule-appointment - Schedule the next appointment for a patient.
router.post(
    '/:patientId/schedule-appointment',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'doctor','nurse']),
    patientController.scheduleNextAppointment
);

// NEW ROUTE: POST /:patientId/send-reminder - Send an appointment reminder email.
router.post(
    '/:patientId/send-reminder',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'doctor','nurse']),
    patientController.sendAppointmentReminder
);


// --- DENTAL RECORD MANAGEMENT ROUTES ---
// These routes do not require changes. They function correctly for any patient (head or member) using their unique ID.
// Nurses have full access to manage dental records.

// POST /:patientId/dental-records - Create a new dental record for a patient.
router.post('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.createDentalRecord);

// GET /:patientId/dental-records - Get all dental records for a specific patient.
router.get('/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getDentalRecordsByPatientId);

// GET /:patientId/dental-records/:recordId - Get a specific dental record for a patient.
router.get('/:patientId/dental-records/:recordId', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getSpecificDentalRecordForPatient);

// NOTE: The following routes are prefixed by the patient router's base path (e.g., /api/patients).
// So, '/dental-records/:id' actually maps to '/api/patients/dental-records/:id'.
// This is kept as-is to avoid breaking changes, but you might consider moving them to a dedicated dental-record router in the future.

// GET /dental-records/:id - Get a single dental record by its own ID.
router.get('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.getDentalRecordById);

// PUT /dental-records/:id - Update a dental record by its own ID.
router.put('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.updateDentalRecord);

// DELETE /dental-records/:id - Delete a dental record by its own ID.
router.delete('/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), patientController.deleteDentalRecord);

export default router;
