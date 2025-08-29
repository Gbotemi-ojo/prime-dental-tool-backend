import { eq } from 'drizzle-orm';
import { db } from '../config/database';
import { settings } from '../../db/schema';

const SETTINGS_NAME = 'dashboardPermissions';

export class SettingsService {

    async getSettings(): Promise<any> {
        try {
            let currentSettings = await db.query.settings.findFirst({
                where: eq(settings.name, SETTINGS_NAME),
            });

            if (!currentSettings) {
                const initialConfig = {
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
                        canSendInvoice: ['staff', 'nurse'],
                        canSendReceipt: ['staff', 'nurse'],
                        canSetAppointment: ['staff', 'nurse'],
                        canSeeNextAppointment: ['staff', 'doctor', 'nurse'],
                    },
                    // --- NEW: Inventory management action permissions ---
                    inventoryManagement: {
                        canAddItem: ['staff'],
                        canEditItem: [], // Default to owner-only by being empty
                        canRecordTransaction: ['staff', 'nurse', 'doctor'],
                    }
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
