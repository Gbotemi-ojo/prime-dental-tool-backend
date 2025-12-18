import { Router } from 'express';
import { websiteBookingController } from '../controllers/websiteBooking.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// --- PUBLIC ROUTE (No Auth) ---
// Use this endpoint on your separate frontend website form
router.post('/submit', websiteBookingController.submitBooking);

// --- PROTECTED ROUTES (For Internal Admin Panel) ---
router.get('/', authenticateToken, authorizeRoles(['owner', 'staff', 'doctor']), websiteBookingController.getAllBookings);
router.patch('/:id/status', authenticateToken, authorizeRoles(['owner', 'staff']), websiteBookingController.updateStatus);

export default router;
