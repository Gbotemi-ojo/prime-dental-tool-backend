// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { userService } from '../services/user.service';

// Extend the Request type to include the user property from your middleware
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class UserController {
  constructor() {}

  // ADMIN ROUTES (Accessible by 'owner' role)

  createStaffAccount = async (req: Request, res: Response): Promise<void> => {
    const { username, password, email, role } = req.body;

    if (!username || !password || !role) {
      res.status(400).json({ error: 'Username, password, and role are required.' });
      return;
    }

    if (!['staff', 'nurse','doctor'].includes(role)) {
      res.status(400).json({ error: 'Invalid role specified. Allowed roles: staff, nurse.' });
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      const result = await userService.createUser({ username, password, email, role });
      res.status(result.status).json(result.success ? { message: result.message, user: result.user } : { error: result.message });
    } catch (error) {
      console.error('Error in createStaffAccount controller:', error);
      res.status(500).json({ error: 'Server error creating user account.' });
    }
  }

  getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const allUsers = await userService.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error('Error in getAllUsers controller:', error);
      res.status(500).json({ error: 'Server error fetching users.' });
    }
  }

  getStaffAccounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const staffAccounts = await userService.getStaffAccounts();
      res.json(staffAccounts);
    } catch (error) {
      console.error('Error in getStaffAccounts controller:', error);
      res.status(500).json({ error: 'Server error fetching staff accounts.' });
    }
  }

  getUserById = async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID provided.' });
      return;
    }

    try {
      const user = await userService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json(user);
    } catch (error) {
      console.error('Error in getUserById controller:', error);
      res.status(500).json({ error: 'Server error fetching user account details.' });
    }
  }

  updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);
    const { username, email, role, isActive } = req.body;
    const currentLoggedInUserId = req.user!.userId;

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID provided.' });
      return;
    }

    if (!username || !role || typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'Username, Role, and isActive (boolean) are required.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      const result = await userService.updateUser(userId, { username, email, role, isActive }, currentLoggedInUserId);
      res.status(result.status).json(result.success ? { message: result.message } : { error: result.message });
    } catch (error) {
      console.error('Error in updateUser controller:', error);
      res.status(500).json({ error: 'Server error updating user account.' });
    }
  }

  updateUserStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);
    const { isActive } = req.body;
    const currentLoggedInUserId = req.user!.userId;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be a boolean.' });
      return;
    }
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    try {
      const result = await userService.updateUserStatus(userId, isActive, currentLoggedInUserId);
      res.status(result.status).json(result.success ? { message: result.message } : { error: result.message });
    } catch (error) {
      console.error('Error in updateUserStatus controller:', error);
      res.status(500).json({ error: 'Server error updating user account status.' });
    }
  }

  deleteUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);
    const currentLoggedInUserId = req.user!.userId;

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    try {
      const result = await userService.deleteUser(userId, currentLoggedInUserId);
      res.status(result.status).json(result.success ? { message: result.message } : { error: result.message });
    } catch (error) {
      console.error('Error in deleteUser controller:', error);
      res.status(500).json({ error: 'Server error deleting user account.' });
    }
  }

  // USER PROFILE ROUTES (Accessible by authenticated user for their own profile)

  updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const currentLoggedInUserId = req.user!.userId;
    const { username, email } = req.body;

    if (!username) {
      res.status(400).json({ error: 'Username is required.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      const result = await userService.updateProfile(currentLoggedInUserId, { username, email });
      res.status(result.status).json(result.success ? { message: result.message } : { error: result.message });
    } catch (error) {
      console.error('Error in updateProfile controller:', error);
      res.status(500).json({ error: 'Server error updating profile.' });
    }
  }

  changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const currentLoggedInUserId = req.user!.userId;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      res.status(400).json({ error: 'All password fields are required.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    try {
      const result = await userService.changePassword(currentLoggedInUserId, currentPassword, newPassword);
      res.status(result.status).json(result.success ? { message: result.message } : { error: result.message });
    } catch (error) {
      console.error('Error in changePassword controller:', error);
      res.status(500).json({ error: 'Server error changing password.' });
    }
  }
}

export const userController = new UserController();
