import { Router } from 'express';
import { websiteBookingController } from '../controllers/websiteBooking.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// --- PUBLIC ROUTE (No Auth) ---
router.post('/submit', websiteBookingController.submitBooking);

// --- PROTECTED ROUTES (For Internal Admin Panel) ---
router.get('/', authenticateToken, authorizeRoles(['owner', 'staff', 'doctor']), websiteBookingController.getAllBookings);
router.patch('/:id/status', authenticateToken, authorizeRoles(['owner', 'staff']), websiteBookingController.updateStatus);

// NEW: Manual reminder route
router.post('/:id/reminder', authenticateToken, authorizeRoles(['owner', 'staff']), websiteBookingController.sendReminder);

export default router;
