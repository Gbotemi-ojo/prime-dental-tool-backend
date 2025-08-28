import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

/**
 * GET /api/settings
 * Retrieves the current dashboard permission settings.
 * Accessible to any authenticated user.
 */
router.get(
    '/',
    authenticateToken,
    settingsController.getDashboardSettings
);

/**
 * PUT /api/settings
 * Updates the dashboard permission settings.
 * Restricted to users with the 'owner' role.
 */
router.put(
    '/',
    authenticateToken,
    authorizeRoles(['owner']),
    settingsController.updateDashboardSettings
);

export default router;