// db/seed.ts
import 'dotenv/config'; // Load environment variables
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './db/schema'; // Adjust path if your schema file is elsewhere
import bcrypt from 'bcrypt';
import { users } from './db/schema'; // Import the users table
import { eq } from 'drizzle-orm';

async function seed() {
    console.log('Starting database seeding...');

    const pool = createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: Number(process.env.DB_PORT || 3306),
    });

    const db = drizzle(pool, { schema, mode: 'default' });

    const OWNER_USERNAME = 'drtope';
    const OWNER_PASSWORD = '12345678'; // Change this to a strong password for actual use!
    const OWNER_EMAIL = 'dprimedentech@gmail.Com';

    try {
        // Check if an owner already exists to prevent duplicate entries
        const existingOwner = await db.query.users.findFirst({
            where: eq(users.username, OWNER_USERNAME)
        });

        if (existingOwner) {
            console.log(`Owner user '${OWNER_USERNAME}' already exists. Skipping creation.`);
        } else {
            const hashedPassword = await bcrypt.hash(OWNER_PASSWORD, 10); // 10 is a good salt rounds value

            await db.insert(users).values({
                username: OWNER_USERNAME,
                passwordHash: hashedPassword,
                email: OWNER_EMAIL,
                role: 'owner',
                isActive: true,
            });
            console.log(`Owner user '${OWNER_USERNAME}' created successfully!`);
        }

    } catch (error) {
        console.error('Error during seeding:', error);
        process.exit(1); // Exit with an error code
    } finally {
        await pool.end(); // Close the database connection pool
        console.log('Seeding complete.');
    }
}

seed();