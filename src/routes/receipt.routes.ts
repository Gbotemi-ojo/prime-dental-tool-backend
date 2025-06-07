// src/routes/receipt.routes.ts
import { Router } from 'express';
import { receiptController } from '../controllers/receipt.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// POST /api/receipts/send - Send a receipt email
// Accessible by 'owner', 'staff', and 'nurse' roles (as per requirement, nurse can send)
router.post('/send', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse']), receiptController.sendReceipt);

export default router;