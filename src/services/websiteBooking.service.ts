import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { websiteBookings } from '../../db/schema';
import { InferInsertModel } from 'drizzle-orm';
import { emailService } from './email.service';

type WebsiteBookingInsert = InferInsertModel<typeof websiteBookings>;

export class WebsiteBookingService {
    
    async createBooking(bookingData: WebsiteBookingInsert) {
        const [inserted] = await db.insert(websiteBookings).values({
            ...bookingData,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const [newBooking] = await db.select().from(websiteBookings).where(eq(websiteBookings.id, inserted.insertId)).limit(1);

        if (!newBooking) throw new Error('Failed to retrieve newly created booking.');

        // 1. Notify internal staff
        this._sendNewBookingNotification(newBooking);

        // 2. NEW: Send Welcome Email to the Patient
        if (newBooking.email) {
            this._sendWelcomeEmailToPatient(newBooking);
        }

        return newBooking;
    }

    async getAllBookings() {
        return await db.select().from(websiteBookings).orderBy(desc(websiteBookings.createdAt));
    }

    async updateBookingStatus(id: number, status: 'pending' | 'confirmed' | 'rejected' | 'converted') {
        await db.update(websiteBookings).set({ status, updatedAt: new Date() }).where(eq(websiteBookings.id, id));
        return { success: true, message: `Booking status updated to ${status}` };
    }

    // NEW: Method for manual reminder button
    async sendManualReminder(id: number) {
        const [booking] = await db.select().from(websiteBookings).where(eq(websiteBookings.id, id)).limit(1);
        if (!booking) throw new Error('Booking not found.');
        if (!booking.email) throw new Error('Patient does not have an email address for reminders.');

        const subject = `Reminder: Your Appointment Request at Prime Dental Clinic`;
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #3F51B5;">Appointment Reminder</h2>
                <p>Hello <strong>${booking.name}</strong>,</p>
                <p>This is a friendly reminder regarding your appointment request at <strong>Prime Dental Clinic</strong>.</p>
                <p>Our team is reviewing your request for <strong>${booking.requestedAppointmentDate ? new Date(booking.requestedAppointmentDate).toLocaleDateString() : 'your requested date'}</strong>. We will contact you shortly to confirm the exact time.</p>
                <p>If you have any urgent questions, please call us at 0805 516 2585.</p>
                <hr style="border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 0.8em; color: #777;">Prime Dental Clinic - Your Smile, Our Priority.</p>
            </div>
        `;

        await emailService.sendEmail(booking.email, subject, htmlContent);
        return { success: true, message: 'Reminder email sent successfully.' };
    }

    // NEW: Welcome Email Helper
    private async _sendWelcomeEmailToPatient(booking: any) {
        try {
            const subject = `Welcome to Prime Dental Clinic - Appointment Request Received`;
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #3F51B5;">Thank You for Choosing Prime Dental!</h2>
                    <p>Hello <strong>${booking.name}</strong>,</p>
                    <p>We have received your appointment request via our website. Our team is currently reviewing the details, and we will get back to you within 24 hours to confirm your visit.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Request Summary:</h3>
                        <ul style="list-style: none; padding: 0;">
                            <li><strong>Preferred Date:</strong> ${booking.requestedAppointmentDate ? new Date(booking.requestedAppointmentDate).toLocaleDateString() : 'Not specified'}</li>
                            <li><strong>Reason for Visit:</strong> ${booking.complaint || 'General Checkup'}</li>
                        </ul>
                    </div>
                    <p>We look forward to seeing you soon!</p>
                    <p>Best Regards,<br/><strong>The Prime Dental Team</strong></p>
                </div>
            `;
            await emailService.sendEmail(booking.email, subject, htmlContent);
        } catch (error) {
            console.error("Failed to send patient welcome email", error);
        }
    }

    private async _sendNewBookingNotification(booking: any) {
        try {
            const staffEmails = await (emailService as any)._getOwnerAndStaffEmails();
            const ownerEmail = process.env.OWNER_EMAIL;
            if (ownerEmail && !staffEmails.includes(ownerEmail)) staffEmails.push(ownerEmail);

            if (staffEmails.length > 0) {
                const subject = `New Website Booking: ${booking.name}`;
                const htmlContent = `
                    <h2>New Appointment Request</h2>
                    <p>A new request has been received from the website:</p>
                    <ul>
                        <li><strong>Name:</strong> ${booking.name}</li>
                        <li><strong>Phone:</strong> ${booking.phoneNumber}</li>
                        <li><strong>Requested Date:</strong> ${booking.requestedAppointmentDate ? new Date(booking.requestedAppointmentDate).toLocaleDateString() : 'Not specified'}</li>
                        <li><strong>Complaint/Reason:</strong> ${booking.complaint || 'N/A'}</li>
                    </ul>
                    <p>Please login to the dashboard to review.</p>
                `;
                await emailService.sendEmail(staffEmails.join(','), subject, htmlContent);
            }
        } catch (error) {
            console.error("Failed to send booking notification email", error);
        }
    }
}

export const websiteBookingService = new WebsiteBookingService();
