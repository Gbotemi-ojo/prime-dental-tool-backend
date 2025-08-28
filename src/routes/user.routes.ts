// src/routes/user.routes.ts
import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// USER PROFILE ROUTES (Accessible by ANY authenticated user for their OWN profile)
router.put('/profile', authenticateToken, userController.updateProfile);
router.put('/profile/password', authenticateToken, userController.changePassword);


// ADMIN ROUTES
router.post('/staff', authenticateToken, authorizeRoles(['owner']), userController.createStaffAccount);

router.get('/', authenticateToken, authorizeRoles(['owner']), userController.getAllUsers);

router.get('/staff', authenticateToken, authorizeRoles(['owner']), userController.getStaffAccounts);

// ** NEW ROUTE **
router.get('/doctors-and-owners', authenticateToken, authorizeRoles(['owner', 'staff']), userController.getDoctorsAndOwners);


router.get('/doctors', authenticateToken, authorizeRoles(['owner', 'staff', 'doctor']), userController.getDoctorAccounts);

router.get('/:id', authenticateToken, authorizeRoles(['owner']), userController.getUserById);

router.put('/:id', authenticateToken, authorizeRoles(['owner']), userController.updateUser);

router.put('/:id/status', authenticateToken, authorizeRoles(['owner']), userController.updateUserStatus);

router.delete('/:id', authenticateToken, authorizeRoles(['owner']), userController.deleteUser);


export default router;
