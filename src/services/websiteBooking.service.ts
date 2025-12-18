import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { websiteBookings } from '../../db/schema';
import { InferInsertModel } from 'drizzle-orm';
import { emailService } from './email.service'; // Re-using your existing email service

type WebsiteBookingInsert = InferInsertModel<typeof websiteBookings>;

export class WebsiteBookingService {
    
    // Create a new booking from the website (Public)
    async createBooking(bookingData: WebsiteBookingInsert) {
        // 1. Insert the booking into the database
        const [inserted] = await db.insert(websiteBookings).values({
            ...bookingData,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const [newBooking] = await db.select().from(websiteBookings).where(eq(websiteBookings.id, inserted.insertId)).limit(1);

        if (!newBooking) throw new Error('Failed to retrieve newly created booking.');

        // 2. Notify internal staff (re-using your logic from patient service)
        this._sendNewBookingNotification(newBooking);

        return newBooking;
    }

    // Get all bookings (For Admin Dashboard)
    async getAllBookings() {
        return await db.select().from(websiteBookings).orderBy(desc(websiteBookings.createdAt));
    }

    // Update status (e.g., when a receptionist calls and confirms)
    async updateBookingStatus(id: number, status: 'pending' | 'confirmed' | 'rejected' | 'converted') {
        await db.update(websiteBookings).set({ status, updatedAt: new Date() }).where(eq(websiteBookings.id, id));
        return { success: true, message: `Booking status updated to ${status}` };
    }

    // Internal notification helper
    private async _sendNewBookingNotification(booking: any) {
        try {
            const staffEmails = await (emailService as any)._getOwnerAndStaffEmails();
            // Add owner email if env variable exists
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
