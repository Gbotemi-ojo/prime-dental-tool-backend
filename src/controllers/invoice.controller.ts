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
    // IMPORTANT: Ensure all expected fields from the frontend payload are destructured here.
    // Specifically added subtotal and totalDueFromPatient.
    const { patientId, invoiceNumber, invoiceDate, totalAmount, items, subtotal, totalDueFromPatient, isHmoCovered, hmoName, coveredAmount, notes, clinicName, clinicAddress, clinicPhone, clinicEmail, latestDentalRecord } = req.body;
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

      // Construct the invoiceData object, ensuring all necessary fields for the email service
      // and the Handlebars template are included.
      const invoiceData = {
        patientId, // Passed for backend context, not directly used in email template
        invoiceNumber,
        invoiceDate,
        patientName: patient.name,
        // Crucial for email totals:
        subtotal: subtotal,
        totalAmount: totalAmount, // This is `totalDue` from frontend (Total Amount Due from Patient)
        totalDueFromPatient: totalDueFromPatient, // Explicitly pass for HMO logic in template
        
        // Pass the items array as received from the frontend.
        // The EmailService will transform 'items' into 'services' for the template.
        items: items, 

        // Include HMO related fields if available
        isHmoCovered: isHmoCovered,
        hmoName: hmoName,
        coveredAmount: coveredAmount, // Ensure this is passed if HMO covered amount is relevant
        
        notes: notes,
        clinicName: clinicName,
        clinicAddress: clinicAddress,
        clinicPhone: clinicPhone,
        clinicEmail: clinicEmail,
        latestDentalRecord: latestDentalRecord, // Pass latest dental record for notes
      };

      console.log("[Controller Debug] Sending invoiceData to emailService:", invoiceData);


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
