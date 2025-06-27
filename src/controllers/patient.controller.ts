import { Request, Response, NextFunction } from 'express';
import { patientService } from '../services/patient.service';
import { InferInsertModel } from 'drizzle-orm';
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

  // --- PATIENT & FAMILY MANAGEMENT ---

  submitGuestPatient = async (req: Request, res: Response): Promise<void> => {
    const { name, sex, dateOfBirth, phoneNumber, email, hmo } = req.body;

    if (!name || !sex || !phoneNumber) {
      res.status(400).json({ error: 'Name, sex, and phone number are required for a primary patient.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }

    try {
      const newPatient = await patientService.addGuestPatient({
        name,
        sex,
        dateOfBirth,
        phoneNumber,
        email,
        hmo,
      });

      res.status(201).json({ message: 'Patient information submitted successfully.', patient: newPatient });

    } catch (error: any) {
      console.error('Error submitting guest patient info:', error);
      if (error.message.includes('phone number already exists')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Server error during patient submission.' });
      }
    }
  };

  /**
   * Controller to handle the submission of a whole family unit at once.
   * Creates a family head and their associated members.
   */
  submitGuestFamilyPatient = async (req: Request, res: Response): Promise<void> => {
    const { members, ...headData } = req.body;
    const { name, sex, phoneNumber, email } = headData;

    // --- Validation ---
    if (!name || !sex || !phoneNumber) {
      res.status(400).json({ error: 'Name, sex, and phone number are required for the family head.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format for the family head.' });
      return;
    }
    if (!Array.isArray(members) || members.length === 0) {
        res.status(400).json({ error: 'At least one family member must be provided in the "members" array.' });
        return;
    }
    for (const member of members) {
        if (!member.name || !member.sex) {
            res.status(400).json({ error: 'Each family member must have a name and sex.' });
            return;
        }
    }

    try {
        const newFamily = await patientService.addGuestFamilyPatient(req.body);
        res.status(201).json({ message: 'Family patient information submitted successfully.', family: newFamily });

    } catch (error: any) {
        console.error('Error submitting guest family patient info:', error);
        if (error.message.includes('phone number already exists')) {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Server error during family patient submission.' });
        }
    }
  };


  addFamilyMember = async (req: Request, res: Response): Promise<void> => {
    const headId = parseInt(req.params.headId, 10);
    const { name, sex, dateOfBirth } = req.body;

    if (isNaN(headId)) {
      res.status(400).json({ error: 'Invalid family head ID.' });
      return;
    }
    if (!name || !sex) {
      res.status(400).json({ error: 'Name and sex are required for a family member.' });
      return;
    }

    try {
      const newMember = await patientService.addFamilyMember(headId, { name, sex, dateOfBirth });
      res.status(201).json({ message: 'Family member added successfully.', patient: newMember });
    } catch (error: any) {
      console.error('Error adding family member:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Server error adding family member.' });
      }
    }
  };

  recordReturningGuestVisit = async (req: Request, res: Response): Promise<void> => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ error: 'Phone number is required.' });
      return;
    }

    try {
      const result = await patientService.addReturningGuest(phoneNumber);
      res.status(200).json(result);
    } catch (error: any) {
      console.error('Error recording returning guest visit:', error);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Server error during visit recording.' });
      }
    }
  };

  getAllPatients = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const allPatients = await patientService.getAllPatients();

      if (req.user?.role === 'nurse') {
        const filteredPatients = allPatients.map(patient => {
          const { phoneNumber, email, ...safePatientData } = patient;
          const safePatient: any = { ...safePatientData };

          if (safePatient.familyHead) {
            const { phoneNumber: headPhone, email: headEmail, ...safeHead } = safePatient.familyHead;
            safePatient.familyHead = safeHead;
          }

          if (safePatient.familyMembers) {
            safePatient.familyMembers = safePatient.familyMembers.map((member: any) => {
              const { phoneNumber: memberPhone, email: memberEmail, ...safeMember } = member;
              return safeMember;
            });
          }
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
      
      if (req.user?.role === 'nurse') {
        const { phoneNumber, email, ...safePatientData } = patient;
        const safePatient: any = { ...safePatientData };

        if (safePatient.familyHead) {
          const { phoneNumber: headPhone, email: headEmail, ...safeHead } = safePatient.familyHead;
          safePatient.familyHead = safeHead;
        }
        if (safePatient.familyMembers) {
          safePatient.familyMembers = safePatient.familyMembers.map((member: any) => {
            const { phoneNumber: memberPhone, email: memberEmail, ...safeMember } = member;
            return safeMember;
          });
        }
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
    const { name, sex, dateOfBirth, phoneNumber, email, hmo } = req.body;

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }
    if (!name || !sex) {
      res.status(400).json({ error: 'Name and sex are required.' });
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
        hmo,
      };

      Object.keys(updateData).forEach(key => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]);

      const result = await patientService.updatePatient(patientId, updateData);

      if (!result.success) {
        res.status(result.message.includes('not found') ? 404 : 409).json({ error: result.message });
        return;
      }
      res.json({ message: 'Patient information updated successfully.' });

    } catch (error: any) {
      console.error('Error in updatePatient controller:', error);
      res.status(500).json({ error: 'Server error updating patient information.' });
    }
  }

  // --- APPOINTMENT SCHEDULING & REMINDERS ---

  scheduleNextAppointment = async (req: Request, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId, 10);
    const { interval } = req.body; // e.g., "1 week"

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    if (!interval || typeof interval !== 'string') {
      res.status(400).json({ error: 'An interval string must be provided.' });
      return;
    }

    try {
      const result = await patientService.scheduleNextAppointment(patientId, interval);

      if (!result.success) {
        // Handle specific errors from the service layer
        const statusCode = result.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({ error: result.message });
        return;
      }
      
      res.status(200).json({ message: result.message, patient: result.patient });

    } catch (error) {
      console.error('Error in scheduleNextAppointment controller:', error);
      res.status(500).json({ error: 'Server error scheduling next appointment.' });
    }
  }

  /**
   * NEW: Controller to send an appointment reminder.
   */
  sendAppointmentReminder = async (req: Request, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId, 10);

    if (isNaN(patientId)) {
        res.status(400).json({ error: 'Invalid patient ID.' });
        return;
    }

    try {
        const result = await patientService.sendAppointmentReminder(patientId);

        if (!result.success) {
            const statusCode = result.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({ error: result.message });
            return;
        }

        res.status(200).json({ message: result.message });

    } catch (error) {
        console.error('Error in sendAppointmentReminder controller:', error);
        res.status(500).json({ error: 'Server error sending reminder.' });
    }
  };


  // --- DENTAL RECORD MANAGEMENT ---

  createDentalRecord = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const patientId = parseInt(req.params.patientId);
    const doctorId = req.user!.userId;

    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }

    const recordData: Partial<InferInsertModel<typeof dentalRecords>> = req.body;

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
      const updateData: Partial<InferInsertModel<typeof dentalRecords>> = req.body;
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
