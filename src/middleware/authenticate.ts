// Custom Request type to attach authenticated user info.
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
export interface AuthRequest extends Request {
    user?: { id: number; email: string };
  }
  const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
  // Middleware to authenticate requests via JWT.
  export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ message: "No token provided" });
    } else {
      // Expected format: "Bearer <token>"
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = { id: decoded.id, email: decoded.email };
        next();
      } catch (error) {
        res.status(401).json({ message: "Invalid token" });
      }
    }
  }