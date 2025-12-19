import { eq, ne, and, desc, isNull, isNotNull, gte, sql, or, like, inArray, asc } from 'drizzle-orm';
import { db } from '../config/database';
import { patients, dentalRecords, users, dailyVisits } from '../../db/schema';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { googleSheetsService } from './googleSheets.service';
import { emailService } from './email.service';

// --- TYPE DEFINITIONS ---

type PatientInsert = InferInsertModel<typeof patients>;
type PatientSelect = InferSelectModel<typeof patients>;
type DentalRecordInsert = InferInsertModel<typeof dentalRecords>;

interface AuthenticatedUser {
    userId: number;
    role: string;
}

interface NewFamilyHeadData {
    name: string;
    sex: string;
    dateOfBirth?: string | null;
    phoneNumber: string;
    email?: string | null;
    address?: string | null;
    hmo?: { name: string; status?: string } | null;
}

interface NewFamilyMemberData {
    name: string;
    sex: string;
    dateOfBirth?: string | null;
}

interface NewGuestFamilyData extends NewFamilyHeadData {
    members: NewFamilyMemberData[];
}

// --- HELPER FUNCTIONS ---

const canUserSeeContactDetails = (user: AuthenticatedUser | undefined, settings: any): boolean => {
    if (!user) return false;
    if (user.role === 'owner') return true;
    if (!settings || !settings.patientManagement || !settings.patientManagement['canSeeContactDetails']) return false;
    return settings.patientManagement['canSeeContactDetails'].includes(user.role);
};

const stripContactInfo = (patient: any): any | null => {
    if (!patient) return null;
    const { phoneNumber, email, address, ...safePatientData } = patient;
    const safePatient: any = { ...safePatientData };

    if (safePatient.familyHead) {
        const { phoneNumber: headPhone, email: headEmail, address: headAddress, ...safeHead } = safePatient.familyHead;
        safePatient.familyHead = safeHead;
    }

    if (safePatient.familyMembers) {
        safePatient.familyMembers = safePatient.familyMembers.map((member: any) => {
            const { phoneNumber: memberPhone, email: memberEmail, address: memberAddress, ...safeMember } = member;
            return safeMember;
        });
    }
    return safePatient;
};


export class PatientService {
  constructor() {}
  
  async addGuestPatient(patientData: NewFamilyHeadData, sendReceipt: boolean = true): Promise<PatientSelect> {
        const { name, sex, dateOfBirth, phoneNumber, email, address, hmo } = patientData;
        const existingPatient = await db.select().from(patients).where(eq(patients.phoneNumber, phoneNumber)).limit(1);
        if (existingPatient.length > 0) {
            throw new Error('A patient with this phone number already exists.');
        }
        const [inserted] = await db.insert(patients).values({
            name, sex, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            phoneNumber, email: email || null, address: address || null, hmo: hmo || null,
            isFamilyHead: true, familyId: null, createdAt: new Date(), updatedAt: new Date(),
        });
        const [newPatient] = await db.query.patients.findMany({ where: eq(patients.id, inserted.insertId), limit: 1 });
        if (!newPatient) throw new Error('Failed to retrieve newly created patient.');
        this._sendNewPatientNotifications(newPatient);
        if (sendReceipt && newPatient.email) { /* ... email sending logic ... */ }
        return newPatient;
    }

    async addFamilyMember(headId: number, memberData: NewFamilyMemberData): Promise<PatientSelect> {
        const [familyHead] = await db.query.patients.findMany({
            where: and(eq(patients.id, headId), eq(patients.isFamilyHead, true)), limit: 1,
        });
        if (!familyHead) throw new Error('Family head not found or the specified patient is not a family head.');
        const { name, sex, dateOfBirth } = memberData;
        const [inserted] = await db.insert(patients).values({
            name, sex, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            familyId: headId, isFamilyHead: false, hmo: familyHead.hmo, address: familyHead.address,
            phoneNumber: null, email: null, createdAt: new Date(), updatedAt: new Date(),
        });
        const [newMember] = await db.query.patients.findMany({ where: eq(patients.id, inserted.insertId), limit: 1 });
        if (!newMember) throw new Error('Failed to retrieve newly created family member.');
        console.log(`New family member ${newMember.name} added to family of ${familyHead.name}.`);
        return newMember;
    }

    async addGuestFamilyPatient(familyData: NewGuestFamilyData) {
        const { members, ...headData } = familyData;
        const familyHead = await this.addGuestPatient(headData, false);
        if (members && members.length > 0) {
            for (const memberData of members) {
                await this.addFamilyMember(familyHead.id, memberData);
            }
        }
        if (familyHead.email) { /* ... email sending logic ... */ }
        const completeFamily = await this.getPatientById(familyHead.id);
        if (!completeFamily) throw new Error('Failed to retrieve the newly created family.');
        return completeFamily;
    }

    async addReturningGuest(identifier: string) {
        const isEmail = identifier.includes('@');
        const queryCondition = isEmail ? eq(patients.email, identifier) : eq(patients.phoneNumber, identifier);
        const [patient] = await db.select().from(patients).where(queryCondition).limit(1);
        if (!patient) throw new Error('Patient with this phone number or email not found.');
        const now = new Date();
        await db.insert(dailyVisits).values({ patientId: patient.id, checkInTime: now });
        this._sendReturningPatientNotifications(patient, now);
        return { message: 'Returning guest visit recorded successfully.', patientName: patient.name, visitDate: now.toISOString().split('T')[0] };
    }

    async getTodaysReturningPatients(user?: AuthenticatedUser, settings?: any) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysVisits = await db.select({
            id: dailyVisits.id, checkInTime: dailyVisits.checkInTime,
            patient: { id: patients.id, name: patients.name, sex: patients.sex, dateOfBirth: patients.dateOfBirth, hmo: patients.hmo, nextAppointmentDate: patients.nextAppointmentDate, phoneNumber: patients.phoneNumber, email: patients.email, address: patients.address }
        }).from(dailyVisits).leftJoin(patients, eq(dailyVisits.patientId, patients.id)).where(gte(dailyVisits.checkInTime, today)).orderBy(desc(dailyVisits.checkInTime));
        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        if (shouldSeeContact) return todaysVisits;
        return todaysVisits.map(visit => {
            if (visit.patient) {
                const { phoneNumber, email, address, ...safePatient } = visit.patient;
                return { ...visit, patient: safePatient };
            }
            return visit;
        });
    }

    // --- NEW: Scalable Appointment Fetching ---
    async getScheduledPatients(date?: string, user?: AuthenticatedUser, settings?: any) {
        let conditions: ReturnType<typeof and> | ReturnType<typeof isNotNull> | undefined = undefined;

        if (date) {
            // If date provided, exact match
            conditions = and(isNotNull(patients.nextAppointmentDate), sql`DATE(${patients.nextAppointmentDate}) = ${date}`);
        } else {
            // If no date (All), get all non-null appointments
            conditions = isNotNull(patients.nextAppointmentDate);
        }

        const scheduledPatients = await db.query.patients.findMany({
            where: conditions,
            orderBy: [asc(patients.nextAppointmentDate)],
            with: {
                dentalRecords: {
                    orderBy: [desc(dentalRecords.createdAt)],
                    limit: 1,
                    columns: { treatmentDone: true, treatmentPlan: true, provisionalDiagnosis: true }
                }
            }
        });

        // Add helper fields and strip info
        const processed = scheduledPatients.map(p => {
            const latestRecord = p.dentalRecords && p.dentalRecords.length > 0 ? p.dentalRecords[0] : null;
            const { dentalRecords: _, ...patientData } = p;
            return {
                ...patientData,
                latestTreatmentDone: latestRecord?.treatmentDone,
                latestTreatmentPlan: latestRecord?.treatmentPlan,
                latestProvisionalDiagnosis: latestRecord?.provisionalDiagnosis
            };
        });

        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        return shouldSeeContact ? processed : processed.map(p => stripContactInfo(p));
    }

    // --- UPDATED: Get All Patients with Pagination, Search & Date Filter ---
    async getAllPatients(page: number = 1, limit: number = 10, searchTerm: string = '', filterDate: string = '', user?: AuthenticatedUser, settings?: any) {
      const offset = (page - 1) * limit;
      
      let datePatientIds: number[] | null = null;
      
      if (filterDate) {
          const visits = await db.select({ pid: dailyVisits.patientId }).from(dailyVisits).where(sql`DATE(${dailyVisits.checkInTime}) = ${filterDate}`);
          const newRegistrations = await db.select({ pid: patients.id }).from(patients).where(sql`DATE(${patients.createdAt}) = ${filterDate}`);
          const combinedIds = new Set([...visits.map(v => v.pid), ...newRegistrations.map(p => p.pid)]);
          datePatientIds = Array.from(combinedIds);
          if (datePatientIds.length === 0) {
               return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
          }
      }

      let whereClause = undefined;
      const searchCondition = searchTerm ? or(like(patients.name, `%${searchTerm}%`), like(patients.phoneNumber, `%${searchTerm}%`), like(patients.email, `%${searchTerm}%`)) : undefined;
      const dateCondition = datePatientIds ? inArray(patients.id, datePatientIds) : undefined;

      if (searchCondition && dateCondition) { whereClause = and(searchCondition, dateCondition); } 
      else if (searchCondition) { whereClause = searchCondition; } 
      else if (dateCondition) { whereClause = dateCondition; }

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(patients).where(whereClause);
      const totalPatients = countResult[0].count;

      const allPatientsData = await db.query.patients.findMany({
          where: whereClause,
          limit: limit,
          offset: offset,
          with: { 
              familyHead: true, 
              familyMembers: true, 
              dentalRecords: { orderBy: [desc(dentalRecords.createdAt)], limit: 1, columns: { id: true, treatmentDone: true, treatmentPlan: true, provisionalDiagnosis: true, createdAt: true, doctorId: true }, with: { doctor: { columns: { username: true } } } }, 
              dailyVisits: { columns: { id: true, checkInTime: true } } 
          },
          orderBy: [desc(patients.createdAt)],
      });
      
      const processedPatients = allPatientsData.map(p => {
          const hasDentalRecords = p.dentalRecords && p.dentalRecords.length > 0;
          const latestRecord = hasDentalRecords ? p.dentalRecords[0] : null;
          const { dentalRecords: _, ...patientData } = p;
          return { 
              ...patientData, 
              latestTreatmentDone: latestRecord?.treatmentDone, 
              latestTreatmentPlan: latestRecord?.treatmentPlan, 
              latestProvisionalDiagnosis: latestRecord?.provisionalDiagnosis, 
              doctorName: latestRecord?.doctor?.username,
              hasDentalRecords: hasDentalRecords 
          };
      });

      const shouldSeeContact = canUserSeeContactDetails(user, settings);
      const finalData = shouldSeeContact ? processedPatients : processedPatients.map(p => stripContactInfo(p));

      return {
          data: finalData,
          meta: { total: totalPatients, page, limit, totalPages: Math.ceil(totalPatients / limit) }
      };
    }

    async getPatientById(patientId: number, user?: AuthenticatedUser, settings?: any) {
        const patient = await db.query.patients.findFirst({
            where: eq(patients.id, patientId),
            with: { familyHead: true, familyMembers: { with: { dentalRecords: true } }, dentalRecords: { orderBy: [desc(dentalRecords.createdAt)] } },
        });
        if (!patient) return null;
        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        return shouldSeeContact ? patient : stripContactInfo(patient);
    }
    
    async _getPatientWithContactInfoForInternalUse(patientId: number): Promise<PatientSelect | null> {
        const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        return patient || null;
    }

    async updatePatient(patientId: number, patientData: Partial<PatientInsert>) {
        const [existingPatient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!existingPatient) return { success: false, message: 'Patient not found.' };
        if (patientData.familyId || patientData.isFamilyHead !== undefined) return { success: false, message: 'Cannot change family structure via this method.' };
        if (existingPatient.isFamilyHead) {
            if (patientData.phoneNumber && patientData.phoneNumber !== existingPatient.phoneNumber) {
                const [conflict] = await db.select().from(patients).where(and(eq(patients.phoneNumber, patientData.phoneNumber), ne(patients.id, patientId))).limit(1);
                if (conflict) return { success: false, message: 'Another patient already exists with this phone number.' };
            }
        }
        await db.update(patients).set({ ...patientData, updatedAt: new Date() }).where(eq(patients.id, patientId));
        if (existingPatient.isFamilyHead) {
            const memberUpdateData: { hmo?: any; address?: any; updatedAt?: Date } = {};
            let shouldUpdateMembers = false;
            if (patientData.hmo !== undefined) { memberUpdateData.hmo = patientData.hmo; shouldUpdateMembers = true; }
            if (patientData.address !== undefined) { memberUpdateData.address = patientData.address; shouldUpdateMembers = true; }
            if (shouldUpdateMembers) {
                memberUpdateData.updatedAt = new Date();
                await db.update(patients).set(memberUpdateData).where(eq(patients.familyId, patientId));
            }
        }
        return { success: true, message: 'Patient information updated successfully.' };
    }

    async scheduleNextAppointment(patientId: number, interval: string) {
        const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!patientExists) return { success: false, message: 'Patient not found.' };
        const today = new Date();
        let nextAppointmentDate = new Date(today);
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
            default: return { success: false, message: 'Invalid appointment interval provided.' };
        }
        if (nextAppointmentDate.getDay() === 0) nextAppointmentDate.setDate(nextAppointmentDate.getDate() + 1);
        await db.update(patients).set({ nextAppointmentDate: nextAppointmentDate, updatedAt: new Date() }).where(eq(patients.id, patientId));
        const updatedPatient = await this.getPatientById(patientId);
        return { success: true, message: 'Next appointment scheduled successfully.', patient: updatedPatient };
    }

    async sendAppointmentReminder(patientId: number) {
        const patient = await this._getPatientWithContactInfoForInternalUse(patientId);
        if (!patient) return { success: false, message: "Patient not found." };
        if (!patient.email) return { success: false, message: "Patient does not have an email address." };
        if (!patient.nextAppointmentDate) return { success: false, message: "Patient does not have a next appointment date." };
        try {
            const reminderData = { patientName: patient.name, appointmentDate: patient.nextAppointmentDate.toISOString(), outstandingAmount: patient.outstanding || '0.00' };
            const staffBccRecipients = await (emailService as any)._getOwnerAndStaffEmails();
            await emailService.sendAppointmentReminder(patient.email, reminderData, staffBccRecipients);
            return { success: true, message: `Reminder sent to ${patient.name}.` };
        } catch (error: any) {
            console.error(`Error sending appointment reminder: ${error.message}`);
            return { success: false, message: `Failed to send reminder. ${error.message}` };
        }
    }

    async sendProcedureSpecificReminder(patientId: number, reminderType: string) {
        const patient = await this._getPatientWithContactInfoForInternalUse(patientId);
        if (!patient) return { success: false, message: "Patient not found." };
        if (!patient.email) return { success: false, message: "Patient does not have an email address." };
        try {
            const staffBccRecipients = await (emailService as any)._getOwnerAndStaffEmails();
            let result;
            switch (reminderType) {
                case 'scaling': result = await emailService.sendScalingReminder(patient.email, { patientName: patient.name }, staffBccRecipients); break;
                case 'extraction':
                    if (!patient.nextAppointmentDate) return { success: false, message: "Patient does not have a next appointment date for the extraction review." };
                    result = await emailService.sendExtractionReminder(patient.email, { patientName: patient.name, appointmentDate: patient.nextAppointmentDate.toISOString() }, staffBccRecipients);
                    break;
                case 'rootCanal': result = await emailService.sendRootCanalReminder(patient.email, { patientName: patient.name }, staffBccRecipients); break;
                default: return { success: false, message: "Invalid reminder type specified." };
            }
            if (result.success) return { success: true, message: `Specific reminder for '${reminderType}' sent to ${patient.name}.` };
            else throw new Error('Email transporter failed to send the email.');
        } catch (error: any) {
            console.error(`Error sending specific reminder '${reminderType}': ${error.message}`);
            return { success: false, message: `Failed to send reminder. ${error.message}` };
        }
    }

    async sendCustomEmail(patientId: number, subject: string, message: string) {
        const patient = await this._getPatientWithContactInfoForInternalUse(patientId);
        if (!patient) { return { success: false, message: "Patient not found." }; }
        if (!patient.email) { return { success: false, message: "Patient does not have an email address." }; }

        try {
            const staffBccRecipients = await (emailService as any)._getOwnerAndStaffEmails();
            const result = await emailService.sendCustomEmail(
                patient.email, 
                { patientName: patient.name, subject: subject, messageBody: message }, 
                staffBccRecipients
            );

            if (result.success) {
                return { success: true, message: `Custom email sent to ${patient.name}.` };
            } else {
                throw new Error('Email transporter failed to send the email.');
            }
        } catch (error: any) {
            console.error(`Error sending custom email: ${error.message}`);
            return { success: false, message: `Failed to send email. ${error.message}` };
        }
    }

    async createDentalRecord(patientId: number, doctorId: number, recordData: Partial<DentalRecordInsert>) {
        const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!patientExists) return { success: false, message: 'Patient not found.' };
        const newRecord: DentalRecordInsert = { patientId, doctorId, ...recordData, createdAt: new Date(), updatedAt: new Date() };
        const [inserted] = await db.insert(dentalRecords).values(newRecord);
        const newRecordId = (inserted as any).insertId;
        const [newDentalRecord] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, newRecordId)).limit(1);
        if (!newDentalRecord) return { success: false, message: 'Dental record added but could not be found immediately after.' };
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
                medicationHIV:dentalRecords.medicationHIV,
                medicationHepatitis:dentalRecords.medicationHepatitis,
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
                xrayUrl: dentalRecords.xrayUrl,
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
            .where(and(eq(dentalRecords.patientId, patientId), eq(dentalRecords.id, recordId)))
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
        if (!recordExists) { return { success: false, message: 'Dental record not found.' }; }
        const cleanedUpdateData: Partial<DentalRecordInsert> = { ...updateData };
        delete cleanedUpdateData.patientId;
        
        if (cleanedUpdateData.doctorId && !updateData.receptionistId) {
            delete cleanedUpdateData.doctorId;
        }

        await db.update(dentalRecords).set({ ...cleanedUpdateData, updatedAt: new Date() }).where(eq(dentalRecords.id, recordId));
        return { success: true, message: 'Dental record updated successfully.' };
    }

    async deleteDentalRecord(recordId: number) {
        const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
        if (!recordExists) { return { success: false, message: 'Dental record not found.' }; }
        await db.delete(dentalRecords).where(eq(dentalRecords.id, recordId));
        return { success: true, message: 'Dental record deleted successfully.' };
    }

    async getPatientsForDoctor(doctorId: number) {
        const patientRecords = await db
            .select({
                patientId: patients.id,
                patientName: patients.name,
                provisionalDiagnosis: dentalRecords.provisionalDiagnosis,
                treatmentPlan: dentalRecords.treatmentPlan,
                doctorId: dentalRecords.doctorId,
                doctorName: users.username,
                dentalRecordId: dentalRecords.id
            })
            .from(patients)
            .leftJoin(dentalRecords, eq(patients.id, dentalRecords.patientId))
            .leftJoin(users, eq(dentalRecords.doctorId, users.id))
            .where(eq(dentalRecords.doctorId, doctorId))
            .orderBy(desc(dentalRecords.createdAt));

        type PatientRecord = {
            patientId: number;
            patientName: string;
            provisionalDiagnosis: string | null;
            treatmentPlan: string | null;
            doctorId: number | null;
            doctorName: string | null;
            dentalRecordId: number | null;
        };
        const uniquePatients = patientRecords.reduce((acc: PatientRecord[], current) => {
            if (!acc.find(item => item.patientId === current.patientId)) {
                acc.push(current as PatientRecord);
            }
            return acc;
        }, [] as PatientRecord[]);

        return uniquePatients;
    }

     async getAllPatientsForScheduling() {
        const patientRecords = await db
            .select({
                patientId: patients.id,
                patientName: patients.name,
                provisionalDiagnosis: dentalRecords.provisionalDiagnosis,
                treatmentPlan: dentalRecords.treatmentPlan,
                doctorId: dentalRecords.doctorId,
                doctorName: users.username,
                dentalRecordId: dentalRecords.id,
                nextAppointmentDate: patients.nextAppointmentDate,
                createdAt: patients.createdAt
            })
            .from(patients)
            .leftJoin(dentalRecords, eq(patients.id, dentalRecords.patientId))
            .leftJoin(users, eq(dentalRecords.doctorId, users.id))
            .orderBy(desc(dentalRecords.createdAt));

        type PatientRecord = {
            patientId: number;
            patientName: string;
            provisionalDiagnosis: string | null;
            treatmentPlan: string | null;
            doctorId: number | null;
            doctorName: string | null;
            dentalRecordId: number | null;
            nextAppointmentDate: Date | null;
            createdAt: Date;
        };
        const mappedRecords: PatientRecord[] = patientRecords.map(rec => ({
            patientId: rec.patientId,
            patientName: rec.patientName,
            provisionalDiagnosis: rec.provisionalDiagnosis as string | null,
            treatmentPlan: rec.treatmentPlan as string | null,
            doctorId: rec.doctorId as number | null,
            doctorName: rec.doctorName as string | null,
            dentalRecordId: rec.dentalRecordId as number | null,
            nextAppointmentDate: rec.nextAppointmentDate,
            createdAt: rec.createdAt,
        }));

        const uniquePatients = mappedRecords.reduce((acc: PatientRecord[], current: PatientRecord) => {
            if (!acc.find(item => item.patientId === current.patientId)) {
                acc.push(current);
            }
            return acc;
        }, [] as PatientRecord[]);
        
        return uniquePatients;
    }

    async assignDoctorToPatient(patientId: number, doctorId: number, receptionistId: number) {
        const [latestRecord] = await db.select().from(dentalRecords)
            .where(eq(dentalRecords.patientId, patientId))
            .orderBy(desc(dentalRecords.createdAt))
            .limit(1);

        if (latestRecord) {
            await db.update(dentalRecords).set({ doctorId, receptionistId }).where(eq(dentalRecords.id, latestRecord.id));
        } else {
            await db.insert(dentalRecords).values({ patientId, doctorId, receptionistId });
        }
        return { success: true, message: 'Doctor assigned successfully.' };
    }


    private async _sendNewPatientNotifications(newPatient: PatientSelect) {
        try {
            const dobFormatted = newPatient.dateOfBirth ? newPatient.dateOfBirth.toISOString().split('T')[0] : '';
            const firstApptFormatted = newPatient.createdAt ? newPatient.createdAt.toISOString().split('T')[0] : '';
            const hmoNameForSheet = newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name ? (newPatient.hmo as { name?: string }).name : '';
            await googleSheetsService.appendRow([
                newPatient.name, newPatient.sex, dobFormatted, newPatient.phoneNumber, newPatient.email || '',
                newPatient.address || '',
                hmoNameForSheet, firstApptFormatted, ''
            ]);
        } catch (sheetError: any) {
            console.warn(`Warning: Could not save patient to Google Sheet: ${sheetError.message}`);
        }
        try {
            const ownerEmail = process.env.OWNER_EMAIL || '';
            const staffEmails = await (emailService as any)._getOwnerAndStaffEmails();
            const allRecipients = [...staffEmails];
            if (ownerEmail && !allRecipients.includes(ownerEmail)) { allRecipients.push(ownerEmail); }
            if (allRecipients.length > 0) {
                const subject = 'New Patient Registration';
                const dobFormatted = newPatient.dateOfBirth ? new Date(newPatient.dateOfBirth).toLocaleDateString() : 'N/A';
                const registrationDateFormatted = newPatient.createdAt ? new Date(newPatient.createdAt).toLocaleDateString() : 'N/A';
                const hmoName = newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name ? (newPatient.hmo as { name?: string }).name : 'N/A';
                const htmlContent = `
                    <h2>New Patient Registered!</h2>
                    <p>A new primary patient has been registered with the following details:</p>
                    <ul>
                        <li><strong>Name:</strong> ${newPatient.name}</li>
                        <li><strong>Sex:</strong> ${newPatient.sex}</li>
                        <li><strong>Date of Birth:</strong> ${dobFormatted}</li>
                        <li><strong>Phone Number:</strong> ${newPatient.phoneNumber}</li>
                        <li><strong>Email:</strong> ${newPatient.email || 'N/A'}</li>
                        <li><strong>Address:</strong> ${newPatient.address || 'N/A'}</li>
                        <li><strong>HMO:</strong> ${hmoName}</li>
                        <li><strong>Registration Date:</strong> ${registrationDateFormatted}</li>
                    </ul>`;
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
                patient.address || '',
                hmoNameForSheet, firstApptFormatted, lastApptFormatted
            ]);
        } catch (sheetError: any) {
            console.warn(`Warning: Could not record returning patient visit to Google Sheet: ${sheetError.message}`);
        }
        try {
            const ownerEmail = process.env.OWNER_EMAIL || '';
            const staffEmails = await (emailService as any)._getOwnerAndStaffEmails();
            const allRecipients = [...staffEmails];
            if (ownerEmail && !allRecipients.includes(ownerEmail)) { allRecipients.push(ownerEmail); }
            if (allRecipients.length > 0) {
                const subject = `Returning Patient Check-in: ${patient.name}`;
                const dobFormatted = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'N/A';
                const registrationDateFormatted = patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : 'N/A';
                const hmoName = patient.hmo && typeof patient.hmo === 'object' && (patient.hmo as { name?: string }).name ? (patient.hmo as { name?: string }).name : 'N/A';
                const visitDateFormatted = visitDate.toLocaleDateString();
                const htmlContent = `
                    <h2>Returning Patient Checked In!</h2>
                    <p><strong>${patient.name}</strong> has checked in on <strong>${visitDateFormatted}</strong>.</p>
                    <p>Patient Details:</p>
                    <ul>
                        <li><strong>Name:</strong> ${patient.name}</li>
                        <li><strong>Sex:</strong> ${patient.sex}</li>
                        <li><strong>Date of Birth:</strong> ${dobFormatted}</li>
                        <li><strong>Phone Number:</strong> ${patient.phoneNumber}</li>
                        <li><strong>Email:</strong> ${patient.email || 'N/A'}</li>
                        <li><strong>Address:</strong> ${patient.address || 'N/A'}</li>
                        <li><strong>HMO:</strong> ${hmoName}</li>
                        <li><strong>Initial Registration Date:</strong> ${registrationDateFormatted}</li>
                    </ul>`;
                await emailService.sendEmail(allRecipients.join(','), subject, htmlContent);
            }
        } catch (emailError: any) {
            console.error(`Error sending returning patient check-in email: ${emailError.message}`);
        }
    }
}

export const patientService = new PatientService();
