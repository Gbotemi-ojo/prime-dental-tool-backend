import { sql } from 'drizzle-orm';
import { db } from '../config/database';
import { patients } from '../../db/schema';
import { emailService } from './email.service';

type BirthdayPatient = { id: number; name: string; email: string | null };

// ============================================================================
// --- TEST MODE CONFIGURATION ---
// Change IS_TEST_MODE to `false` when you are ready to send to all patients.
// ============================================================================
const IS_TEST_MODE = true; 
const TEST_EMAILS = [
    'hommzmum@gmail.com',
    'thegameclash444@gmail.com',
    'gbotexlatex.english@gmail.com',
    'orthoplusemr@gmail.com',
    'gbotexlatex.arabic@gmail.com'
];

// --- BATCH PROCESSING CONFIGURATION ---
const BATCH_SIZE = 50; // Number of emails to send per batch
const BATCH_DELAY_MS = 1000 * 60 * 60; // 1 hour delay between batches (Adjust to match provider limits)

// Utility functions for background batching
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

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
     * Finds all patients whose birthday is today and queues a birthday wish email.
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

            // Start background processing so the server doesn't block the request
            this.processBirthdayBatchesInBackground(recipients);

            return {
                success: true,
                message: `Birthday broadcast queued for ${recipients.length} patients. Processing in background batches.`,
                sentCount: recipients.length,
                failedCount: 0
            };
        } catch (error: any) {
            console.error('Error sending birthday broadcasts:', error);
            return { success: false, message: 'A server error occurred while sending birthday wishes.', sentCount: 0, failedCount: 0 };
        }
    }

    /**
     * Sends a custom email to all patients, owners, and staff using batch processing.
     */
    async sendCustomBroadcast(subject: string, messageBody: string): Promise<{ success: boolean; message: string }> {
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

            if (finalRecipients.length === 0) {
                return { success: true, message: 'No valid email addresses found to send the broadcast to.' };
            }

            // Start background processing so the server doesn't block the request
            this.processCustomBatchesInBackground(finalRecipients, subject, messageBody);

            return { 
                success: true, 
                message: `Broadcast queued successfully for ${finalRecipients.length} recipients. Sending in background batches to prevent rate limits.` 
            };
        } catch (error: any) {
            console.error('Error sending custom broadcast:', error);
            return { success: false, message: 'A server error occurred while sending the custom broadcast.' };
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

    // --- BACKGROUND BATCH WORKERS ---

    private async processCustomBatchesInBackground(recipients: { email: string; name: string }[], subject: string, messageBody: string) {
        const chunks = chunkArray(recipients, BATCH_SIZE);
        console.log(`[Broadcast] Starting custom broadcast: ${chunks.length} batches of up to ${BATCH_SIZE} emails.`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const emailPromises = chunk.map(recipient =>
                emailService.sendCustomEmail(recipient.email, {
                    patientName: recipient.name,
                    subject,
                    messageBody,
                })
            );

            await Promise.allSettled(emailPromises);
            console.log(`[Broadcast] Processed custom batch ${i + 1} of ${chunks.length}.`);

            if (i < chunks.length - 1) {
                await delay(BATCH_DELAY_MS);
            }
        }
        console.log('[Broadcast] Custom broadcast completely finished.');
    }

    private async processBirthdayBatchesInBackground(recipients: BirthdayPatient[]) {
        const chunks = chunkArray(recipients, BATCH_SIZE);
        console.log(`[Broadcast] Starting birthday broadcast: ${chunks.length} batches of up to ${BATCH_SIZE} emails.`);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const emailPromises = chunk.map(patient =>
                emailService.sendBirthdayWish(patient.email!, { patientName: patient.name! })
            );

            await Promise.allSettled(emailPromises);
            console.log(`[Broadcast] Processed birthday batch ${i + 1} of ${chunks.length}.`);

            if (i < chunks.length - 1) {
                await delay(BATCH_DELAY_MS);
            }
        }
        console.log('[Broadcast] Birthday broadcast completely finished.');
    }
}

export const broadcastService = new BroadcastService();