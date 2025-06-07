// src/services/auth.service.ts
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db } from '../config/database'; // Your Drizzle DB instance
import { JWT_SECRET } from '../config/jwt'; // Your JWT secret
import { users } from '../../db/schema'; // Your Drizzle schema for users
import { comparePasswords } from '../utils/helpers'; // Your password comparison utility

export class AuthService {
  constructor() {}

  async login(username: string, password: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

    if (!user || !user.isActive) {
      // In a real application, you might throw a custom error here
      // e.g., throw new AuthenticationError('Invalid credentials or inactive account.');
      return { success: false, message: 'Invalid credentials or inactive account.' };
    }

    const isPasswordValid = await comparePasswords(password, user.passwordHash);

    if (!isPasswordValid) {
      return { success: false, message: 'Invalid credentials.' };
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { passwordHash, ...safeUser } = user; // Exclude password hash
    return { success: true, token, user: safeUser };
  }

  async getUserById(userId: number) {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return null;
    }

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}

// Export an instance of the service to be used across the application
export const authService = new AuthService();