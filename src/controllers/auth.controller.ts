import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class AuthController {
  constructor() {}

  // Explicitly type the method as an Express RequestHandler (or a compatible signature)
  login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return; // Ensure the function returns after sending response
    }

    try {
      const result = await authService.login(username, password);

      if (!result.success) {
        res.status(401).json({ error: result.message });
        return;
      }

      res.json({
        token: result.token,
        userId: result.user?.id,
        role: result.user?.role,
        username: result.user?.username
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error during login.' });
    }
  }

  // Explicitly type the method as an Express RequestHandler (or a compatible signature)
  getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'User not authenticated.' });
      return;
    }

    try {
      const user = await authService.getUserById(req.user.userId);

      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ error: 'Server error fetching user details.' });
    }
  }
}

export const authController = new AuthController();