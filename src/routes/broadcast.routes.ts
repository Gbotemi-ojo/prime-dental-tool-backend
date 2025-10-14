// src/routes/broadcast.routes.ts
import { Router } from 'express';
import { broadcastController } from '../controllers/broadcast.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();
const allowedRoles = ['owner', 'staff'];

// GET /birthday-list - Get patients with a birthday today
router.get(
    '/birthday-list',
    authenticateToken,
    authorizeRoles(allowedRoles),
    broadcastController.getTodaysBirthdays
);

// POST /birthday - Trigger sending birthday emails for today
router.post(
    '/birthday',
    authenticateToken,
    authorizeRoles(allowedRoles),
    broadcastController.sendBirthdayBroadcast
);

// POST /custom - Send a custom message to all patients and staff
router.post(
    '/custom',
    authenticateToken,
    authorizeRoles(allowedRoles),
    broadcastController.sendCustomBroadcast
);

// NEW: POST /direct-message/:patientId - Send a direct message to one patient
router.post(
    '/direct-message/:patientId',
    authenticateToken,
    authorizeRoles(allowedRoles),
    broadcastController.sendDirectMessage
);

// GET /phone-numbers - Get all patient phone numbers comma-separated
router.get(
    '/phone-numbers',
    authenticateToken,
    authorizeRoles(allowedRoles),
    broadcastController.getAllPhoneNumbers
);

export default router;
