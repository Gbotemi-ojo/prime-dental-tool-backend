import 'dotenv/config'; // Load environment variables
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './db/schema'; // Assuming schema.ts is in the same directory
import { settings } from './db/schema'; // Import the specific settings table
import { eq } from 'drizzle-orm';

const SETTINGS_NAME = 'dashboardPermissions';

async function seedSettings() {
    console.log('Starting settings seeding...');

    const pool = createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: Number(process.env.DB_PORT || 3306),
    });

    const db = drizzle(pool, { schema, mode: 'default' });

    // Define the default settings configuration that should be in the DB
    const latestConfig = {
        dashboard: {
            canSeePatientManagement: ['staff', 'nurse', 'doctor'],
            canSeeDoctorSchedule: ['staff', 'doctor'],
            canSeeAppointments: ['staff'],
            canSeeInventoryManagement: ['staff'],
            canSeeStaffManagement: [],
            canSeeMyProfile: ['staff', 'nurse', 'doctor'],
            canSeeAllInventoryTransactions: ['staff'],
            canSeeRevenueReport: [],
        },
        patientManagement: {
            canSeeContactDetails: ['staff'],
            canEditBio: ['staff'],
            canAddDentalRecord: ['staff', 'doctor', 'nurse'],
            canSendInvoice: ['staff'],
            canSendReceipt: ['staff'],
            canSetAppointment: ['staff', 'nurse'],
            canSeeNextAppointment: ['staff', 'doctor', 'nurse'],
        }
    };

    try {
        // 1. Check if settings already exist
        const existingSettings = await db.query.settings.findFirst({
            where: eq(settings.name, SETTINGS_NAME)
        });

        // --- MODIFIED LOGIC ---
        if (existingSettings) {
            // If settings exist, UPDATE them to the latest version
            await db.update(settings)
                .set({
                    config: latestConfig,
                    updatedAt: new Date(),
                })
                .where(eq(settings.name, SETTINGS_NAME));
            console.log(`Settings '${SETTINGS_NAME}' found and updated successfully!`);
        } else {
            // If no settings exist, INSERT them
            await db.insert(settings).values({
                name: SETTINGS_NAME,
                config: latestConfig,
            });
            console.log(`Default settings '${SETTINGS_NAME}' created successfully!`);
        }

    } catch (error) {
        console.error('Error during settings seeding:', error);
        process.exit(1); // Exit with an error code
    } finally {
        await pool.end(); // Close the database connection pool
        console.log('Settings seeding complete.');
    }
}

seedSettings();
