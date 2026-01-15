// src/controllers/patient.controller.ts
import { Request, Response, NextFunction } from 'express';
import { patientService } from '../services/patient.service';
import { settingsService } from '../services/settings.service'; 
import { InferInsertModel } from 'drizzle-orm';
import { patients, dentalRecords } from '../../db/schema';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

// --- FORCE FIX HELPER ---
// This function swallows the type error by handling the array check manually.
const safeInt = (param: string | string[] | undefined): number => {
  if (!param) return NaN;
  const str = Array.isArray(param) ? param[0] : param;
  return parseInt(str, 10);
};
// ------------------------

export class PatientController {
  constructor() {}

  getDebtors = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const debtors = await patientService.getDebtors();
        res.json(debtors);
    } catch (error) {
        console.error('Error fetching debtors:', error);
        res.status(500).json({ error: 'Server error fetching debtors.' });
    }
  }

  getScheduledPatients = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const date = req.query.date as string | undefined;
        const settings = await settingsService.getSettings();
        const patients = await patientService.getScheduledPatients(date, req.user, settings);
        res.json(patients);
    } catch (error) {
        console.error('Error fetching scheduled patients:', error);
        res.status(500).json({ error: 'Server error fetching schedule.' });
    }
  }

  submitGuestPatient = async (req: Request, res: Response): Promise<void> => {
    const { name, sex, dateOfBirth, phoneNumber, email, address, hmo } = req.body;
    if (!name || !sex || !phoneNumber) {
      res.status(400).json({ error: 'Name, sex, and phone number are required for a primary patient.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }
    try {
      const newPatient = await patientService.addGuestPatient({ name, sex, dateOfBirth, phoneNumber, email, address, hmo });
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

  submitGuestFamilyPatient = async (req: Request, res: Response): Promise<void> => {
    const { members, ...headData } = req.body;
    const { name, sex, phoneNumber, email } = headData;
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
    // FIX: Use safeInt helper
    const headId = safeInt(req.params.headId);
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
    const { identifier } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Phone number or email identifier is required.' });
      return;
    }
    try {
      const result = await patientService.addReturningGuest(identifier);
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
      
  getTodaysReturningPatients = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const settings = await settingsService.getSettings();
        const todaysVisits = await patientService.getTodaysReturningPatients(req.user, settings);
        res.json(todaysVisits);
    } catch (error) {
        console.error('Error in getTodaysReturningPatients controller:', error);
        res.status(500).json({ error: 'Server error fetching today\'s returning patients.' });
    }
  };

  getAllPatients = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const page = safeInt(req.query.page as any) || 1;
      const limit = safeInt(req.query.limit as any) || 10;
      const search = (req.query.search as string) || '';
      const date = (req.query.date as string) || '';

      const settings = await settingsService.getSettings();
      const result = await patientService.getAllPatients(page, limit, search, date, req.user, settings);
      res.json(result);
    } catch (error) {
      console.error('Error in getAllPatients controller:', error);
      res.status(500).json({ error: 'Server error fetching patients.' });
    }
  }

  getPatientById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.id);
    if (isNaN(patientId)) {
      res.status(400).json({ error: 'Invalid patient ID.' });
      return;
    }
    try {
      const settings = await settingsService.getSettings();
      const patient = await patientService.getPatientById(patientId, req.user, settings);
      
      if (!patient) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }
      res.json(patient);
    } catch (error) {
      console.error('Error in getPatientById controller:', error);
      res.status(500).json({ error: 'Server error fetching patient.' });
    }
  }

  updatePatient = async (req: Request, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.id);
    const { name, sex, dateOfBirth, phoneNumber, email, address, hmo } = req.body;
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
      const updateData: Partial<InferInsertModel<typeof patients>> = { name, sex, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null, phoneNumber, email, address, hmo };
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

  scheduleNextAppointment = async (req: Request, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
    const { interval } = req.body;
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

  sendAppointmentReminder = async (req: Request, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
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

  sendProcedureSpecificReminder = async (req: Request, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
    const { type } = req.params;

    if (isNaN(patientId)) {
        res.status(400).json({ error: 'Invalid patient ID.' });
        return;
    }
    if (!type) {
        res.status(400).json({ error: 'Reminder type is required.' });
        return;
    }

    try {
        const result = await patientService.sendProcedureSpecificReminder(patientId, type);
        if (!result.success) {
            const statusCode = result.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({ error: result.message });
            return;
        }
        res.status(200).json({ message: result.message });
    } catch (error) {
        console.error('Error in sendProcedureSpecificReminder controller:', error);
        res.status(500).json({ error: 'Server error sending specific reminder.' });
    }
  };
  
  sendCustomEmail = async (req: Request, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
    const { subject, message } = req.body;

    if (isNaN(patientId)) {
        res.status(400).json({ error: 'Invalid patient ID.' });
        return;
    }
    if (!subject || !message) {
        res.status(400).json({ error: 'Email subject and message are required.' });
        return;
    }

    try {
        const result = await patientService.sendCustomEmail(patientId, subject, message);
        if (!result.success) {
            const statusCode = result.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({ error: result.message });
            return;
        }
        res.status(200).json({ message: result.message });
    } catch (error) {
        console.error('Error in sendCustomEmail controller:', error);
        res.status(500).json({ error: 'Server error sending custom email.' });
    }
  };


  createDentalRecord = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
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
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
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
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
    const recordId = safeInt(req.params.recordId);
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
    // FIX: Use safeInt helper
    const recordId = safeInt(req.params.id);
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

  updateDentalRecord = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const recordId = safeInt(req.params.id);
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
    // FIX: Use safeInt helper
    const recordId = safeInt(req.params.id);
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

  getDoctorSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const doctorId = safeInt(req.params.doctorId);
    if (isNaN(doctorId)) {
        res.status(400).json({ error: 'Invalid doctor ID.' });
        return;
    }
    try {
        const patients = await patientService.getPatientsForDoctor(doctorId);
        res.json(patients);
    } catch (error) {
        console.error('Error in getDoctorSchedule controller:', error);
        res.status(500).json({ error: 'Server error fetching doctor schedule.' });
    }
  }

  getAllPatientsForScheduling = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const patients = await patientService.getAllPatientsForScheduling();
        res.json(patients);
    } catch (error) {
        console.error('Error in getAllPatientsForScheduling controller:', error);
        res.status(500).json({ error: 'Server error fetching all patients for scheduling.' });
    }
  }

  assignDoctor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    // FIX: Use safeInt helper
    const patientId = safeInt(req.params.patientId);
    const { doctorId } = req.body;
    const receptionistId = req.user!.userId;

    if (isNaN(patientId) || !doctorId) {
        res.status(400).json({ error: 'Invalid patient ID or doctor ID.' });
        return;
    }
    try {
        const result = await patientService.assignDoctorToPatient(patientId, doctorId, receptionistId);
        if (!result.success) {
            res.status(500).json({ error: result.message });
            return;
        }
        res.json({ message: result.message });
    } catch (error) {
        console.error('Error in assignDoctor controller:', error);
        res.status(500).json({ error: 'Server error assigning doctor.' });
    }
  }
}

export const patientController = new PatientController();
