// src/services/user.service.ts
import { eq, ne, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { db } from '../config/database';
import { users } from '../../db/schema';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

// Define types for better type safety in service layer
type UserInsert = InferInsertModel<typeof users>;
type UserSelect = InferSelectModel<typeof users>;

const saltRounds = 10; // Ensure this matches your user creation salt rounds

export class UserService {
  constructor() {}

  async createUser(userData: { username: string; password?: string; email?: string; role: 'owner' | 'staff' | 'nurse' | 'doctor' }) {
    const { username, password, email, role } = userData;

    const [existingUserByUsername] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUserByUsername) {
      return { success: false, message: 'Username already exists.', status: 409 };
    }
    if (email) {
      const [existingUserByEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUserByEmail) {
        return { success: false, message: 'Email already exists.', status: 409 };
      }
    }

    if (!password) {
      return { success: false, message: 'Password is required to create a user.', status: 400 };
    }

    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [inserted] = await db.insert(users).values({
      username,
      passwordHash,
      email,
      role,
      isActive: true,
    });

    const [newUser] = await db.select().from(users).where(eq(users.id, (inserted as any).insertId)).limit(1);
    if (!newUser) {
      return { success: false, message: 'User created but could not be retrieved.', status: 500 };
    }

    const { passwordHash: _, ...safeUser } = newUser; // Exclude passwordHash from returned user
    return { success: true, user: safeUser, status: 201 };
  }

  async getAllUsers() {
    const allUsers = await db.select().from(users);
    return allUsers.map(user => {
      const { passwordHash, ...safeUser } = user;
      return safeUser;
    });
  }

  async getStaffAccounts() {
    const staffAccounts = await db.select().from(users).where(inArray(users.role, ['staff', 'nurse','doctor']));
    return staffAccounts.map(({ passwordHash, ...user }) => user);
  }

  /**
   * Fetches users from the database based on their role.
   * @param role The role to filter by (e.g., 'doctor', 'staff').
   * @returns A promise that resolves to an array of users.
   */
  async getUsersByRole(role: 'owner' | 'staff' | 'nurse' | 'doctor'): Promise<Omit<UserSelect, 'passwordHash'>[]> {
      try {
          const usersByRole = await db.select().from(users).where(eq(users.role, role));
          // We should not return the password hash to the client
          return usersByRole.map(user => {
              const { passwordHash, ...safeUser } = user;
              return safeUser;
          });
      } catch (error) {
          console.error(`Error fetching users with role ${role}:`, error);
          throw new Error(`Could not fetch users with role ${role}.`);
      }
  }

  async getDoctorsAndOwners(): Promise<Omit<UserSelect, 'passwordHash'>[]> {
      try {
          const usersByRole = await db.select().from(users).where(inArray(users.role, ['doctor', 'owner']));
          return usersByRole.map(user => {
              const { passwordHash, ...safeUser } = user;
              return safeUser;
          });
      } catch (error) {
          console.error('Error fetching doctors and owners:', error);
          throw new Error('Could not fetch doctors and owners.');
      }
  }

  async getUserById(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return null;
    }
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(userId: number, updateData: Partial<UserInsert>, currentLoggedInUserId: number) {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userToUpdate) {
      return { success: false, message: 'User not found.', status: 404 };
    }

    if (userId === currentLoggedInUserId && userToUpdate.role === 'owner' && updateData.role !== 'owner') {
      return { success: false, message: "Forbidden: An owner cannot change their own role.", status: 403 };
    }
    if (userToUpdate.role === 'owner' && updateData.role && updateData.role !== 'owner') {
      return { success: false, message: "Forbidden: Cannot change an owner's role to a non-owner role.", status: 403 };
    }

    if (userId === currentLoggedInUserId && userToUpdate.role === 'owner' && updateData.isActive === false) {
      return { success: false, message: "Forbidden: An owner cannot deactivate their own account.", status: 403 };
    }


    if (updateData.username && updateData.username !== userToUpdate.username) {
      const [existingUserWithUsername] = await db.select().from(users).where(eq(users.username, updateData.username)).limit(1);
      if (existingUserWithUsername && existingUserWithUsername.id !== userId) {
        return { success: false, message: 'Username already exists.', status: 409 };
      }
    }

    if (updateData.email && updateData.email !== userToUpdate.email) {
      const [existingUserWithEmail] = await db.select().from(users).where(eq(users.email, updateData.email)).limit(1);
      if (existingUserWithEmail && existingUserWithEmail.id !== userId) {
        return { success: false, message: 'Email already in use.', status: 409 };
      }
    }

    await db.update(users).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return { success: true, message: 'User account updated successfully.', status: 200 };
  }

  async updateUserStatus(userId: number, isActive: boolean, currentLoggedInUserId: number) {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userToUpdate) {
      return { success: false, message: 'User not found.', status: 404 };
    }

    if (userId === currentLoggedInUserId && userToUpdate.role === 'owner' && isActive === false) {
      return { success: false, message: "Forbidden: An owner cannot deactivate their own account.", status: 403 };
    }
    if (userToUpdate.role === 'owner' && userId !== currentLoggedInUserId) {
      return { success: false, message: 'Forbidden: Cannot change status of another owner account.', status: 403 };
    }

    await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
    return { success: true, message: `User account ${isActive ? 'activated' : 'deactivated'} successfully.`, status: 200 };
  }

  async deleteUser(userId: number, currentLoggedInUserId: number) {
    const [userToDelete] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userToDelete) {
      return { success: false, message: 'User not found.', status: 404 };
    }
    if (userId === currentLoggedInUserId) {
      return { success: false, message: 'Forbidden: You cannot delete your own account.', status: 403 };
    }
    if (userToDelete.role === 'owner') {
      return { success: false, message: 'Forbidden: Cannot delete an owner account.', status: 403 };
    }

    await db.delete(users).where(eq(users.id, userId));
    return { success: true, message: 'User account deleted successfully.', status: 200 };
  }

  async updateProfile(userId: number, updateData: { username?: string; email?: string }) {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userToUpdate) {
      return { success: false, message: 'User profile not found.', status: 404 };
    }

    if (updateData.username && updateData.username !== userToUpdate.username) {
      const [existingUserWithUsername] = await db.select().from(users).where(eq(users.username, updateData.username)).limit(1);
      if (existingUserWithUsername) {
        return { success: false, message: 'Username already taken.', status: 409 };
      }
    }

    if (updateData.email && updateData.email !== userToUpdate.email) {
      const [existingUserWithEmail] = await db.select().from(users).where(eq(users.email, updateData.email)).limit(1);
      if (existingUserWithEmail) {
        return { success: false, message: 'Email already in use.', status: 409 };
      }
    }

    await db.update(users).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return { success: true, message: 'Profile updated successfully.', status: 200 };
  }

  async changePassword(userId: number, currentPasswordPlain: string, newPasswordPlain: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      return { success: false, message: 'User not found.', status: 404 };
    }

    const isMatch = await bcrypt.compare(currentPasswordPlain, user.passwordHash);
    if (!isMatch) {
      return { success: false, message: 'Incorrect current password.', status: 401 };
    }

    const newPasswordHash = await bcrypt.hash(newPasswordPlain, saltRounds);

    await db.update(users).set({
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return { success: true, message: 'Password updated successfully.', status: 200 };
  }
}

export const userService = new UserService();
