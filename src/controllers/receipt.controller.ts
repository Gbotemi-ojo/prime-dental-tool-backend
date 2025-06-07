// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { patientService } from '../services/patient.service'; // To fetch patient email
// import { users } from '../../db/schema'; // Not used in this controller snippet, can be removed if truly unused

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class ReceiptController {
  constructor() {}

  sendReceipt = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // The frontend sends a `body` with `patientEmail`, `receiptData`, and `senderUserId`.
    // We need to destructure `receiptData` from req.body directly.
    const { patientEmail, receiptData, senderUserId } = req.body;

    // Validate essential fields from the receiptData object received from frontend
    if (!receiptData || !receiptData.patientId || !receiptData.receiptNumber || !receiptData.receiptDate || receiptData.amountPaid === undefined || !receiptData.paymentMethod) {
      res.status(400).json({ error: 'Receipt data (patient ID, receipt number, date, amount paid, and payment method) are required.' });
      return;
    }

    if (isNaN(receiptData.patientId)) {
      res.status(400).json({ error: 'Invalid patient ID in receipt data.' });
      return;
    }

    try {
      // It's still good practice to verify patient email via DB,
      // but for generating receipt, we can primarily rely on the email passed from frontend
      // if it's reliable. If not, fetch patient.email and overwrite patientEmail from frontend.
      const patient = await patientService.getPatientById(receiptData.patientId);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }
      // Use the patient's actual email from DB for sending the email,
      // in case the frontend's patientEmail was somehow incorrect or missing.
      const targetEmail = patient.email;

      if (!targetEmail) {
        res.status(404).json({ error: 'Patient email not available in the database.' });
        return;
      }

      // Now, pass the *entire* receiptData object (which contains all details)
      // to the emailService, along with the correct patient email.
      const emailResult = await emailService.sendReceiptEmail(targetEmail, receiptData, senderUserId);

      if (emailResult.success) {
        res.status(200).json({ message: 'Receipt sent successfully!', messageId: emailResult.messageId });
      } else {
        console.error('Failed to send receipt email:', emailResult.error);
        res.status(500).json({ error: 'Failed to send receipt email.', details: emailResult.error });
      }
    } catch (error) {
      console.error('Error in sendReceipt controller:', error);
      res.status(500).json({ error: 'Server error sending receipt.' });
    }
  };
}

export const receiptController = new ReceiptController();