// src/services/broadcast.service.ts
import { sql } from 'drizzle-orm';
import { db } from '../config/database';
import { patients } from '../../db/schema';
import { emailService } from './email.service';

// Define a reusable type for birthday patient data
type BirthdayPatient = { id: number; name: string; email: string | null };

class BroadcastService {
    /**
     * Retrieves a list of all patients whose birthday is today.
     * @returns {Promise<{success: boolean, patients: BirthdayPatient[], message?: string}>} List of patients.
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
     * Finds all patients whose birthday is today and sends them a birthday wish email.
     * This is optimized to send emails in parallel for better performance with large numbers.
     * @returns {Promise<{success: boolean, message: string, sentCount: number, failedCount: number}>} Result of the operation.
     */
    async sendBirthdayBroadcasts(): Promise<{ success: boolean; message: string; sentCount: number; failedCount: number }> {
        try {
            const { success, patients: birthdayPatients } = await this.getTodaysBirthdays();

            if (!success || birthdayPatients.length === 0) {
                return { success: true, message: 'No patients have a birthday today.', sentCount: 0, failedCount: 0 };
            }

            const recipients = birthdayPatients.filter(p => p.email);

            if (recipients.length === 0) {
                return { success: true, message: 'Found birthday patients, but none have a valid email address.', sentCount: 0, failedCount: 0 };
            }

            const emailPromises = recipients.map(patient =>
                emailService.sendBirthdayWish(patient.email!, { patientName: patient.name! })
            );

            // Use Promise.allSettled to send emails in parallel without stopping on a single failure.
            const results = await Promise.allSettled(emailPromises);

            const successfulSends = results.filter(result => result.status === 'fulfilled' && result.value.success).length;
            const failedSends = results.length - successfulSends;

            let responseMessage = `Birthday wishes broadcast finished. Sent: ${successfulSends}. Failed: ${failedSends}.`;
            if (failedSends > 0) {
                console.error('Some birthday emails failed to send. Results:', results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)));
            }

            return {
                success: failedSends === 0,
                message: responseMessage,
                sentCount: successfulSends,
                failedCount: failedSends
            };
        } catch (error: any) {
            console.error('Error sending birthday broadcasts:', error);
            return { success: false, message: 'A server error occurred while sending birthday wishes.', sentCount: 0, failedCount: 0 };
        }
    }

    /**
     * Sends a custom email to all patients, owners, and staff.
     * @param subject The email subject.
     * @param messageBody The plain text or HTML content of the email.
     * @returns {Promise<{success: boolean, message: string}>} Result of the operation.
     */
    async sendCustomBroadcast(subject: string, messageBody: string): Promise<{ success: boolean; message: string }> {
        try {
            const allPatients = await db.select({ email: patients.email, name: patients.name }).from(patients);
            const patientRecipients = allPatients.filter((p): p is { email: string, name: string } => !!p.email && !!p.name);

            if (patientRecipients.length === 0) {
                return { success: true, message: 'No patients with valid email addresses found to send the broadcast to.' };
            }

            const staffAndOwnerEmails = await (emailService as any)._getOwnerAndStaffEmails();
            const staffRecipients = staffAndOwnerEmails.map((email: string) => ({ email, name: 'Staff Member' }));

            const allRecipients = [...patientRecipients, ...staffRecipients];
            const uniqueRecipients = Array.from(new Set(allRecipients.map(r => r.email)))
                .map(email => allRecipients.find(r => r.email === email)!);

            const emailPromises = uniqueRecipients.map(recipient =>
                emailService.sendCustomEmail(recipient.email, {
                    patientName: recipient.name,
                    subject,
                    messageBody,
                })
            );

            const results = await Promise.allSettled(emailPromises);
            const successfulSends = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failedSends = results.length - successfulSends;

            const message = `Custom broadcast finished. Sent successfully to ${successfulSends} recipients. Failed for ${failedSends}.`;

            return { success: failedSends === 0, message };

        } catch (error: any) {
            console.error('Error sending custom broadcast:', error);
            return { success: false, message: 'A server error occurred while sending the custom broadcast.' };
        }
    }
    
    /**
     * NEW: Sends a direct message to a single patient.
     * @param patientId The ID of the patient.
     * @param subject The email subject.
     * @param messageBody The email content.
     * @returns {Promise<{success: boolean, message: string}>} Result of the operation.
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
     * @returns {Promise<{success: boolean, phoneNumbers: string | null, message?: string}>} The phone numbers string or an error message.
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
