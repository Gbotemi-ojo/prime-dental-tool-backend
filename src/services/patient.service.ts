// src/services/patient.service.ts
import { eq, ne, and, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { patients, dentalRecords, users } from '../../db/schema';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { googleSheetsService } from './googleSheets.service';
import { emailService } from './email.service'; // Import the email service

// Define types for better type safety in service layer
type PatientInsert = InferInsertModel<typeof patients>;
type DentalRecordInsert = InferInsertModel<typeof dentalRecords>;
type DentalRecordSelect = InferSelectModel<typeof dentalRecords>;
interface NewPatientData {
  name: string;
  sex: string;
  dateOfBirth?: string | null; // Optional, can be null
  phoneNumber: string;
  email?: string | null; // Optional, can be null
}

export class PatientService {
  constructor() {}

  async addGuestPatient(patientData: NewPatientData) {
    const { name, sex, dateOfBirth, phoneNumber, email } = patientData;

    // Check if a patient with this phone number already exists
    const existingPatient = await db.select()
      .from(patients)
      .where(eq(patients.phoneNumber, phoneNumber))
      .limit(1);

    if (existingPatient.length > 0) {
      throw new Error('A patient with this phone number already exists.');
    }

    // Insert the new patient into the database
    const [inserted] = await db.insert(patients).values({
      name,
      sex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null, // Convert date string to Date object
      phoneNumber,
      email: email || null, // Ensure email is null if empty string
      createdAt: new Date(), // Add creation timestamp
      updatedAt: new Date(), // Add update timestamp
    });

    // Retrieve the newly inserted patient using its insertId
    const [newPatient] = await db.select().from(patients).where(eq(patients.id, inserted.insertId)).limit(1);

    if (!newPatient) {
      throw new Error('Failed to retrieve newly created patient.');
    }

    // Attempt to save to Google Sheets after successful DB insertion
    try {
      // UPDATED: Format current date to YYYY-MM-DD for Google Sheets
      const currentFormattedDate = new Date().toISOString().split('T')[0];
      await googleSheetsService.appendRow([
        newPatient.name,
        newPatient.sex,
        newPatient.dateOfBirth ? newPatient.dateOfBirth.toISOString().split('T')[0] : '', // Format date to YYYY-MM-DD
        newPatient.phoneNumber,
        newPatient.email || '', // Ensure email is an empty string if null
        currentFormattedDate // Use the formatted submission date for 'firstAppointment'
      ]);
      console.log('Patient data successfully appended to Google Sheet (Patient Registration Sheet).');
    } catch (sheetError: any) {
      console.warn(`Warning: Could not save patient to Google Sheet during registration: ${sheetError.message}`);
      // Log a warning if saving to Google Sheets fails, but do not block the patient creation
      // if database insertion was successful.
    }

    // NEW: Send email notification to owner and staff about new patient registration
    try {
      const ownerEmail = process.env.OWNER_EMAIL || '';
      // Dynamically get staff emails (excluding nurses) using the email service's private method
      const staffEmails = await (emailService as any)._getStaffEmailsExcludingNurses(); 

      const allRecipients = [...staffEmails];
      if (ownerEmail && !allRecipients.includes(ownerEmail)) {
          allRecipients.push(ownerEmail);
      }

      if (allRecipients.length > 0) {
          const subject = 'New Guest Patient Registration';
          const htmlContent = `
              <h2>New Guest Patient Registered!</h2>
              <p>A new guest patient has been registered in the system:</p>
              <ul>
                  <li><strong>Name:</strong> ${newPatient.name}</li>
                  <li><strong>Sex:</strong> ${newPatient.sex}</li>
                  <li><strong>Date of Birth:</strong> ${newPatient.dateOfBirth ? newPatient.dateOfBirth.toLocaleDateString() : 'N/A'}</li>
                  <li><strong>Phone Number:</strong> ${newPatient.phoneNumber}</li>
                  <li><strong>Email:</strong> ${newPatient.email || 'N/A'}</li>
                  <li><strong>Registration Date:</strong> ${new Date(newPatient.createdAt!).toLocaleDateString()}</li>
              </ul>
              <p>Please log in to the EMR system for more details.</p>
              <p>Thank you,</p>
              <p>Prime Dental Clinic EMR System</p>
          `;

          // Send to all recipients (can be optimized to a single BCC call if many recipients)
          // For simplicity and directness, sending as 'to' for now as requested for notification
          await emailService.sendEmail(allRecipients.join(','), subject, htmlContent); 
          console.log('New guest patient registration email sent to owner and staff.');
      } else {
          console.warn('No owner or staff emails configured to send new guest patient notification.');
      }
    } catch (emailError: any) {
      console.error(`Error sending new patient registration email: ${emailError.message}`);
    }

    return newPatient;
  }

  async getAllPatients() {
    return await db.select().from(patients);
  }

  async getPatientById(patientId: number) {
    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    return patient;
  }

  async updatePatient(patientId: number, patientData: Partial<PatientInsert>) {
    const [existingPatient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!existingPatient) {
      return { success: false, message: 'Patient not found.' };
    }

    if (patientData.phoneNumber && patientData.phoneNumber !== existingPatient.phoneNumber) {
      const [conflictByPhone] = await db.select().from(patients)
        .where(and(eq(patients.phoneNumber, patientData.phoneNumber), ne(patients.id, patientId)))
        .limit(1);
      if (conflictByPhone) {
        return { success: false, message: 'Another patient already exists with this phone number.' };
      }
    }

    if (patientData.email && patientData.email !== existingPatient.email) {
      const [conflictByEmail] = await db.select().from(patients)
        .where(and(eq(patients.email, patientData.email), ne(patients.id, patientId)))
        .limit(1);
      if (conflictByEmail) {
        return { success: false, message: 'Another patient already exists with this email.' };
      }
    }

    await db.update(patients).set({
      ...patientData,
      updatedAt: new Date(),
    }).where(eq(patients.id, patientId));

    return { success: true, message: 'Patient information updated successfully.' };
  }

  async createDentalRecord(patientId: number, doctorId: number, recordData: Partial<DentalRecordInsert>) {
    const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!patientExists) {
      return { success: false, message: 'Patient not found.' };
    }

    const newRecord: DentalRecordInsert = {
      patientId,
      doctorId,
      ...recordData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [inserted] = await db.insert(dentalRecords).values(newRecord);
    const newRecordId = (inserted as any).insertId;

    const [newDentalRecord] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, newRecordId)).limit(1);

    if (!newDentalRecord) {
      return { success: false, message: 'Dental record added but could not be found immediately after.' };
    }

    return { success: true, record: newDentalRecord };
  }

  async getDentalRecordsByPatientId(patientId: number) {
    return await db
      .select({
        id: dentalRecords.id,
        patientId: dentalRecords.patientId,
        doctorId: dentalRecords.doctorId,
        doctorUsername: users.username,
        complaint: dentalRecords.complaint,
        historyOfPresentComplaint: dentalRecords.historyOfPresentComplaint,
        pastDentalHistory: dentalRecords.pastDentalHistory,
        medicationS: dentalRecords.medicationS,
        medicationH: dentalRecords.medicationH,
        medicationA: dentalRecords.medicationA,
        medicationD: dentalRecords.medicationD,
        medicationE: dentalRecords.medicationE,
        medicationPUD: dentalRecords.medicationPUD,
        medicationBloodDisorder: dentalRecords.medicationBloodDisorder,
        medicationAllergy: dentalRecords.medicationAllergy,
        familySocialHistory: dentalRecords.familySocialHistory,
        extraOralExamination: dentalRecords.extraOralExamination,
        intraOralExamination: dentalRecords.intraOralExamination,
        teethPresent: dentalRecords.teethPresent,
        cariousCavity: dentalRecords.cariousCavity,
        filledTeeth: dentalRecords.filledTeeth,
        missingTeeth: dentalRecords.missingTeeth,
        fracturedTeeth: dentalRecords.fracturedTeeth,
        periodontalCondition: dentalRecords.periodontalCondition,
        oralHygiene: dentalRecords.oralHygiene,
        investigations: dentalRecords.investigations,
        xrayFindings: dentalRecords.xrayFindings,
        provisionalDiagnosis: dentalRecords.provisionalDiagnosis,
        treatmentPlan: dentalRecords.treatmentPlan,
        calculus: dentalRecords.calculus,
        createdAt: dentalRecords.createdAt,
        updatedAt: dentalRecords.updatedAt,
      })
      .from(dentalRecords)
      .leftJoin(users, eq(dentalRecords.doctorId, users.id))
      .where(eq(dentalRecords.patientId, patientId))
      .orderBy(desc(dentalRecords.createdAt));
  }

  async getSpecificDentalRecordForPatient(patientId: number, recordId: number) {
    const [record] = await db.select({
      id: dentalRecords.id,
      patientId: dentalRecords.patientId,
      doctorId: dentalRecords.doctorId,
      doctorUsername: users.username,
      complaint: dentalRecords.complaint,
      historyOfPresentComplaint: dentalRecords.historyOfPresentComplaint,
      pastDentalHistory: dentalRecords.pastDentalHistory,
      medicationS: dentalRecords.medicationS,
      medicationH: dentalRecords.medicationH,
      medicationA: dentalRecords.medicationA,
      medicationD: dentalRecords.medicationD,
      medicationE: dentalRecords.medicationE,
      medicationPUD: dentalRecords.medicationPUD,
      medicationBloodDisorder: dentalRecords.medicationBloodDisorder,
      medicationAllergy: dentalRecords.medicationAllergy,
      familySocialHistory: dentalRecords.familySocialHistory,
      extraOralExamination: dentalRecords.extraOralExamination,
      intraOralExamination: dentalRecords.intraOralExamination,
      teethPresent: dentalRecords.teethPresent,
      cariousCavity: dentalRecords.cariousCavity,
      filledTeeth: dentalRecords.filledTeeth,
      missingTeeth: dentalRecords.missingTeeth,
      fracturedTeeth: dentalRecords.fracturedTeeth,
      periodontalCondition: dentalRecords.periodontalCondition,
      oralHygiene: dentalRecords.oralHygiene,
      investigations: dentalRecords.investigations,
      xrayFindings: dentalRecords.xrayFindings,
      provisionalDiagnosis: dentalRecords.provisionalDiagnosis,
      treatmentPlan: dentalRecords.treatmentPlan,
      calculus: dentalRecords.calculus,
      createdAt: dentalRecords.createdAt,
      updatedAt: dentalRecords.updatedAt,
    })
      .from(dentalRecords)
      .leftJoin(users, eq(dentalRecords.doctorId, users.id))
      .where(and(
        eq(dentalRecords.patientId, patientId),
        eq(dentalRecords.id, recordId)
      ))
      .limit(1);
    return record;
  }

  async getDentalRecordById(recordId: number) {
    const [record] = await db.select({
      id: dentalRecords.id,
      patientId: dentalRecords.patientId,
      doctorId: dentalRecords.doctorId,
      doctorUsername: users.username,
      complaint: dentalRecords.complaint,
      historyOfPresentComplaint: dentalRecords.historyOfPresentComplaint,
      pastDentalHistory: dentalRecords.pastDentalHistory,
      medicationS: dentalRecords.medicationS,
      medicationH: dentalRecords.medicationH,
      medicationA: dentalRecords.medicationA,
      medicationD: dentalRecords.medicationD,
      medicationE: dentalRecords.medicationE,
      medicationPUD: dentalRecords.medicationPUD,
      medicationBloodDisorder: dentalRecords.medicationBloodDisorder,
      medicationAllergy: dentalRecords.medicationAllergy,
      familySocialHistory: dentalRecords.familySocialHistory,
      extraOralExamination: dentalRecords.extraOralExamination,
      intraOralExamination: dentalRecords.intraOralExamination,
      teethPresent: dentalRecords.teethPresent,
      cariousCavity: dentalRecords.cariousCavity,
      filledTeeth: dentalRecords.filledTeeth,
      missingTeeth: dentalRecords.missingTeeth,
      fracturedTeeth: dentalRecords.fracturedTeeth,
      periodontalCondition: dentalRecords.periodontalCondition,
      oralHygiene: dentalRecords.oralHygiene,
      investigations: dentalRecords.investigations,
      xrayFindings: dentalRecords.xrayFindings,
      provisionalDiagnosis: dentalRecords.provisionalDiagnosis,
      treatmentPlan: dentalRecords.treatmentPlan,
      calculus: dentalRecords.calculus,
      createdAt: dentalRecords.createdAt,
      updatedAt: dentalRecords.updatedAt,
    })
      .from(dentalRecords)
      .leftJoin(users, eq(dentalRecords.doctorId, users.id))
      .where(eq(dentalRecords.id, recordId))
      .limit(1);
    return record;
  }

  async updateDentalRecord(recordId: number, updateData: Partial<DentalRecordInsert>) {
    const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
    if (!recordExists) {
      return { success: false, message: 'Dental record not found.' };
    }

    const cleanedUpdateData: Partial<DentalRecordInsert> = { ...updateData };
    delete cleanedUpdateData.patientId; // Prevent changing patientId
    delete cleanedUpdateData.doctorId;   // Prevent changing doctorId

    await db.update(dentalRecords).set({
      ...cleanedUpdateData,
      updatedAt: new Date(),
    }).where(eq(dentalRecords.id, recordId));

    return { success: true, message: 'Dental record updated successfully.' };
  }

  async deleteDentalRecord(recordId: number) {
    const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
    if (!recordExists) {
      return { success: false, message: 'Dental record not found.' };
    }

    await db.delete(dentalRecords).where(eq(dentalRecords.id, recordId));
    return { success: true, message: 'Dental record deleted successfully.' };
  }
}

export const patientService = new PatientService();
