import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../config/database'; // Assuming this import is still needed for other parts of the service
import { users } from '../../db/schema'; // Assuming this import is still needed for other parts of the service
import { eq, ne } from 'drizzle-orm'; // 'ne' (not equal) is needed for filtering roles
import { googleSheetsService } from './googleSheets.service'; // Import the Google Sheets Service

export class EmailService {
    private transporter: nodemailer.Transporter;
    private ownerEmail: string;
    // Removed staffEmail as it will now be dynamically fetched from DB

    constructor() {
        this.ownerEmail = process.env.OWNER_EMAIL || '';

        // --- SMTP Environment Variable Configuration Check ---
        if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_FROM) {
            console.warn('SMTP environment variables are not fully configured. Email sending may fail.');
            // Detailed log for debugging initial config
            console.warn('Current SMTP Config Attempt (Sensitive Info Hidden):', {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER ? 'CONFIGURED' : 'NOT CONFIGURED',
                pass: process.env.SMTP_PASS ? 'CONFIGURED' : 'NOT CONFIGURED', // Avoid logging raw password
                emailFrom: process.env.EMAIL_FROM,
                secure: process.env.SMTP_SECURE
            });
        }

        // --- Nodemailer Transporter Initialization ---
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10), // Default to 587 if not set
            secure: process.env.SMTP_SECURE === 'true', // 'true' for 465 (SSL), 'false' for 587 (STARTTLS)
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true
            }
        });

        // --- SMTP Connection Verification ---
        this.transporter.verify((error, success) => {
            if (error) {
                console.error('Failed to connect to SMTP server. Check SMTP credentials and network settings:', error);
            } else {
                console.log('Successfully connected and authenticated with SMTP server.');
            }
        });
    }

    /**
     * Reads an HTML email template from the templates directory.
     * @param templateName The name of the template file (e.g., 'invoice.html').
     * @returns The content of the template as a string.
     * @throws Error if the template file cannot be read.
     */
    private async readTemplate(templateName: string): Promise<string> {
        const templatePath = path.join(__dirname, '../templates', templateName);
        console.log(`[DEBUG] Attempting to read template from: ${templatePath}`);

        try {
            return await fs.readFile(templatePath, 'utf-8');
        } catch (error) {
            console.error(`Error reading email template ${templateName} from path: ${templatePath}`, error);
            throw new Error(`Failed to read email template: ${templateName}`);
        }
    }

    /**
     * Fetches email addresses of all staff members excluding 'nurses' from the database.
     * @returns An array of staff email addresses.
     */
    private async _getStaffEmailsExcludingNurses(): Promise<string[]> {
        try {
            const staffMembers = await db
                .select({ email: users.email })
                .from(users)
                .where(ne(users.role, 'nurse')); // Exclude users with the role 'nurse'

            // Filter out null/undefined emails and ensure valid format
            return staffMembers
                .map(user => user.email)
                .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) as string[];
        } catch (error) {
            console.error('Error fetching staff emails from database:', error);
            return []; // Return empty array on error to prevent email sending failure
        }
    }

    /**
     * Sends an email with HTML content using the configured transporter.
     * @param to Recipient email address.
     * @param subject Email subject.
     * @param htmlContent HTML content of the email.
     * @param cc Optional CC recipients (array of strings).
     * @param bcc Optional BCC recipients (array of strings).
     * @returns A success object with messageId or a failure object with an error.
     */
    async sendEmail(to: string, subject: string, htmlContent: string, cc?: string[], bcc?: string[]) {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: to, // Primary recipient
            subject: subject,
            html: htmlContent,
            cc: cc && cc.length > 0 ? cc.join(',') : undefined, // Convert array to comma-separated string
            bcc: bcc && bcc.length > 0 ? bcc.join(',') : undefined, // Convert array to comma-separated string
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent: %s', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Error sending email:', error);
            return { success: false, error: error };
        }
    }

    /**
     * Generates and sends an invoice email based on a template.
     * @param patientEmail The patient's email address.
     * @param invoiceData Data to populate the invoice template (e.g., invoiceNumber, invoiceDate, items, totalAmount).
     * @param senderUserId The ID of the user sending the invoice (for logging/auditing, if needed).
     * @returns The result of the email sending operation.
     */
    async sendInvoiceEmail(patientEmail: string, invoiceData: any, senderUserId: number) {
        const template = await this.readTemplate('invoice.html');
        const subject = `Invoice from Prime Dental Clinic`;

        let htmlContent = template
            .replace('{{invoiceDate}}', invoiceData.invoiceDate || 'N/A')
            .replace('{{patientName}}', invoiceData.patientName || 'Patient')
            .replace('{{totalAmount}}', invoiceData.totalAmount ? invoiceData.totalAmount.toFixed(2) : '0.00');

        let itemsHtml = '';
        if (invoiceData.items && Array.isArray(invoiceData.items)) {
            itemsHtml = invoiceData.items.map((item: any) => `
                <tr>
                    <td>${item.description || 'Service/Item'}</td>
                    <td>${item.quantity || 1}</td>
                    <td>${(item.unitPrice || 0).toFixed(2)}</td>
                    <td>${((item.quantity || 1) * (item.unitPrice || 0)).toFixed(2)}</td>
                </tr>
            `).join('');
        }
        htmlContent = htmlContent.replace('{{invoiceItems}}', itemsHtml);

        // Dynamically get BCC recipients
        const staffBccRecipients = await this._getStaffEmailsExcludingNurses();
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
            // Add owner email if it's set and not already in the staff list (to avoid duplicates)
            if (!bccRecipients.includes(this.ownerEmail)) {
                bccRecipients.push(this.ownerEmail);
            }
        }
        const validBccRecipients = bccRecipients.filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));


        return await this.sendEmail(patientEmail, subject, htmlContent, [], validBccRecipients);
    }

    /**
     * Generates and sends a receipt email based on a template.
     * @param patientEmail The patient's email address.
     * @param receiptData Data to populate the receipt template (e.g., receiptNumber, amountPaid, paymentMethod).
     * @param senderUserId The ID of the user sending the receipt.
     * @returns The result of the email sending operation.
     */
    async sendReceiptEmail(patientEmail: string, receiptData: any, senderUserId: number) {
        const template = await this.readTemplate('receipt.html');
        const subject = `Payment Receipt from Prime Dental Clinic - #${receiptData.receiptNumber}`;

        const calculatedSubtotal = receiptData.items ? receiptData.items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0) : 0;
        const totalDueFromPatient = calculatedSubtotal - (receiptData.hmoCoveredAmount || 0);

        let htmlContent = template
            .replace('{{receiptNumber}}', receiptData.receiptNumber || 'N/A')
            .replace('{{receiptDate}}', receiptData.receiptDate || 'N/A')
            .replace('{{patientName}}', receiptData.patientName || 'Patient')
            .replace('{{subtotal}}', calculatedSubtotal.toFixed(2))
            .replace('{{amountPaid}}', totalDueFromPatient.toFixed(2))
            .replace('{{paymentMethod}}', receiptData.paymentMethod || 'N/A')
            .replace('{{hmoProvider}}', receiptData.hmoProvider && receiptData.hmoProvider !== 'N/A' ? receiptData.hmoProvider : 'N/A')
            .replace('{{hmoCoveredAmount}}', (receiptData.hmoCoveredAmount || 0).toFixed(2))
            .replace('{{clinicEmail}}', process.env.EMAIL_FROM || 'info@yourclinic.com');

        let itemsHtml = '';
        if (receiptData.items && Array.isArray(receiptData.items)) {
            itemsHtml = receiptData.items.map((item: any) => `
                <tr>
                    <td>${item.description || 'Service/Item'}</td>
                    <td>₦${(item.amount || 0).toFixed(2)}</td>
                </tr>
            `).join('');
        }
        htmlContent = htmlContent.replace('{{receiptItems}}', itemsHtml);

        // Dynamically get BCC recipients
        const staffBccRecipients = await this._getStaffEmailsExcludingNurses();
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
            // Add owner email if it's set and not already in the staff list (to avoid duplicates)
            if (!bccRecipients.includes(this.ownerEmail)) {
                bccRecipients.push(this.ownerEmail);
            }
        }
        const validBccRecipients = bccRecipients.filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

        // Send the email
        const emailResult = await this.sendEmail(patientEmail, subject, htmlContent, [], validBccRecipients);

        // If the email was sent successfully, append the receipt data to Google Sheets
        if (emailResult.success) {
            try {
                await googleSheetsService.appendReceipts(receiptData);
                console.log('Receipt data successfully logged to Google Sheet.');
            } catch (sheetError) {
                console.error('Failed to log receipt data to Google Sheet:', sheetError);
                // You might want to handle this error more robustly, e.g.,
                // by sending an internal notification or retrying.
            }
        }

        return emailResult;
    }
}

// Export an instance of the EmailService
export const emailService = new EmailService();
