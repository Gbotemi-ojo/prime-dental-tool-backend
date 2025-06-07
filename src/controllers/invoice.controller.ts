// src/controllers/invoice.controller.ts
import { Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { patientService } from '../services/patient.service'; // To fetch patient email
import { users } from '../../db/schema'; // For user roles

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class InvoiceController {
  constructor() {}

  sendInvoice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { patientId, invoiceNumber, invoiceDate, totalAmount, items } = req.body;
    const senderUserId = req.user!.userId; // User sending the invoice

    if (!patientId || !invoiceNumber || !invoiceDate || totalAmount === undefined || !items || !Array.isArray(items)) {
      res.status(400).json({ error: 'Patient ID, invoice number, date, total amount, and items are required.' });
      return;
    }

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    try {
      const patient = await patientService.getPatientById(patientId);
      if (!patient || !patient.email) {
        res.status(404).json({ error: 'Patient not found or patient email not available.' });
        return;
      }

      const invoiceData = {
        invoiceNumber,
        invoiceDate,
        patientName: patient.name,
        totalAmount,
        items,
      };

      const emailResult = await emailService.sendInvoiceEmail(patient.email, invoiceData, senderUserId);

      if (emailResult.success) {
        res.status(200).json({ message: 'Invoice sent successfully!', messageId: emailResult.messageId });
      } else {
        console.error('Failed to send invoice email:', emailResult.error);
        res.status(500).json({ error: 'Failed to send invoice email.', details: emailResult.error });
      }
    } catch (error) {
      console.error('Error in sendInvoice controller:', error);
      res.status(500).json({ error: 'Server error sending invoice.' });
    }
  }
}

export const invoiceController = new InvoiceController();
