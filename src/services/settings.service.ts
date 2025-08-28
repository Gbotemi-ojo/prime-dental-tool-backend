import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { settings } from '../../db/schema';

const SETTINGS_NAME = 'dashboardPermissions';

export class SettingsService {

    /**
     * Retrieves the dashboard permission settings from the database.
     * If no settings exist, it creates and returns a default set.
     * @returns {Promise<any>} The configuration object for dashboard permissions.
     */
    async getSettings(): Promise<any> {
        try {
            let currentSettings = await db.query.settings.findFirst({
                where: eq(settings.name, SETTINGS_NAME),
            });

            // If no settings are found in the database, create the initial default settings.
            if (!currentSettings) {
                const initialConfig = {
                    canSeePatientManagement: ['staff', 'nurse', 'doctor'],
                    canSeeDoctorSchedule: ['staff', 'doctor'],
                    canSeeAppointments: ['staff'],
                    canSeeInventoryManagement: ['staff'],
                    canSeeStaffManagement: [],
                    canSeeMyProfile: [],
                    canSeeAllInventoryTransactions: ['staff'],
                    canSeeRevenueReport: [],
                };
                
                await db.insert(settings).values({
                    name: SETTINGS_NAME,
                    config: initialConfig,
                });

                currentSettings = await db.query.settings.findFirst({
                    where: eq(settings.name, SETTINGS_NAME),
                });
            }

            return currentSettings?.config ?? {};

        } catch (error) {
            console.error('Error fetching settings:', error);
            throw new Error('Could not retrieve settings.');
        }
    }

    /**
     * Updates the dashboard permission settings in the database.
     * @param {any} newConfig - The new settings configuration object to save.
     * @returns {Promise<any>} The updated configuration object.
     */
    async updateSettings(newConfig: any): Promise<any> {
        try {
            await db.update(settings)
                .set({
                    config: newConfig,
                    updatedAt: new Date(),
                })
                .where(eq(settings.name, SETTINGS_NAME));

            const updatedSettings = await db.query.settings.findFirst({
                where: eq(settings.name, SETTINGS_NAME),
            });

            if (!updatedSettings) {
                throw new Error('Settings not found to update.');
            }

            return updatedSettings.config;

        } catch (error) {
            console.error('Error updating settings:', error);
            throw new Error('Could not update settings.');
        }
    }
}

export const settingsService = new SettingsService();
