// src/controllers/patient.controller.ts
import { Request, Response, NextFunction } from 'express';
import { patientService } from '../services/patient.service';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { patients, dentalRecords } from '../../db/schema';

// Extend the Request type to include the user property from your middleware
interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class PatientController {
  constructor() {}

  // PATIENT MANAGEMENT

   submitGuestPatient = async (req: Request, res: Response): Promise<void> => {
    const { name, sex, dateOfBirth, phoneNumber, email } = req.body;

    // Basic client-side validation (can be more robust with a validation library)
    if (!name || !sex || !phoneNumber) {
      res.status(400).json({ error: 'Name, sex, and phone number are required.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      // Delegate the business logic to the service
      const newPatient = await patientService.addGuestPatient({
        name,
        sex,
        dateOfBirth,
        phoneNumber,
        email,
      });

      res.status(201).json({ message: 'Patient information submitted successfully.', patient: newPatient });

    } catch (error: any) {
      console.error('Error submitting guest patient info:', error);
      // Handle specific errors thrown by the service
      if (error.message.includes('phone number already exists')) { // Check message for conflict
        res.status(409).json({ error: error.message }); // Send the specific error message
      } else if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') { // Example SQL duplicate entry codes
        // This catch for ER_DUP_ENTRY might still be relevant if email unique constraint causes it
        res.status(409).json({ error: 'A patient with this email or phone number already exists.' });
      }
      else {
        res.status(500).json({ error: 'Server error during patient submission.' });
      }
    }
  };

  getAllPatients = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const allPatients = await patientService.getAllPatients();

      // If the user is a 'nurse', filter out phone numbers and emails
      if (req.user?.role === 'nurse') {
        const filteredPatients = allPatients.map(patient => {
          const { phoneNumber, email, ...safePatient } = patient;
          return safePatient;
        });
        res.json(filteredPatients);
      } else {
        res.json(allPatients);
      }
    } catch (error) {
      console.error('Error in getAllPatients controller:', error);
      res.status(500).json({ error: 'Server error fetching patients.' });
    }
  }

  getPatientById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.id);

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    try {
      const patient = await patientService.getPatientById(patientId);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }

      // If the user is a 'nurse', filter out phone number and email
      if (req.user?.role === 'nurse') {
        const { phoneNumber, email, ...safePatient } = patient;
        res.json(safePatient);
      } else {
        res.json(patient);
      }
    } catch (error) {
      console.error('Error in getPatientById controller:', error);
      res.status(500).json({ error: 'Server error fetching patient.' });
    }
  }

  updatePatient = async (req: Request, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.id);
    const { name, sex, dateOfBirth, phoneNumber, email } = req.body;

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }
    if (!name || !sex || !phoneNumber) {
      res.status(400).json({ error: 'Name, sex, and phone number are required.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      const updateData: Partial<InferInsertModel<typeof patients>> = {
        name,
        sex,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        phoneNumber,
        email,
      };

      const result = await patientService.updatePatient(patientId, updateData);

      if (!result.success) {
        res.status(result.message.includes('not found') ? 404 : 409).json({ error: result.message });
        return;
      }
      res.json({ message: 'Patient information updated successfully.' });

    } catch (error: any) {
      console.error('Error in updatePatient controller:', error);
      // Catch specific Drizzle/DB errors here if needed
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'A patient with this phone number or email already exists.' });
        return;
      }
      res.status(500).json({ error: 'Server error updating patient information.' });
    }
  }

  // DENTAL RECORD MANAGEMENT (No changes needed, nurses can manage dental records)

  createDentalRecord = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId);
    const doctorId = req.user!.userId; // Guaranteed by authenticateToken

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    const recordData: Partial<InferInsertModel<typeof dentalRecords>> = {
      complaint: req.body.complaint || null,
      historyOfPresentComplaint: req.body.historyOfPresentComplaint || null,
      pastDentalHistory: req.body.pastDentalHistory || null,
      medicationS: req.body.medicationS || null,
      medicationH: req.body.medicationH || null,
      medicationA: req.body.medicationA || null,
      medicationD: req.body.medicationD || null,
      medicationE: req.body.medicationE || null,
      medicationPUD: req.body.medicationPUD || null,
      medicationBloodDisorder: req.body.medicationBloodDisorder || null,
      medicationAllergy: req.body.medicationAllergy || null,
      familySocialHistory: req.body.familySocialHistory || null,
      extraOralExamination: req.body.extraOralExamination || null,
      intraOralExamination: req.body.intraOralExamination || null,
      teethPresent: req.body.teethPresent || null,
      cariousCavity: req.body.cariousCavity || null,
      filledTeeth: req.body.filledTeeth || null,
      missingTeeth: req.body.missingTeeth || null,
      fracturedTeeth: req.body.fracturedTeeth || null,
      periodontalCondition: req.body.periodontalCondition || null,
      oralHygiene: req.body.oralHygiene || null,
      investigations: req.body.investigations || null,
      xrayFindings: req.body.xrayFindings || null,
      provisionalDiagnosis: req.body.provisionalDiagnosis || null,
      treatmentPlan: req.body.treatmentPlan || null,
      calculus: req.body.calculus || null,
    };

    try {
      const result = await patientService.createDentalRecord(patientId, doctorId, recordData);

      if (!result.success) {
        res.status((result.message?.includes('not found') ? 404 : 500)).json({ error: result.message ?? 'Unknown error.' });
        return;
      }
      res.status(201).json({ message: 'Dental record created successfully.', record: result.record });

    } catch (error) {
      console.error('Error in createDentalRecord controller:', error);
      res.status(500).json({ error: 'Server error creating dental record.' });
    }
  }

  getDentalRecordsByPatientId = async (req: Request, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId);

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    try {
      const records = await patientService.getDentalRecordsByPatientId(patientId);
      res.json(records);
    } catch (error) {
      console.error('Error in getDentalRecordsByPatientId controller:', error);
      res.status(500).json({ error: 'Server error fetching dental records.' });
    }
  }

  getSpecificDentalRecordForPatient = async (req: Request, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId);
    const recordId = parseInt(req.params.recordId);

    if (isNaN(patientId) || isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid patient ID or record ID.' });
      return;
    }

    try {
      const record = await patientService.getSpecificDentalRecordForPatient(patientId, recordId);
      if (!record) {
        res.status(404).json({ error: 'Dental record not found for this patient.' });
        return;
      }
      res.json(record);
    } catch (error) {
      console.error('Error in getSpecificDentalRecordForPatient controller:', error);
      res.status(500).json({ error: 'Server error fetching dental record.' });
    }
  }

  getDentalRecordById = async (req: Request, res: Response): Promise<void> => {
    const recordId = parseInt(req.params.id);

    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID.' });
      return;
    }

    try {
      const record = await patientService.getDentalRecordById(recordId);
      if (!record) {
        res.status(404).json({ error: 'Dental record not found.' });
        return;
      }
      res.json(record);
    } catch (error) {
      console.error('Error in getDentalRecordById controller:', error);
      res.status(500).json({ error: 'Server error fetching dental record.' });
    }
  }

  updateDentalRecord = async (req: Request, res: Response): Promise<void> => {
    const recordId = parseInt(req.params.id);

    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID.' });
      return;
    }

    try {
      const updateData: Partial<InferInsertModel<typeof dentalRecords>> = {};
      const allowedFields: (keyof InferInsertModel<typeof dentalRecords>)[] = [
        'complaint', 'historyOfPresentComplaint', 'pastDentalHistory',
        'medicationS', 'medicationH', 'medicationA', 'medicationD', 'medicationE',
        'medicationPUD', 'medicationBloodDisorder', 'medicationAllergy',
        'familySocialHistory', 'extraOralExamination', 'intraOralExamination',
        'teethPresent', 'cariousCavity', 'filledTeeth', 'missingTeeth',
        'fracturedTeeth', 'periodontalCondition', 'oralHygiene',
        'investigations', 'xrayFindings', 'provisionalDiagnosis', 'treatmentPlan', 'calculus'
      ];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const result = await patientService.updateDentalRecord(recordId, updateData);

      if (!result.success) {
        res.status(404).json({ error: result.message });
        return;
      }
      res.json({ message: 'Dental record updated successfully.' });

    } catch (error) {
      console.error('Error in updateDentalRecord controller:', error);
      res.status(500).json({ error: 'Server error updating dental record.' });
    }
  }

  deleteDentalRecord = async (req: Request, res: Response): Promise<void> => {
    const recordId = parseInt(req.params.id);

    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID.' });
      return;
    }

    try {
      const result = await patientService.deleteDentalRecord(recordId);
      if (!result.success) {
        res.status(404).json({ error: result.message });
        return;
      }
      res.json({ message: 'Dental record deleted successfully.' });

    } catch (error) {
      console.error('Error in deleteDentalRecord controller:', error);
      res.status(500).json({ error: 'Server error deleting dental record.' });
    }
  }
}

export const patientController = new PatientController();