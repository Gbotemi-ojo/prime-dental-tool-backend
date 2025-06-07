// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt';

// Extend the Request type to include the user property provided by authenticateToken
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

/**
 * Authenticate Token: Verifies JWT from header and attaches user info to req.user.
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Just send the response, don't return it explicitly.
    // The function will naturally end here if res.status().json() is called.
    res.status(401).json({ error: 'Authentication token required.' });
    return; // Explicitly return void to prevent further execution in this middleware
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      res.status(403).json({ error: 'Invalid or expired token.' });
      return; // Explicitly return void
    }
    req.user = user; // Attach decoded user payload to the request
    next(); // Call next to pass control to the next middleware/route handler
  });
}

/**
 * Authorize Roles: Checks if the authenticated user has one of the allowed roles.
 * @param allowedRoles An array of roles that are permitted to access the route.
 */
export function authorizeRoles(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      res.status(403).json({ error: 'Access denied: No user role found.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied: You do not have the required permissions. Your role: ${req.user.role}` });
      return;
    }
    next();
  };
}