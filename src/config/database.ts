// src/config/database.ts
import 'dotenv/config'; // For process.env
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '../../db/schema'; // Adjust path if necessary based on your actual db folder location

const dbCredentials = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

console.log('Database Credentials:', dbCredentials.host, ':', dbCredentials.port, '/', dbCredentials.database);

// Create a connection pool
const pool = mysql.createPool({
  host: dbCredentials.host,
  port: dbCredentials.port,
  database: dbCredentials.database,
  user: dbCredentials.user,
  password: dbCredentials.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection on startup
export async function testDatabaseConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Database connection successful!');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1); // Exit if DB connection fails on startup
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema, mode: 'default' });

// Graceful shutdown function
export async function closeDatabaseConnection() {
  console.log('Closing MySQL connection pool...');
  await pool.end();
  console.log('MySQL connection pool closed.');
}

// Export the pool if you foresee needing direct mysql2 pool methods (less common with Drizzle)
export { pool };