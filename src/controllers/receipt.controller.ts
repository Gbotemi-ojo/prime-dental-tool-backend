import { Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { patientService } from '../services/patient.service';
import { googleSheetsService } from '../services/googleSheets.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class ReceiptController {
  constructor() {}

  sendReceipt = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { receiptData, senderUserId } = req.body;

    if (!receiptData || !receiptData.patientId || !receiptData.receiptNumber || !receiptData.receiptDate || receiptData.amountPaid === undefined || receiptData.totalDueFromPatient === undefined || !receiptData.paymentMethod) {
      res.status(400).json({ error: 'Receipt data (patient ID, receipt number, date, amount paid, total due, and payment method) are required.' });
      return;
    }

    if (isNaN(receiptData.patientId)) {
      res.status(400).json({ error: 'Invalid patient ID in receipt data.' });
      return;
    }

    try {
      const patient = await patientService._getPatientWithContactInfoForInternalUse(receiptData.patientId);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }
      const targetEmail = patient.email;

      if (!targetEmail) {
        res.status(404).json({ error: 'Patient email not available in the database.' });
        return;
      }

      const amountPaidNow = parseFloat(receiptData.amountPaid || 0);
      const totalDueForTx = parseFloat(receiptData.totalDueFromPatient || 0);
      const previousOutstanding = parseFloat(patient.outstanding as string || '0');
      const balanceChangeFromTx = totalDueForTx - amountPaidNow;
      const newFinalOutstanding = previousOutstanding + balanceChangeFromTx;

      await patientService.updatePatient(patient.id, { outstanding: newFinalOutstanding.toFixed(2) });

      // MODIFICATION: The payload now includes the definitive new outstanding balance calculated above.
      // This ensures the email template receives the exact same value that was saved to the database.
      const emailPayload = {
        ...receiptData,
        outstanding: newFinalOutstanding.toFixed(2)
      };

      const emailResult = await emailService.sendReceiptEmail(targetEmail, emailPayload, senderUserId);

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

  /**
   * Fetches all receipt data from Google Sheets (Sheet2) for revenue reporting.
   * Accessible by 'owner' and 'staff' roles.
   */
  getRevenueReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const allReceiptsData = await googleSheetsService.getReceiptsData();
      res.status(200).json(allReceiptsData);
    } catch (error) {
      console.error('Error fetching revenue report from Google Sheets:', error);
      res.status(500).json({ error: 'Failed to retrieve revenue data for report.' });
    }
  };
}

export const receiptController = new ReceiptController();
