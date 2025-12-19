// src/routes/report.routes.ts
import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Everyone (staff, owner, nurse, doctor) can WRITE
router.post('/', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), reportController.submitReport);

// Only OWNER can READ
router.get('/', authenticateToken, authorizeRoles(['owner']), reportController.getReports);

export default router;
