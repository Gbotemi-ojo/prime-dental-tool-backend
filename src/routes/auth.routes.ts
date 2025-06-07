// src/routes/auth.routes.ts
import { Router } from 'express';
import { authController } from '../controllers/auth.controller'; // Import the controller
import { authenticateToken } from '../middleware/auth'; // Your authentication middleware

const router = Router();

// POST /api/auth/login - User login
router.post('/login', authController.login);

// GET /api/auth/me - Get authenticated user's details
router.get('/me', authenticateToken, authController.getMe);

export default router;