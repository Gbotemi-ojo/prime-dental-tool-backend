// src/services/broadcast.service.ts
import { sql, and, eq, gte, lte, like, inArray, isNotNull, SQL } from 'drizzle-orm';
import { db } from '../config/database';
import { patients, dentalRecords } from '../../db/schema';
import { emailService } from './email.service';

type BirthdayPatient = { id: number; name: string; email: string | null };

// ============================================================================
// --- TEST MODE CONFIGURATION ---
// Change IS_TEST_MODE to `false` when you are ready to send to all patients.
// ============================================================================
const IS_TEST_MODE = false; 

const TEST_EMAILS = [
    'hommzmum@gmail.com',
    'thegameclash444@gmail.com',
    'gbotexlatex.english@gmail.com',
    'orthoplusemr@gmail.com',
    'gbotexlatex.arabic@gmail.com'
];

class BroadcastService {
    /**
     * Retrieves a list of all patients whose birthday is today.
     */
    async getTodaysBirthdays(): Promise<{ success: boolean; patients: BirthdayPatient[]; message?: string }> {
        try {
            const todayMonth = new Date().getMonth() + 1; // JS months are 0-11
            const todayDay = new Date().getDate();

            const birthdayPatients: BirthdayPatient[] = await db
                .select({
                    id: patients.id,
                    name: patients.name,
                    email: patients.email,
                })
                .from(patients)
                .where(sql`MONTH(date_of_birth) = ${todayMonth} AND DAY(date_of_birth) = ${todayDay}`);

            return { success: true, patients: birthdayPatients };
        } catch (error: any) {
            console.error('Error fetching today\'s birthday patients:', error);
            return { success: false, patients: [], message: 'A server error occurred while fetching the birthday list.' };
        }
    }

    /**
     * Finds all patients whose birthday is today and sends a birthday wish email.
     */
    async sendBirthdayBroadcasts(): Promise<{ success: boolean; message: string; sentCount: number; failedCount: number }> {
        try {
            const { success, patients: birthdayPatients } = await this.getTodaysBirthdays();
            let recipients = birthdayPatients.filter(p => p.email);

            // --- TEST MODE OVERRIDE ---
            if (IS_TEST_MODE) {
                console.log(`[TEST MODE] Overriding birthday list. Sending ONLY to the ${TEST_EMAILS.length} test emails.`);
                recipients = TEST_EMAILS.map((email, i) => ({ id: i, name: 'Test Patient', email }));
            }
            // --------------------------

            if (!success || (recipients.length === 0 && !IS_TEST_MODE)) {
                return { success: true, message: 'No patients have a birthday today.', sentCount: 0, failedCount: 0 };
            }

            if (recipients.length === 0) {
                return { success: true, message: 'Found birthday patients, but none have a valid email address.', sentCount: 0, failedCount: 0 };
            }

            // Send synchronously so Vercel awaits the completion
            const emailPromises = recipients.map(patient =>
                emailService.sendBirthdayWish(patient.email!, { patientName: patient.name! })
            );

            await Promise.allSettled(emailPromises);

            return {
                success: true,
                message: `Birthday broadcast sent successfully to ${recipients.length} patients.`,
                sentCount: recipients.length,
                failedCount: 0
            };
        } catch (error: any) {
            console.error('Error sending birthday broadcasts:', error);
            return { success: false, message: 'A server error occurred while sending birthday wishes.', sentCount: 0, failedCount: 0 };
        }
    }

    /**
     * Sends a custom email to all patients, owners, and staff using batch limits.
     */
    async sendCustomBroadcast(subject: string, messageBody: string, offset: number = 0, limit: number = 100): Promise<{ success: boolean; message: string }> {
        try {
            const allPatients = await db.select({ email: patients.email, name: patients.name }).from(patients);
            const patientRecipients = allPatients.filter((p): p is { email: string, name: string } => !!p.email && !!p.name);
            
            const staffAndOwnerEmails = await (emailService as any)._getOwnerAndStaffEmails();
            const staffRecipients = staffAndOwnerEmails.map((email: string) => ({ email, name: 'Staff Member' }));

            const allRecipients = [...patientRecipients, ...staffRecipients];
            const uniqueRecipients = Array.from(new Set(allRecipients.map(r => r.email)))
                .map(email => allRecipients.find(r => r.email === email)!);

            let finalRecipients = uniqueRecipients;

            // --- TEST MODE OVERRIDE ---
            if (IS_TEST_MODE) {
                console.log(`[TEST MODE] Overriding custom broadcast list. Sending ONLY to the ${TEST_EMAILS.length} test emails.`);
                finalRecipients = TEST_EMAILS.map((email, i) => ({ email, name: 'Test User' }));
            }
            // --------------------------

            // Apply pagination based on the frontend range
            const batchRecipients = finalRecipients.slice(offset, offset + limit);

            if (batchRecipients.length === 0) {
                return { success: true, message: 'No valid email addresses found in this range.' };
            }

            // Send synchronously so Vercel awaits the completion
            const emailPromises = batchRecipients.map(recipient =>
                emailService.sendCustomEmail(recipient.email, {
                    patientName: recipient.name,
                    subject,
                    messageBody,
                })
            );

            await Promise.allSettled(emailPromises);

            return {
                success: true,
                message: `Broadcast successfully sent to ${batchRecipients.length} recipients (Range: ${offset + 1} to ${offset + batchRecipients.length}).`
            };
        } catch (error: any) {
            console.error('Error sending custom broadcast:', error);
            return { success: false, message: 'A server error occurred while sending the custom broadcast.' };
        }
    }

    /**
     * Retrieves patients based on date range and/or treatment plan from their dental records.
     */
    async getFilteredPatients(startDate?: string, endDate?: string, treatmentPlanQuery?: string): Promise<{ success: boolean; patients: any[]; message?: string }> {
        try {
            const conditions: SQL[] = [];

            if (startDate) {
                conditions.push(gte(dentalRecords.createdAt, new Date(startDate)));
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                conditions.push(lte(dentalRecords.createdAt, end));
            }
            if (treatmentPlanQuery) {
                // Filter by treatment plan instead of diagnosis
                conditions.push(like(dentalRecords.treatmentPlan, `%${treatmentPlanQuery}%`));
            }

            const records = await db.select({
                patientId: patients.id,
                name: patients.name,
                email: patients.email,
                phoneNumber: patients.phoneNumber,
                treatmentPlan: dentalRecords.treatmentPlan, 
                visitDate: dentalRecords.createdAt
            })
            .from(dentalRecords)
            .innerJoin(patients, eq(dentalRecords.patientId, patients.id))
            .where(conditions.length > 0 ? and(...conditions) : isNotNull(dentalRecords.id))
            .orderBy(dentalRecords.createdAt);

            // Deduplicate patients so they only appear once even if they had multiple matching visits
            const uniquePatientsMap = new Map();
            for (const r of records) {
                if (!uniquePatientsMap.has(r.patientId)) {
                    uniquePatientsMap.set(r.patientId, {
                        id: r.patientId,
                        name: r.name,
                        email: r.email,
                        phoneNumber: r.phoneNumber,
                        treatmentPlan: r.treatmentPlan,
                        visitDate: r.visitDate
                    });
                }
            }

            return { success: true, patients: Array.from(uniquePatientsMap.values()) };
        } catch (error: any) {
            console.error('Error fetching filtered patients:', error);
            return { success: false, patients: [], message: 'A server error occurred while filtering patients.' };
        }
    }

    /**
     * Sends a custom email to a specific list of patients by ID.
     */
    async sendTargetedBroadcast(patientIds: number[], subject: string, messageBody: string): Promise<{ success: boolean; message: string; sentCount?: number }> {
        try {
            const targetPatients = await db.select({
                id: patients.id,
                name: patients.name,
                email: patients.email
            })
            .from(patients)
            .where(inArray(patients.id, patientIds));

            let recipients = targetPatients.filter((p): p is { id: number, name: string, email: string } => !!p.email);

            // --- TEST MODE OVERRIDE ---
            if (IS_TEST_MODE) {
                console.log(`[TEST MODE] Overriding targeted broadcast list. Sending ONLY to test emails.`);
                recipients = TEST_EMAILS.map((email, i) => ({ id: i, name: 'Test Target Patient', email }));
            }
            // --------------------------

            if (recipients.length === 0) {
                return { success: false, message: 'No valid email addresses found for the selected patients.' };
            }

            const emailPromises = recipients.map(recipient =>
                emailService.sendCustomEmail(recipient.email, {
                    patientName: recipient.name,
                    subject,
                    messageBody,
                })
            );

            await Promise.allSettled(emailPromises);

            return {
                success: true,
                message: `Targeted broadcast successfully sent to ${recipients.length} patients.`,
                sentCount: recipients.length
            };
        } catch (error: any) {
            console.error('Error sending targeted broadcast:', error);
            return { success: false, message: 'A server error occurred while sending the targeted broadcast.' };
        }
    }

    /**
     * Sends a direct message to a single patient.
     */
    async sendDirectMessage(patientId: number, subject: string, messageBody: string): Promise<{ success: boolean; message: string }> {
        try {
            const [patient] = await db.select().from(patients).where(sql`id = ${patientId}`);
            if (!patient) {
                return { success: false, message: 'Patient not found.' };
            }

            if (!patient.email) {
                return { success: false, message: 'This patient does not have an email address on file.' };
            }

            const result = await emailService.sendCustomEmail(patient.email, {
                patientName: patient.name,
                subject,
                messageBody,
            });

            if (result.success) {
                return { success: true, message: `Message sent successfully to ${patient.name}.` };
            } else {
                throw new Error('Email transporter failed to send the direct message.');
            }
        } catch (error: any) {
            console.error(`Error sending direct message to patient ID ${patientId}:`, error);
            return { success: false, message: 'A server error occurred while sending the direct message.' };
        }
    }

    /**
     * Retrieves all unique patient phone numbers as a single comma-separated string.
     */
    async getAllPhoneNumbers(): Promise<{ success: boolean; phoneNumbers: string | null; message?: string }> {
        try {
            const allPatients = await db.select({ phoneNumber: patients.phoneNumber }).from(patients);
            
            const phoneNumbers = allPatients
                .map(p => p.phoneNumber)
                .filter((pn): pn is string => !!pn && pn.trim() !== '');

            const uniquePhoneNumbers = [...new Set(phoneNumbers)];
            const commaSeparatedNumbers = uniquePhoneNumbers.join(', ');

            return { success: true, phoneNumbers: commaSeparatedNumbers };
        } catch (error: any) {
             console.error('Error fetching all phone numbers:', error);
            return { success: false, phoneNumbers: null, message: 'A server error occurred while fetching phone numbers.' };
        }
    }
}

export const broadcastService = new BroadcastService();
