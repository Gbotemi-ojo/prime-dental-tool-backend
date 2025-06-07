// src/routes/user.routes.ts
import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// USER PROFILE ROUTES (Accessible by ANY authenticated user for their OWN profile)
// Nurses CAN access their own profile
// These routes don't need authorizeRoles as they operate on req.user.userId
// IMPORTANT: Place these specific routes BEFORE general :id routes
router.put('/profile', authenticateToken, userController.updateProfile);
router.put('/profile/password', authenticateToken, userController.changePassword);


// ADMIN ROUTES (Accessible by 'owner' role ONLY)
// Nurses should NOT access any of these admin user management routes

// POST /api/admin/users/staff - Create Staff/Nurse Account
router.post('/staff', authenticateToken, authorizeRoles(['owner']), userController.createStaffAccount);

// GET /api/admin/users - Get all users (staff, nurses, and owners)
router.get('/', authenticateToken, authorizeRoles(['owner']), userController.getAllUsers);

// GET /api/admin/users/staff - Get all staff accounts (specifically role 'staff')
router.get('/staff', authenticateToken, authorizeRoles(['owner']), userController.getStaffAccounts);

// GET /api/admin/users/:id - Get a single user's details by ID
router.get('/:id', authenticateToken, authorizeRoles(['owner']), userController.getUserById);

// PUT /api/admin/users/:id - Update a user's details (username, email, role, isActive)
router.put('/:id', authenticateToken, authorizeRoles(['owner']), userController.updateUser);

// PUT /api/admin/users/:id/status - Update a user's active status
router.put('/:id/status', authenticateToken, authorizeRoles(['owner']), userController.updateUserStatus);

// DELETE /api/admin/users/:id - Delete a user account
router.delete('/:id', authenticateToken, authorizeRoles(['owner']), userController.deleteUser);


export default router;
