// src/routes/invoice.routes.ts
import { Router } from 'express';
import { invoiceController } from '../controllers/invoice.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// POST /api/invoices/send - Send an invoice email
// Accessible by 'owner', 'staff', and 'nurse' roles (as per requirement, nurse can send)
router.post('/send', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), invoiceController.sendInvoice);

export default router;
