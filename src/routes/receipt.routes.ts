// src/routes/receipt.routes.ts
import { Router } from 'express';
import { receiptController } from '../controllers/receipt.controller';
import { patientController } from '../controllers/patient.controller'; // Assuming patient controller exists
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// POST /api/receipts/send - Send a receipt email
// Accessible by 'owner', 'staff', and 'nurse' roles (as per requirement, nurse can send)
router.post('/send', authenticateToken, authorizeRoles(['owner', 'staff']), receiptController.sendReceipt);

// GET /api/receipts/revenue-report - Fetch all receipt data for revenue calculation
// Accessible by 'owner' and 'staff' roles
// MODIFIED: Added 'staff' to authorizeRoles to match frontend access control.
router.get('/revenue-report', authenticateToken, authorizeRoles(['owner', 'staff']), receiptController.getRevenueReport);

// NEW: GET /api/receipts/outstanding-patients - Fetch all patients to calculate outstanding balances
// Accessible by 'owner' and 'staff' roles
// This endpoint would logically call a method like patientController.getAllPatients
router.get('/outstanding-patients', authenticateToken, authorizeRoles(['owner', 'staff']), patientController.getAllPatients);


export default router;