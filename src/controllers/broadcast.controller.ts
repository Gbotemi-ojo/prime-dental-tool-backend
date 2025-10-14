// src/controllers/broadcast.controller.ts
import { Request, Response } from 'express';
import { broadcastService } from '../services/broadcast.service';

class BroadcastController {
    getTodaysBirthdays = async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await broadcastService.getTodaysBirthdays();
            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            console.error('Controller error in getTodaysBirthdays:', error);
            res.status(500).json({ success: false, patients: [], message: 'Internal server error.' });
        }
    };

    sendBirthdayBroadcast = async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await broadcastService.sendBirthdayBroadcasts();
            if (!result.success && result.sentCount > 0) {
                 res.status(207).json(result);
            } else if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            console.error('Controller error in sendBirthdayBroadcast:', error);
            res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    };

    sendCustomBroadcast = async (req: Request, res: Response): Promise<void> => {
        const { subject, message } = req.body;
        if (!subject || !message) {
            res.status(400).json({ success: false, message: 'Subject and message body are required.' });
            return;
        }

        try {
            const result = await broadcastService.sendCustomBroadcast(subject, message);
            if (!result.success && result.message.includes('Failed')) {
                res.status(207).json(result);
            } else if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            console.error('Controller error in sendCustomBroadcast:', error);
            res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    };

    /**
     * NEW: Controller for sending a direct message to a single patient.
     */
    sendDirectMessage = async (req: Request, res: Response): Promise<void> => {
        const { patientId } = req.params;
        const { subject, message } = req.body;

        if (!patientId || isNaN(Number(patientId))) {
            res.status(400).json({ success: false, message: 'A valid patient ID is required.' });
            return;
        }

        if (!subject || !message) {
            res.status(400).json({ success: false, message: 'Subject and message body are required.' });
            return;
        }

        try {
            const result = await broadcastService.sendDirectMessage(Number(patientId), subject, message);
            if (result.success) {
                res.status(200).json(result);
            } else {
                // If the message indicates a client error (e.g., patient not found), send a 404.
                const statusCode = result.message.includes('not found') ? 404 : 500;
                res.status(statusCode).json(result);
            }
        } catch (error) {
            console.error('Controller error in sendDirectMessage:', error);
            res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    };

    getAllPhoneNumbers = async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await broadcastService.getAllPhoneNumbers();
             if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error) {
            console.error('Controller error in getAllPhoneNumbers:', error);
            res.status(500).json({ success: false, phoneNumbers: null, message: 'Internal server error.' });
        }
    };
}

export const broadcastController = new BroadcastController();
