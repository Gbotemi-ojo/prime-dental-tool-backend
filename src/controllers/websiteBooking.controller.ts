import { Request, Response } from 'express';
import { websiteBookingService } from '../services/websiteBooking.service';

export class WebsiteBookingController {

    // PUBLIC: Endpoint for the external website to hit
    submitBooking = async (req: Request, res: Response): Promise<void> => {
        const { name, sex, dateOfBirth, phoneNumber, email, address, hmo, requestedAppointmentDate, complaint } = req.body;

        // Basic validation matching your patient requirements
        if (!name || !phoneNumber) {
            res.status(400).json({ error: 'Name and phone number are required.' });
            return;
        }

        try {
            const bookingData = {
                name, sex, phoneNumber, email, address, hmo, complaint,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                requestedAppointmentDate: requestedAppointmentDate ? new Date(requestedAppointmentDate) : null,
            };
            
            // @ts-ignore - Ignoring type strictness for partial insert for brevity
            const newBooking = await websiteBookingService.createBooking(bookingData);
            
            res.status(201).json({ message: 'Booking request submitted successfully.', bookingId: newBooking.id });
        } catch (error: any) {
            console.error('Error submitting website booking:', error);
            res.status(500).json({ error: 'Server error during booking submission.' });
        }
    };

    // PROTECTED: For your dashboard
    getAllBookings = async (req: Request, res: Response): Promise<void> => {
        try {
            const bookings = await websiteBookingService.getAllBookings();
            res.json(bookings);
        } catch (error) {
            console.error('Error fetching bookings:', error);
            res.status(500).json({ error: 'Failed to fetch bookings.' });
        }
    };

    // PROTECTED: Update status
    updateStatus = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'confirmed', 'rejected', 'converted'].includes(status)) {
             res.status(400).json({ error: 'Invalid status provided.' });
             return;
        }

        try {
            const result = await websiteBookingService.updateBookingStatus(Number(id), status);
            res.json(result);
        } catch (error) {
            console.error('Error updating booking status:', error);
            res.status(500).json({ error: 'Failed to update status.' });
        }
    }
}

export const websiteBookingController = new WebsiteBookingController();
