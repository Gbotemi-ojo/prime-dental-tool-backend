// src/services/email.service.ts
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import handlebars from 'handlebars'; 
import { db } from '../config/database';
import { users } from '../../db/schema';
import { inArray } from 'drizzle-orm';
import { googleSheetsService } from './googleSheets.service';

export class EmailService {
    private transporter: nodemailer.Transporter;
    private ownerEmail: string;

    constructor() {
        this.ownerEmail = process.env.OWNER_EMAIL || '';

        if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_FROM) {
            console.warn('SMTP environment variables are not fully configured. Email sending may fail.');
            console.warn('Current SMTP Config Attempt (Sensitive Info Hidden):', {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER ? 'CONFIGURED' : 'NOT CONFIGURED',
                pass: process.env.SMTP_PASS ? 'CONFIGURED' : 'NOT CONFIGURED',
                emailFrom: process.env.EMAIL_FROM,
                secure: process.env.SMTP_SECURE
            });
        }

        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true
            }
        });

        this.transporter.verify((error, success) => {
            if (error) {
                console.error('Failed to connect to SMTP server. Check SMTP credentials and network settings:', error);
            } else {
                console.log('Successfully connected and authenticated with SMTP server.');
            }
        });
    }

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

    private async _getOwnerAndStaffEmails(): Promise<string[]> {
        try {
            const staffMembers = await db
                .select({ email: users.email })
                .from(users)
                .where(inArray(users.role, ['owner', 'staff']));

            return staffMembers
                .map(user => user.email)
                .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) as string[];
        } catch (error) {
            console.error('Error fetching staff emails from database:', error);
            return [];
        }
    }

    async sendEmail(to: string, subject: string, htmlContent: string, cc?: string[], bcc?: string[]) {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: to,
            subject: subject,
            html: htmlContent,
            cc: cc && cc.length > 0 ? cc.join(',') : undefined,
            bcc: bcc && bcc.length > 0 ? bcc.join(',') : undefined,
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
    
    // ... (other reminder methods like sendScalingReminder) ...
    async sendScalingReminder(patientEmail: string, reminderData: { patientName: string; }, bcc?: string[]) {
        const template = await this.compileTemplate('scaling-reminder.html');
        const subject = `Important Recall Notice for Your Dental Health`;
        const htmlContent = template({ 
            patientName: reminderData.patientName,
            currentYear: new Date().getFullYear(),
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com'
        });
        return await this.sendEmail(patientEmail, subject, htmlContent, [], bcc);
    }
    
    async sendExtractionReminder(patientEmail: string, reminderData: { patientName: string; appointmentDate: string; }, bcc?: string[]) {
        const template = await this.compileTemplate('extraction-reminder.html');
        const subject = `Post-Extraction Review Reminder`;
        const formattedDate = new Date(reminderData.appointmentDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const htmlContent = template({
            patientName: reminderData.patientName,
            appointmentDate: formattedDate,
            currentYear: new Date().getFullYear(),
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com'
        });
        return await this.sendEmail(patientEmail, subject, htmlContent, [], bcc);
    }

    async sendRootCanalReminder(patientEmail: string, reminderData: { patientName: string; }, bcc?: string[]) {
        const template = await this.compileTemplate('root-canal-reminder.html');
        const subject = `Reminder: Continuing Your Root Canal Therapy`;
        const htmlContent = template({
            patientName: reminderData.patientName,
            currentYear: new Date().getFullYear(),
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com'
        });
        return await this.sendEmail(patientEmail, subject, htmlContent, [], bcc);
    }
    
    /**
     * NEW: Sends a birthday wish email.
     * @param patientEmail Patient's email.
     * @param data Template data.
     * @returns The result of the email sending operation.
     */
    async sendBirthdayWish(patientEmail: string, data: { patientName: string }) {
        const template = await this.compileTemplate('birthday-wish.html');
        const subject = `Happy Birthday, ${data.patientName}!`;
        const htmlContent = template({
            patientName: data.patientName,
            currentYear: new Date().getFullYear(),
        });
        // No BCC needed for individual birthday emails
        return await this.sendEmail(patientEmail, subject, htmlContent);
    }

    // ... (sendInvoiceEmail and sendReceiptEmail methods) ...
    async sendInvoiceEmail(patientEmail: string, invoiceData: any, senderUserId: number) {
        console.log("[EmailService Debug] invoiceData received (before processing):", invoiceData); // Debug log for incoming data

        const template = await this.compileTemplate('invoice.html'); // Use compileTemplate
        const subject = `Invoice from Prime Dental Clinic`;

        const servicesForTemplate = Array.isArray(invoiceData.items) ? invoiceData.items.map((item: any) => {
            const calculatedTotalPrice = parseFloat(item.totalPrice || 0);
            console.log(`[EmailService Debug] Item: ${item.description}, Raw Total Price: ${item.totalPrice}, Parsed Total Price: ${calculatedTotalPrice}, Formatted: ${calculatedTotalPrice.toFixed(2)}`);
            return {
                name: item.description,
                totalPrice: calculatedTotalPrice.toFixed(2),
            };
        }) : [];

        console.log('[EmailService Debug] servicesForTemplate (after formatting):', servicesForTemplate);

        const templateData = {
            invoiceNumber: invoiceData.invoiceNumber || 'N/A',
            invoiceDate: invoiceData.invoiceDate || 'N/A',
            patientName: invoiceData.patientName || 'Patient',
            clinicEmail: process.env.EMAIL_FROM || 'info@yourclinic.com',
            isHmoCovered: invoiceData.isHmoCovered || false,
            hmoName: invoiceData.hmoName || 'N/A',
            services: servicesForTemplate,
            subtotal: parseFloat(invoiceData.subtotal || 0).toFixed(2),
            totalDue: parseFloat(invoiceData.totalDueFromPatient || 0).toFixed(2),
            coveredAmount: parseFloat(invoiceData.coveredAmount || 0).toFixed(2),
            paymentMethod: invoiceData.paymentMethod || 'N/A',
            latestDentalRecord: invoiceData.latestDentalRecord || null,
        };

        console.log('[EmailService Debug] templateData sent to Handlebars:', templateData);

        const htmlContent = template(templateData);

        const staffBccRecipients = await this._getOwnerAndStaffEmails();
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
            if (!bccRecipients.includes(this.ownerEmail)) {
                bccRecipients.push(this.ownerEmail);
            }
        }
        const validBccRecipients = bccRecipients.filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

        return await this.sendEmail(patientEmail, subject, htmlContent, [], validBccRecipients);
    }
    
    async sendReceiptEmail(patientEmail: string, receiptData: any, senderUserId: number) {
        const template = await this.compileTemplate('receipt.html');
        const subject = `Payment Receipt from Prime Dental Clinic - #${receiptData.receiptNumber}`;

        const itemsForReceiptTemplate = Array.isArray(receiptData.items) ? receiptData.items.map((item: any) => ({
            description: item.description,
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
            coveredAmount: parseFloat(receiptData.coveredAmount || 0).toFixed(2),
            items: itemsForReceiptTemplate,
            subtotal: parseFloat(receiptData.subtotal || 0).toFixed(2),
            amountPaid: parseFloat(receiptData.amountPaid || 0).toFixed(2),
            totalDueFromPatient: parseFloat(receiptData.totalDueFromPatient || 0).toFixed(2),
            paymentMethod: receiptData.paymentMethod || 'N/A',
            latestDentalRecord: receiptData.latestDentalRecord || null,
            outstanding: parseFloat(receiptData.outstanding || 0) > 0 ? parseFloat(receiptData.outstanding || 0).toFixed(2) : null,
        };

        const htmlContent = template(templateData);

        const staffBccRecipients = await this._getOwnerAndStaffEmails();
        const bccRecipients: string[] = [...staffBccRecipients];
        if (this.ownerEmail) {
            if (!bccRecipients.includes(this.ownerEmail)) {
                bccRecipients.push(this.ownerEmail);
            }
        }
        const validBccRecipients = bccRecipients.filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

        const emailResult = await this.sendEmail(patientEmail, subject, htmlContent, [], validBccRecipients);

        if (emailResult.success) {
            try {
                const receiptDataForSheet = {
                    ...receiptData,
                    subtotal: parseFloat(receiptData.subtotal || 0),
                    amountPaid: parseFloat(receiptData.amountPaid || 0),
                    coveredAmount: parseFloat(receiptData.coveredAmount || 0),
                    totalDueFromPatient: parseFloat(receiptData.totalDueFromPatient || 0),
                    items: Array.isArray(receiptData.items) ? receiptData.items.map((item: any) => ({
                        ...item,
                        unitPrice: parseFloat(item.unitPrice || 0),
                        totalPrice: parseFloat(item.totalPrice || 0)
                    })) : []
                };

                await googleSheetsService.appendReceipts(receiptDataForSheet);
                console.log('Receipt data successfully logged to Google Sheet.');
            } catch (sheetError) {
                console.error('Failed to log receipt data to Google Sheet:', sheetError);
            }
        }

        return emailResult;
    }
}

export const emailService = new EmailService();