// src/utils/helpers.ts
import * as bcrypt from 'bcrypt';

const saltRounds = 10; // Standard salt rounds for bcrypt

/**
 * Hashes a plain-text password using bcrypt.
 * @param password The plain-text password to hash.
 * @returns A promise that resolves to the hashed password string.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compares a plain-text password with a hashed password.
 * @param password The plain-text password.
 * @param hash The hashed password to compare against.
 * @returns A promise that resolves to true if passwords match, false otherwise.
 */
export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}