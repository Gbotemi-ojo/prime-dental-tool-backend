import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import handlebars from 'handlebars'; // Import handlebars
import { db } from '../config/database';
import { users } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm'; // MODIFIED: Imported 'inArray' and removed 'ne'
import { googleSheetsService } from './googleSheets.service'; // Import the Google Sheets Service

export class EmailService {
    private transporter: nodemailer.Transporter;
    private ownerEmail: string;

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
     * Reads and compiles an HTML email template using Handlebars.
     * @param templateName The name of the template file (e.g., 'invoice.html').
     * @returns A compiled Handlebars template function.
     * @throws Error if the template file cannot be read.
     */
    private async compileTemplate(templateName: string): Promise<handlebars.TemplateDelegate<any>> {
        const templatePath = path.join(__dirname, '../templates', templateName);
        console.log(`[DEBUG] Attempting to read and compile template from: ${templatePath}`);

        try {
            const templateSource = await fs.readFile(templatePath, 'utf-8');
            return handlebars.compile(templateSource);
        } catch (error) {
            console.error(`Error reading or compiling email template ${templateName} from path: ${templatePath}`, error);
            throw new Error(`Failed to read or compile email template: ${templateName}`);
        }
    }

    /**
     * Fetches email addresses of all 'owner' and 'staff' members from the database.
     * @returns An array of staff email addresses.
     */
    private async _getOwnerAndStaffEmails(): Promise<string[]> { // MODIFIED: Renamed method
        try {
            const staffMembers = await db
                .select({ email: users.email })
                .from(users)
                .where(inArray(users.role, ['owner', 'staff'])); // MODIFIED: Query now specifically includes 'owner' and 'staff'

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
     * NEW: Sends an appointment reminder email.
     * @param patientEmail The patient's email address.
     * @param reminderData Data for the reminder template.
     * @param bcc Optional BCC recipients for the reminder.
     * @returns The result of the email sending operation.
     */
    async sendAppointmentReminder(patientEmail: string, reminderData: { patientName: string; appointmentDate: string; outstandingAmount?: string; }, bcc?: string[]) {
        const template = await this.compileTemplate('reminder.html');
        const subject = `Appointment Reminder for ${reminderData.appointmentDate}`;

        const outstandingValue = parseFloat(reminderData.outstandingAmount || '0');

        const templateData = {
            patientName: reminderData.patientName,
            appointmentDate: new Date(reminderData.appointmentDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            hasOutstanding: outstandingValue > 0,
            outstandingAmount: outstandingValue.toFixed(2),
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com',
            currentYear: new Date().getFullYear(),
        };

        const htmlContent = template(templateData);

        return await this.sendEmail(patientEmail, subject, htmlContent, [], bcc);
    }


    /**
     * Generates and sends an invoice email based on a template.
     * @param patientEmail The patient's email address.
     * @param invoiceData Data to populate the invoice template (e.g., invoiceNumber, invoiceDate, items, totalAmount).
     * @param senderUserId The ID of the user sending the invoice (for logging/auditing, if needed).
     * @returns The result of the email sending operation.
     */
    async sendInvoiceEmail(patientEmail: string, invoiceData: any, senderUserId: number) {
        console.log("[EmailService Debug] invoiceData received (before processing):", invoiceData); // Debug log for incoming data

        const template = await this.compileTemplate('invoice.html'); // Use compileTemplate
        const subject = `Invoice from Prime Dental Clinic`;

        // Transform invoiceData.items into the 'services' format expected by the Handlebars template
        // Ensure totalPrice is formatted to 2 decimal places for display
        const servicesForTemplate = Array.isArray(invoiceData.items) ? invoiceData.items.map((item: any) => {
            const calculatedTotalPrice = parseFloat(item.totalPrice || 0); // Ensure it's a number
            console.log(`[EmailService Debug] Item: ${item.description}, Raw Total Price: ${item.totalPrice}, Parsed Total Price: ${calculatedTotalPrice}, Formatted: ${calculatedTotalPrice.toFixed(2)}`);
            return {
                name: item.description, // Map 'description' from items to 'name' for template
                totalPrice: calculatedTotalPrice.toFixed(2), // Format totalPrice to 2 decimal places
            };
        }) : [];

        console.log('[EmailService Debug] servicesForTemplate (after formatting):', servicesForTemplate); // Log for debugging

        // Prepare data for the Handlebars template
        const templateData = {
            invoiceNumber: invoiceData.invoiceNumber || 'N/A',
            invoiceDate: invoiceData.invoiceDate || 'N/A',
            patientName: invoiceData.patientName || 'Patient',
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com',
            isHmoCovered: invoiceData.isHmoCovered || false,
            hmoName: invoiceData.hmoName || 'N/A',
            services: servicesForTemplate, // Use the transformed array here

            // Ensure totals are formatted to 2 decimal places
            subtotal: parseFloat(invoiceData.subtotal || 0).toFixed(2),
            // Changed key from 'totalDueFromPatient' to 'totalDue' to match template's variable name for main display
            totalDue: parseFloat(invoiceData.totalDueFromPatient || 0).toFixed(2), // This is the total patient due
            coveredAmount: parseFloat(invoiceData.coveredAmount || 0).toFixed(2), // Add coveredAmount for template
            
            paymentMethod: invoiceData.paymentMethod || 'N/A', // This might not be relevant for an invoice, but keeping for flexibility
            latestDentalRecord: invoiceData.latestDentalRecord || null, // Pass entire object
        };

        console.log('[EmailService Debug] templateData sent to Handlebars:', templateData); // Log for debugging

        const htmlContent = template(templateData); // Render the template with data

        // Dynamically get BCC recipients
        const staffBccRecipients = await this._getOwnerAndStaffEmails(); // MODIFIED: Using renamed method
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
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
        const template = await this.compileTemplate('receipt.html'); // Use compileTemplate for receipt too
        const subject = `Payment Receipt from Prime Dental Clinic - #${receiptData.receiptNumber}`;

        // CORRECTED: Ensure properties match what receipt.html expects (description, quantity, unitPrice, totalPrice)
        const itemsForReceiptTemplate = Array.isArray(receiptData.items) ? receiptData.items.map((item: any) => ({
            description: item.description, // Use 'description' as expected by template
            quantity: item.quantity,
            unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : parseFloat(item.unitPrice || 0).toFixed(2),
            totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice.toFixed(2) : parseFloat(item.totalPrice || 0).toFixed(2),
        })) : [];

        const templateData = {
            receiptNumber: receiptData.receiptNumber || 'N/A',
            receiptDate: receiptData.receiptDate || 'N/A',
            patientName: receiptData.patientName || 'Patient',
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com',
            isHmoCovered: receiptData.isHmoCovered || false,
            hmoName: receiptData.hmoName || 'N/A',
            coveredAmount: parseFloat(receiptData.coveredAmount || 0).toFixed(2), // Ensure this is a number for template
            items: itemsForReceiptTemplate, // Use the transformed array here, named 'items' as per template
            subtotal: parseFloat(receiptData.subtotal || 0).toFixed(2), // Ensure this is a number for template
            amountPaid: parseFloat(receiptData.amountPaid || 0).toFixed(2), // This is the actual amount patient paid (number for template)
            totalDueFromPatient: parseFloat(receiptData.totalDueFromPatient || 0).toFixed(2), // Balance they owed from frontend (number for template)
            paymentMethod: receiptData.paymentMethod || 'N/A',
            latestDentalRecord: receiptData.latestDentalRecord || null,
            // Add outstanding field. Pass it to the template if it's a positive value.
            outstanding: parseFloat(receiptData.outstanding || 0) > 0 ? parseFloat(receiptData.outstanding || 0).toFixed(2) : null,
        };

        const htmlContent = template(templateData); // Render the template with data

        // Dynamically get BCC recipients
        const staffBccRecipients = await this._getOwnerAndStaffEmails(); // MODIFIED: Using renamed method
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
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
                // Prepare data specifically for Google Sheets, ensuring all numerical values are handled
                const receiptDataForSheet = {
                    ...receiptData, // Copy all existing properties
                    // Ensure numerical values are explicitly parsed as floats, defaulting to 0
                    subtotal: parseFloat(receiptData.subtotal || 0),
                    amountPaid: parseFloat(receiptData.amountPaid || 0),
                    coveredAmount: parseFloat(receiptData.coveredAmount || 0),
                    totalDueFromPatient: parseFloat(receiptData.totalDueFromPatient || 0),
                    // Map items to ensure totalPrice and unitPrice are numbers
                    items: Array.isArray(receiptData.items) ? receiptData.items.map((item: any) => ({
                        ...item,
                        unitPrice: parseFloat(item.unitPrice || 0),
                        totalPrice: parseFloat(item.totalPrice || 0)
                    })) : []
                };

                // Now, pass the sanitized data to Google Sheets service
                await googleSheetsService.appendReceipts(receiptDataForSheet);
                console.log('Receipt data successfully logged to Google Sheet.');
            } catch (sheetError) {
                console.error('Failed to log receipt data to Google Sheet:', sheetError);
            }
        }

        return emailResult;
    }
}

// Export an instance of the EmailService
export const emailService = new EmailService();
