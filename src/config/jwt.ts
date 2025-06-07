// src/config/jwt.ts
import 'dotenv/config'; // For process.env

export const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_please_change_me_in_env';