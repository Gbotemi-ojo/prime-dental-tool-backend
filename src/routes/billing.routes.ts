// src/routes/billing.routes.ts
import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// PUBLIC ROUTE - For invoice/receipt pages to get data
router.get('/options', billingController.getBillingOptions);

// --- ADMIN ROUTES FOR MANAGING SERVICES ---
router.post(
    '/services',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // UPDATED: More restrictive
    billingController.createServiceItem
);

router.put(
    '/services/:id',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // UPDATED: More restrictive
    billingController.updateServiceItem
);

// NEW: Delete a service
router.delete(
    '/services/:id',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // Only owner can delete
    billingController.deleteServiceItem
);


// --- ADMIN ROUTES FOR MANAGING HMOS ---
router.post(
    '/hmos',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // UPDATED: More restrictive
    billingController.createHmoProvider
);

router.put(
    '/hmos/:id',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // UPDATED: More restrictive
    billingController.updateHmoProvider
);

// NEW: Delete an HMO
router.delete(
    '/hmos/:id',
    authenticateToken,
    authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), // Only owner can delete
    billingController.deleteHmoProvider
);

export default router;
