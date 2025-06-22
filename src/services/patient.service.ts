// src/services/patient.service.ts
import { eq, ne, and, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { patients, dentalRecords, users } from '../../db/schema'; // Ensure schema is up-to-date with your latest version
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
  hmo?: { name: string; status?: string } | null; // Updated HMO type for clarity
}

export class PatientService {
  constructor() {}

  async addGuestPatient(patientData: NewPatientData) {
    const { name, sex, dateOfBirth, phoneNumber, email, hmo } = patientData;

    // Check if a patient with this phone number already exists
    const existingPatient = await db.select()
      .from(patients)
      .where(eq(patients.phoneNumber, phoneNumber))
      .limit(1);

    if (existingPatient.length > 0) {
      throw new Error('A patient with this phone number already exists.');
    }

    const now = new Date(); // Current timestamp for operation

    // Insert the new patient into the database.
    // firstAppointment and lastAppointment are NOT inserted into DB, only createdAt and updatedAt.
    const [inserted] = await db.insert(patients).values({
      name,
      sex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null, // Convert date string to Date object
      phoneNumber,
      email: email || null, // Ensure email is null if empty string
      hmo: hmo || null, // Add hmo field to insertion (as JSON object from frontend)
      createdAt: now, // Add creation timestamp (this will act as firstAppointment for sheets)
      updatedAt: now, // Add update timestamp
    });

    // Retrieve the newly inserted patient using its insertId
    // Ensure we are only selecting fields present in the DB schema
    const [newPatient] = await db.select().from(patients).where(eq(patients.id, inserted.insertId)).limit(1);

    if (!newPatient) {
      throw new Error('Failed to retrieve newly created patient.');
    }

    // Attempt to save to Google Sheets after successful DB insertion
    try {
      // Format dates to ISO-MM-DD for Google Sheets
      const dobFormatted = newPatient.dateOfBirth ? newPatient.dateOfBirth.toISOString().split('T')[0] : '';
      // 'First Appointment' for Google Sheets is the patient's creation timestamp in the DB
      const firstApptFormatted = newPatient.createdAt ? newPatient.createdAt.toISOString().split('T')[0] : '';
      // 'Last Appointment' (Next Appointment) for a new guest patient should be blank in Google Sheets
      const lastApptFormatted = '';

      // Extract HMO name directly from the hmo object received from the frontend
      const hmoNameForSheet = newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name
        ? (newPatient.hmo as { name?: string }).name
        : ''; // Use empty string if HMO is null or invalid

      await googleSheetsService.appendRow([
        newPatient.name,
        newPatient.sex,
        dobFormatted,
        newPatient.phoneNumber,
        newPatient.email || '',
        hmoNameForSheet, // UPDATED: Send only HMO name to Google Sheets
        firstApptFormatted, // First Appointment (from DB createdAt)
        lastApptFormatted   // UPDATED: Blank for initial registration in Google Sheets
      ]);
      console.log('Patient data successfully appended to Google Sheet (Patient Registration Sheet).');
    } catch (sheetError: any) {
      console.warn(`Warning: Could not save patient to Google Sheet during registration: ${sheetError.message}`);
    }

    // Send email notification to owner and staff about new patient registration
    try {
      const ownerEmail = process.env.OWNER_EMAIL || '';
      const staffEmails = await (emailService as any)._getStaffEmailsExcludingNurses();

      const allRecipients = [...staffEmails];
      if (ownerEmail && !allRecipients.includes(ownerEmail)) {
        allRecipients.push(ownerEmail);
      }

      if (allRecipients.length > 0) {
        // 'First Appointment' for email content is the patient's createdAt from DB
        const firstApptEmail = newPatient.createdAt ? newPatient.createdAt.toLocaleDateString() : 'N/A';
        // 'Last Appointment' for email on initial registration is N/A
        const lastApptEmail = 'N/A';

        const subject = 'New Patient Registration';
        const htmlContent = `
            <h2>New Patient Registered!</h2>
            <p>A new patient has been registered in the system:</p>
            <ul>
                <li><strong>Name:</strong> ${newPatient.name}</li>
                <li><strong>Sex:</strong> ${newPatient.sex}</li>
                <li><strong>Date of Birth:</strong> ${newPatient.dateOfBirth ? newPatient.dateOfBirth.toLocaleDateString() : 'N/A'}</li>
                <li><strong>Phone Number:</strong> ${newPatient.phoneNumber}</li>
                <li><strong>Email:</strong> ${newPatient.email || 'N/A'}</li>
                <li><strong>HMO:</strong> ${newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name ? (newPatient.hmo as { name?: string }).name : 'N/A'}</li>
                <li><strong>Registration Date:</strong> ${new Date(newPatient.createdAt!).toLocaleDateString()}</li>
            </ul>
            <p>Please log in to the EMR system for more details.</p>
            <p>Thank you,</p>
            <p>Prime Dental Clinic EMR System</p>
          `;

        await emailService.sendEmail(allRecipients.join(','), subject, htmlContent);
        console.log('New patient registration email sent to owner and staff.');
      } else {
        console.warn('No owner or staff emails configured to send new guest patient notification.');
      }
    } catch (emailError: any) {
      console.error(`Error sending new patient registration email: ${emailError.message}`);
    }

    return newPatient;
  }

  /**
   * Records a visit for an existing patient by their phone number in Google Sheets.
   * This function does NOT save to the database; it only logs the visit in Google Sheets.
   * @param phoneNumber The phone number of the returning patient.
   * @returns An object confirming the visit recording and patient name.
   */
  async addReturningGuest(phoneNumber: string) {
    // Find the patient by phone number
    // Ensure we are only selecting fields present in the DB schema
    const [patient] = await db.select()
      .from(patients)
      .where(eq(patients.phoneNumber, phoneNumber))
      .limit(1);

    if (!patient) {
      throw new Error('Patient with this phone number not found.');
    }

    const now = new Date(); // Current date for the visit

    // No database update for `lastAppointment` as it's not a DB field.
    // The `updatedAt` field will still automatically update on any patient data change,
    // but the `lastAppointment` concept for Google Sheets is purely derived from `now`.

    // Record the visit in Google Sheets
    try {
      // Format dates to ISO-MM-DD for Google Sheets
      const dobFormatted = patient?.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : '';
      // 'First Appointment' for Google Sheets is derived from patient.createdAt (original registration date)
      const firstApptFormatted = patient?.createdAt ? patient.createdAt.toISOString().split('T')[0] : '';
      // 'Last Appointment' (Next Appointment) for Google Sheets is the current 'now' for this returning visit
      const lastApptFormatted = now.toISOString().split('T')[0];

      // Extract HMO name directly
      const hmoNameForSheet = patient?.hmo && typeof patient.hmo === 'object' && (patient.hmo as { name?: string }).name
        ? (patient.hmo as { name?: string }).name
        : '';

      await googleSheetsService.appendRow([
        patient?.name,
        patient?.sex,
        dobFormatted,
        patient?.phoneNumber,
        patient?.email || '',
        hmoNameForSheet, // UPDATED: Send only HMO name to Google Sheets
        firstApptFormatted, // First Appointment Date (from DB createdAt)
        lastApptFormatted   // UPDATED: Current date for returning visit
      ]);
      console.log(`Visit for returning patient ${patient?.name} recorded in Google Sheet.`);
    } catch (sheetError: any) {
      console.warn(`Warning: Could not record returning patient visit to Google Sheet: ${sheetError.message}`);
    }

    // NEW: Send email notification for returning patient check-in
    try {
      const ownerEmail = process.env.OWNER_EMAIL || '';
      const staffEmails = await (emailService as any)._getStaffEmailsExcludingNurses();

      const allRecipients = [...staffEmails];
      if (ownerEmail && !allRecipients.includes(ownerEmail)) {
        allRecipients.push(ownerEmail);
      }

      if (allRecipients.length > 0) {
        const subject = `Returning Patient Check-in: ${patient.name}`;
        const htmlContent = `
            <h2>Returning Patient Checked In!</h2>
            <p>A returning patient has checked into the system:</p>
            <ul>
                <li><strong>Name:</strong> ${patient.name}</li>
                <li><strong>Phone Number:</strong> ${patient.phoneNumber}</li>
                <li><strong>Email:</strong> ${patient.email || 'N/A'}</li>
                <li><strong>HMO:</strong> ${patient.hmo && typeof patient.hmo === 'object' && (patient.hmo as { name?: string }).name ? (patient.hmo as { name?: string }).name : 'N/A'}</li>
                <li><strong>Check-in Date:</strong> ${now.toLocaleDateString()}</li>
            </ul>
            <p>Please log in to the EMR system for more details or to update their dental record.</p>
            <p>Thank you,</p>
            <p>Prime Dental Clinic EMR System</p>
          `;

        await emailService.sendEmail(allRecipients.join(','), subject, htmlContent);
        console.log('Returning patient check-in email sent to owner and staff.');
      } else {
        console.warn('No owner or staff emails configured to send returning patient notification.');
      }
    } catch (emailError: any) {
      console.error(`Error sending returning patient check-in email: ${emailError.message}`);
    }

    return { message: 'Returning guest visit recorded successfully.', patientName: patient.name, visitDate: now.toISOString().split('T')[0] };
  }

  async getAllPatients() {
    // When fetching patients, firstAppointment and lastAppointment are not part of the DB model
    return await db.select().from(patients);
  }

  async getPatientById(patientId: number) {
    // When fetching a patient, firstAppointment and lastAppointment are not part of the DB model
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

    // Ensure we don't try to update non-existent DB fields like firstAppointment/lastAppointment
    const dbUpdateData: Partial<PatientInsert> = { ...patientData };
    // Explicitly remove `firstAppointment` and `lastAppointment` from `dbUpdateData` if they somehow get included,
    // as they are not meant to be database columns.
    if ('firstAppointment' in dbUpdateData) {
      delete dbUpdateData.firstAppointment;
    }
    if ('lastAppointment' in dbUpdateData) {
      delete dbUpdateData.lastAppointment;
    }

    await db.update(patients).set({
      ...dbUpdateData,
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
      treatmentDone: recordData.treatmentDone || null,
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
        treatmentDone: dentalRecords.treatmentDone,
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
      treatmentDone: dentalRecords.treatmentDone,
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
      treatmentDone: dentalRecords.treatmentDone,
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
