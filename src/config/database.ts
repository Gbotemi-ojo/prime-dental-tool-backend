import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '../../db/schema';

const dbCredentials = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

console.log('Database Credentials:', dbCredentials.host, ':', dbCredentials.port, '/', dbCredentials.database);

const pool = mysql.createPool({
  host: dbCredentials.host,
  port: dbCredentials.port,
  database: dbCredentials.database,
  user: dbCredentials.user,
  password: dbCredentials.password,
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0
});

export async function testDatabaseConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Database connection successful!');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

export const db = drizzle(pool, { schema, mode: 'default' });

export async function closeDatabaseConnection() {
  console.log('Closing MySQL connection pool...');
  await pool.end();
  console.log('MySQL connection pool closed.');
}

export { pool };