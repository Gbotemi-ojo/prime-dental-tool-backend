import { eq, ne, and, desc, isNull } from 'drizzle-orm';
import { db } from '../config/database';
import { patients, dentalRecords, users } from '../../db/schema';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { googleSheetsService } from './googleSheets.service';
import { emailService } from './email.service';

// --- TYPE DEFINITIONS ---
type PatientInsert = InferInsertModel<typeof patients>;
type PatientSelect = InferSelectModel<typeof patients>;

interface NewFamilyHeadData {
    name: string;
    sex: string;
    dateOfBirth?: string | null;
    phoneNumber: string;
    email?: string | null;
    hmo?: { name: string; status?: string } | null;
}

interface NewFamilyMemberData {
    name: string;
    sex: string;
    dateOfBirth?: string | null;
}

// --- NEW TYPE DEFINITION for creating a family at once ---
interface NewGuestFamilyData extends NewFamilyHeadData {
    members: NewFamilyMemberData[];
}

type DentalRecordInsert = InferInsertModel<typeof dentalRecords>;

export class PatientService {
    constructor() {}

    /**
     * Adds a new patient who will be the head of their family.
     */
    async addGuestPatient(patientData: NewFamilyHeadData, sendReceipt: boolean = true) {
        const { name, sex, dateOfBirth, phoneNumber, email, hmo } = patientData;

        const existingPatient = await db.select()
            .from(patients)
            .where(eq(patients.phoneNumber, phoneNumber))
            .limit(1);

        if (existingPatient.length > 0) {
            throw new Error('A patient with this phone number already exists.');
        }

        const [inserted] = await db.insert(patients).values({
            name,
            sex,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            phoneNumber,
            email: email || null,
            hmo: hmo || null,
            isFamilyHead: true,
            familyId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const [newPatient] = await db.query.patients.findMany({ where: eq(patients.id, inserted.insertId), limit: 1 });

        if (!newPatient) {
            throw new Error('Failed to retrieve newly created patient.');
        }

        this._sendNewPatientNotifications(newPatient);

        if (sendReceipt && newPatient.email) {
            try {
                const receiptData = {
                    receiptNumber: `REG-${newPatient.id}-${Date.now()}`,
                    receiptDate: new Date().toLocaleDateString(),
                    patientName: newPatient.name,
                    patientEmail: newPatient.email,
                    items: [{
                        description: 'Registration & Consultation',
                        quantity: 1,
                        unitPrice: 5000,
                        totalPrice: 5000
                    }],
                    subtotal: 5000,
                    amountPaid: 5000,
                    totalDueFromPatient: 5000,
                    paymentMethod: 'New Registration Fee',
                    isHmoCovered: false,
                    hmoName: 'N/A',
                    coveredAmount: 0,
                    latestDentalRecord: null
                };
                const senderUserId = 1; // Assuming 1 is a default/system user ID
                await emailService.sendReceiptEmail(newPatient.email, receiptData, senderUserId);
                console.log(`Registration receipt sent to ${newPatient.email}`);
            } catch (emailError: any) {
                console.error(`Error sending registration receipt email: ${emailError.message}`);
            }
        }

        return newPatient;
    }

    /**
     * Adds a new family member under an existing family head.
     */
    async addFamilyMember(headId: number, memberData: NewFamilyMemberData) {
        const [familyHead] = await db.query.patients.findMany({
            where: and(eq(patients.id, headId), eq(patients.isFamilyHead, true)),
            limit: 1,
        });

        if (!familyHead) {
            throw new Error('Family head not found or the specified patient is not a family head.');
        }

        const { name, sex, dateOfBirth } = memberData;

        const [inserted] = await db.insert(patients).values({
            name,
            sex,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            familyId: headId,
            isFamilyHead: false,
            hmo: familyHead.hmo, // Inherit HMO from the family head
            phoneNumber: null,
            email: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const [newMember] = await db.query.patients.findMany({ where: eq(patients.id, inserted.insertId), limit: 1 });

        if (!newMember) {
            throw new Error('Failed to retrieve newly created family member.');
        }

        console.log(`New family member ${newMember.name} added to family of ${familyHead.name}.`);
        return newMember;
    }

    /**
     * Adds a new patient who will be the head of their family,
     * and simultaneously adds their family members (sub-patients).
     * This is an all-in-one function for creating a family unit at once.
     */
    async addGuestFamilyPatient(familyData: NewGuestFamilyData) {
        const { members, ...headData } = familyData;

        // A database transaction is highly recommended here to ensure atomicity.
        // If adding a member fails, the entire family creation should ideally be rolled back.
        // For simplicity, this implementation proceeds sequentially.

        // 1. Create the Family Head using the existing logic.
        // This handles phone number validation and notifications for the primary account.
        const familyHead = await this.addGuestPatient(headData, false);

        // 2. Add each family member.
        if (members && members.length > 0) {
            for (const memberData of members) {
                // Use the existing `addFamilyMember` logic for each sub-patient.
                // This ensures consistency in how members are created and inherits the HMO.
                await this.addFamilyMember(familyHead.id, memberData);
            }
        }

        if (familyHead.email) {
            try {
                const receiptData = {
                    receiptNumber: `REG-FAM-${familyHead.id}-${Date.now()}`,
                    receiptDate: new Date().toLocaleDateString(),
                    patientName: familyHead.name,
                    patientEmail: familyHead.email,
                    items: [{
                        description: 'Registration & Consultation(Family)',
                        quantity: 1,
                        unitPrice: 10000,
                        totalPrice: 10000
                    }],
                    subtotal: 10000,
                    amountPaid: 10000,
                    totalDueFromPatient: 10000,
                    paymentMethod: 'New Registration Fee',
                    isHmoCovered: false,
                    hmoName: 'N/A',
                    coveredAmount: 0,
                    latestDentalRecord: null
                };
                const senderUserId = 1; // Assuming 1 is a default/system user ID
                await emailService.sendReceiptEmail(familyHead.email, receiptData, senderUserId);
                console.log(`Family registration receipt sent to ${familyHead.email}`);
            } catch (emailError: any) {
                console.error(`Error sending family registration receipt email: ${emailError.message}`);
            }
        }

        // 3. Fetch and return the complete family structure, including the newly added members.
        const completeFamily = await this.getPatientById(familyHead.id);

        if (!completeFamily) {
            // This case is unlikely if head creation succeeded, but it's good practice to handle.
            throw new Error('Failed to retrieve the newly created family.');
        }

        return completeFamily;
    }

    /**
     * Records a visit for a returning patient (family head) using their phone number.
     */
    async addReturningGuest(phoneNumber: string) {
        const [patient] = await db.select()
            .from(patients)
            .where(eq(patients.phoneNumber, phoneNumber))
            .limit(1);

        if (!patient) {
            throw new Error('Patient with this phone number not found.');
        }

        const now = new Date();
        this._sendReturningPatientNotifications(patient, now);

        return { message: 'Returning guest visit recorded successfully.', patientName: patient.name, visitDate: now.toISOString().split('T')[0] };
    }

    /**
     * Fetches all patients and includes their family relations.
     */
    async getAllPatients() {
        // Fetch all patients with their dental records
        const allPatients = await db.query.patients.findMany({
            with: {
                familyHead: true,
                familyMembers: true,
                dentalRecords: {
                    orderBy: [desc(dentalRecords.createdAt)],
                    limit: 1 // Only get the latest record for the list view
                }
            },
            orderBy: [desc(patients.createdAt)],
        });
    
        // Augment patient objects with the latest dental record details
        return allPatients.map(p => {
            const latestRecord = p.dentalRecords && p.dentalRecords.length > 0 ? p.dentalRecords[0] : null;
            return {
                ...p,
                latestTreatmentDone: latestRecord?.treatmentDone,
                latestTreatmentPlan: latestRecord?.treatmentPlan,
                latestProvisionalDiagnosis: latestRecord?.provisionalDiagnosis
            };
        });
    }

    /**
     * Fetches a single patient by their ID, including family relations.
     */
    async getPatientById(patientId: number) {
        return await db.query.patients.findFirst({
            where: eq(patients.id, patientId),
            with: {
                familyHead: true,
                familyMembers: {
                    with: {
                        dentalRecords: true,
                    }
                },
                dentalRecords: {
                     orderBy: [desc(dentalRecords.createdAt)],
                },
            },
        });
    }

    /**
     * Updates a patient's information.
     */
    async updatePatient(patientId: number, patientData: Partial<PatientInsert>) {
        const [existingPatient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!existingPatient) {
            return { success: false, message: 'Patient not found.' };
        }

        if (patientData.familyId || patientData.isFamilyHead !== undefined) {
            return { success: false, message: 'Cannot change family structure via this method.' };
        }

        if (existingPatient.isFamilyHead) {
            if (patientData.phoneNumber && patientData.phoneNumber !== existingPatient.phoneNumber) {
                const [conflict] = await db.select().from(patients).where(and(eq(patients.phoneNumber, patientData.phoneNumber), ne(patients.id, patientId))).limit(1);
                if (conflict) return { success: false, message: 'Another patient already exists with this phone number.' };
            }
            if (patientData.email && patientData.email !== existingPatient.email) {
                const [conflict] = await db.select().from(patients).where(and(eq(patients.email, patientData.email), ne(patients.id, patientId))).limit(1);
                if (conflict) return { success: false, message: 'Another patient already exists with this email.' };
            }
        }
        
        await db.update(patients).set({
            ...patientData,
            updatedAt: new Date(),
        }).where(eq(patients.id, patientId));

        if (patientData.hmo !== undefined && existingPatient.isFamilyHead) {
            await db.update(patients)
              .set({ hmo: patientData.hmo, updatedAt: new Date() })
              .where(eq(patients.familyId, patientId));
        }

        return { success: true, message: 'Patient information updated successfully.' };
    }

    /**
     * Schedules the next appointment for a given patient.
     * @param patientId The ID of the patient.
     * @param interval The interval string (e.g., '1 day', '2 weeks').
     * @returns An object with the success status and the updated patient data.
     */
    async scheduleNextAppointment(patientId: number, interval: string) {
        const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!patientExists) {
            return { success: false, message: 'Patient not found.' };
        }
    
        const today = new Date();
        let nextAppointmentDate = new Date(today);
        
        // Sanitize interval string for easier matching
        const cleanInterval = interval.toLowerCase().replace(/\s+/g, '');
    
        switch (cleanInterval) {
            case '1day': nextAppointmentDate.setDate(today.getDate() + 1); break;
            case '2days': nextAppointmentDate.setDate(today.getDate() + 2); break;
            case '3days': nextAppointmentDate.setDate(today.getDate() + 3); break;
            case '1week': nextAppointmentDate.setDate(today.getDate() + 7); break;
            case '2weeks': nextAppointmentDate.setDate(today.getDate() + 14); break;
            case '1month': nextAppointmentDate.setMonth(today.getMonth() + 1); break;
            case '6weeks': nextAppointmentDate.setDate(today.getDate() + 42); break;
            case '3months': nextAppointmentDate.setMonth(today.getMonth() + 3); break;
            case '6months': nextAppointmentDate.setMonth(today.getMonth() + 6); break;
            default:
                return { success: false, message: 'Invalid appointment interval provided.' };
        }
    
        // If the calculated date is a Sunday (getDay() returns 0), push it to the next day (Monday).
        if (nextAppointmentDate.getDay() === 0) {
            nextAppointmentDate.setDate(nextAppointmentDate.getDate() + 1);
        }
    
        await db.update(patients).set({
            nextAppointmentDate: nextAppointmentDate,
            updatedAt: new Date(),
        }).where(eq(patients.id, patientId));
    
        const updatedPatient = await this.getPatientById(patientId);
    
        return { success: true, message: 'Next appointment scheduled successfully.', patient: updatedPatient };
    }

    /**
     * NEW: Sends an appointment reminder email to a patient.
     */
    async sendAppointmentReminder(patientId: number) {
        const patient = await this.getPatientById(patientId);

        if (!patient) {
            return { success: false, message: "Patient not found." };
        }

        if (!patient.email) {
            return { success: false, message: "Patient does not have an email address." };
        }
        
        if (!patient.nextAppointmentDate) {
            return { success: false, message: "Patient does not have a next appointment date." };
        }

        try {
            const reminderData = {
                patientName: patient.name,
                appointmentDate: patient.nextAppointmentDate.toISOString(),
                outstandingAmount: patient.outstanding || '0.00',
            };
            
            await emailService.sendAppointmentReminder(patient.email, reminderData);
            return { success: true, message: `Reminder sent to ${patient.name}.` };

        } catch (error: any) {
            console.error(`Error sending appointment reminder: ${error.message}`);
            return { success: false, message: `Failed to send reminder. ${error.message}` };
        }
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
        const [record] = await db.select().from(dentalRecords)
            .leftJoin(users, eq(dentalRecords.doctorId, users.id))
            .where(and(
                eq(dentalRecords.patientId, patientId),
                eq(dentalRecords.id, recordId)
            ))
            .limit(1);
        return record ? { ...record.dental_records, doctorUsername: record.users?.username } : undefined;
    }

    async getDentalRecordById(recordId: number) {
        const [record] = await db.select().from(dentalRecords)
            .leftJoin(users, eq(dentalRecords.doctorId, users.id))
            .where(eq(dentalRecords.id, recordId))
            .limit(1);
        return record ? { ...record.dental_records, doctorUsername: record.users?.username } : undefined;
    }

    async updateDentalRecord(recordId: number, updateData: Partial<DentalRecordInsert>) {
        const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
        if (!recordExists) {
            return { success: false, message: 'Dental record not found.' };
        }

        const cleanedUpdateData: Partial<DentalRecordInsert> = { ...updateData };
        delete cleanedUpdateData.patientId;
        delete cleanedUpdateData.doctorId;

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

    private async _sendNewPatientNotifications(newPatient: PatientSelect) {
        try {
            const dobFormatted = newPatient.dateOfBirth ? newPatient.dateOfBirth.toISOString().split('T')[0] : '';
            const firstApptFormatted = newPatient.createdAt ? newPatient.createdAt.toISOString().split('T')[0] : '';
            const hmoNameForSheet = newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name ? (newPatient.hmo as { name?: string }).name : '';
            
            await googleSheetsService.appendRow([
                newPatient.name, newPatient.sex, dobFormatted, newPatient.phoneNumber, newPatient.email || '',
                hmoNameForSheet, firstApptFormatted, ''
            ]);
        } catch (sheetError: any) {
            console.warn(`Warning: Could not save patient to Google Sheet: ${sheetError.message}`);
        }

        try {
            const ownerEmail = process.env.OWNER_EMAIL || '';
            const staffEmails = await (emailService as any)._getStaffEmailsExcludingNurses();
            const allRecipients = [...staffEmails];
            if (ownerEmail && !allRecipients.includes(ownerEmail)) {
                allRecipients.push(ownerEmail);
            }

            if (allRecipients.length > 0) {
                const subject = 'New Patient Registration';
                const htmlContent = `<h2>New Patient Registered!</h2><p>A new primary patient has been registered:</p><ul><li><strong>Name:</strong> ${newPatient.name}</li><li><strong>Phone:</strong> ${newPatient.phoneNumber}</li><li><strong>Email:</strong> ${newPatient.email || 'N/A'}</li></ul>`;
                await emailService.sendEmail(allRecipients.join(','), subject, htmlContent);
            }
        } catch (emailError: any) {
            console.error(`Error sending new patient registration email: ${emailError.message}`);
        }
    }

    private async _sendReturningPatientNotifications(patient: PatientSelect, visitDate: Date) {
        try {
            const dobFormatted = patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : '';
            const firstApptFormatted = patient.createdAt ? patient.createdAt.toISOString().split('T')[0] : '';
            const lastApptFormatted = visitDate.toISOString().split('T')[0];
            const hmoNameForSheet = patient.hmo && typeof patient.hmo === 'object' && (patient.hmo as { name?: string }).name ? (patient.hmo as { name?: string }).name : '';

            await googleSheetsService.appendRow([
                patient.name, patient.sex, dobFormatted, patient.phoneNumber, patient.email || '',
                hmoNameForSheet, firstApptFormatted, lastApptFormatted
            ]);
        } catch (sheetError: any) {
            console.warn(`Warning: Could not record returning patient visit to Google Sheet: ${sheetError.message}`);
        }

        try {
            const ownerEmail = process.env.OWNER_EMAIL || '';
            const staffEmails = await (emailService as any)._getStaffEmailsExcludingNurses();
            const allRecipients = [...staffEmails];
            if (ownerEmail && !allRecipients.includes(ownerEmail)) {
                allRecipients.push(ownerEmail);
            }
            if (allRecipients.length > 0) {
                const subject = `Returning Patient Check-in: ${patient.name}`;
                const htmlContent = `<h2>Returning Patient Checked In!</h2><p>${patient.name} has checked in on ${visitDate.toLocaleDateString()}.</p>`;
                await emailService.sendEmail(allRecipients.join(','), subject, htmlContent);
            }
        } catch (emailError: any) {
            console.error(`Error sending returning patient check-in email: ${emailError.message}`);
        }
    }
}

export const patientService = new PatientService();
