import 'dotenv/config'; // Make sure this is at the very top
import { defineConfig } from 'drizzle-kit';

// Define and validate environment variables
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;

if (!DB_HOST) {
    throw new Error('DB_HOST is not set in .env');
}
if (!DB_DATABASE) {
    throw new Error('DB_DATABASE is not set in .env');
}
if (!DB_USER) {
    throw new Error('DB_USER is not set in .env');
}
if (!DB_PASSWORD) {
    throw new Error('DB_PASSWORD is not set in .env');
}

// Convert port to a number, with a fallback and type assertion
const parsedDbPort = DB_PORT ? parseInt(DB_PORT, 10) : undefined;
if (DB_PORT && isNaN(parsedDbPort!)) { // Check if parsing failed for a defined port
    throw new Error('DB_PORT in .env is not a valid number');
}


export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migration',
  dialect: 'mysql',

  dbCredentials: {
    host: DB_HOST,         // Now guaranteed to be string
    port: parsedDbPort,    // Can be number or undefined (if not set in .env)
    database: DB_DATABASE, // Now guaranteed to be string
    user: DB_USER,         // Now guaranteed to be string
    password: DB_PASSWORD, // Now guaranteed to be string
  },

  verbose: true,
  strict: true
});
