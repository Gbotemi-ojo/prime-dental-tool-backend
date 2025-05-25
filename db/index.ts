import 'dotenv/config';

import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";
import mysql from "mysql2/promise";

const dbCredentials = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

if (!dbCredentials.host || !dbCredentials.database || !dbCredentials.user || !dbCredentials.password) {
    console.error('Missing one or more database environment variables. Please check your .env file.');
    process.exit(1);
}

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

const db = drizzle(pool, { schema, mode: 'default' });
export default db;

process.on('SIGINT', async () => {
    console.log('Closing MySQL connection pool...');
    await pool.end();
    console.log('MySQL connection pool closed.');
    process.exit(0);
});
