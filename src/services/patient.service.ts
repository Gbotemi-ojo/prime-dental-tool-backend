// src/services/patient.service.ts
import { eq, ne, and, desc, isNull, gte, sql, or } from 'drizzle-orm';
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

/**
 * Checks if a user has permission to see contact details based on settings.
 * @param user The authenticated user object.
 * @param settings The application settings object.
 * @returns {boolean} True if the user has permission, false otherwise.
 */
const canUserSeeContactDetails = (user: AuthenticatedUser | undefined, settings: any): boolean => {
    if (!user || !settings || !settings.patientManagement) {
        return false;
    }
    if (user.role === 'owner') {
        return true;
    }
    return settings.patientManagement['canSeeContactDetails']?.includes(user.role);
};

/**
 * Strips sensitive contact info from a patient object and its nested relatives.
 * @param patient The patient object to sanitize.
 * @returns A new patient object without contact details, or null.
 */
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
            name,
            sex,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            phoneNumber,
            email: email || null,
            address: address || null,
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
                const isHmoPatient = newPatient.hmo && typeof newPatient.hmo === 'object' && (newPatient.hmo as { name?: string }).name;
                let receiptData;
                if (isHmoPatient) {
                    receiptData = {
                        receiptNumber: `REG-${newPatient.id}-${Date.now()}`,
                        receiptDate: new Date().toLocaleDateString(),
                        patientName: newPatient.name,
                        patientEmail: newPatient.email,
                        items: [{ description: 'Registration & Consultation (Covered by HMO)', quantity: 1, unitPrice: 0, totalPrice: 0 }],
                        subtotal: 0, amountPaid: 0, totalDueFromPatient: 0, paymentMethod: 'HMO Coverage', isHmoCovered: true,
                        hmoName: (newPatient.hmo as { name: string }).name, coveredAmount: 0, latestDentalRecord: null
                    };
                } else {
                    receiptData = {
                        receiptNumber: `REG-${newPatient.id}-${Date.now()}`,
                        receiptDate: new Date().toLocaleDateString(),
                        patientName: newPatient.name,
                        patientEmail: newPatient.email,
                        items: [{ description: 'Registration & Consultation', quantity: 1, unitPrice: 5000, totalPrice: 5000 }],
                        subtotal: 5000, amountPaid: 5000, totalDueFromPatient: 5000, paymentMethod: 'New Registration Fee', isHmoCovered: false,
                        hmoName: 'N/A', coveredAmount: 0, latestDentalRecord: null
                    };
                }
                const senderUserId = 1;
                await emailService.sendReceiptEmail(newPatient.email, receiptData, senderUserId);
                console.log(`Registration confirmation sent to ${newPatient.email}`);
            } catch (emailError: any) {
                console.error(`Error sending registration confirmation email: ${emailError.message}`);
            }
        }
        return newPatient;
    }

    async addFamilyMember(headId: number, memberData: NewFamilyMemberData): Promise<PatientSelect> {
        const [familyHead] = await db.query.patients.findMany({
            where: and(eq(patients.id, headId), eq(patients.isFamilyHead, true)),
            limit: 1,
        });
        if (!familyHead) {
            throw new Error('Family head not found or the specified patient is not a family head.');
        }
        const { name, sex, dateOfBirth } = memberData;
        const [inserted] = await db.insert(patients).values({
            name, sex, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            familyId: headId, isFamilyHead: false, hmo: familyHead.hmo,
            address: familyHead.address,
            phoneNumber: null, email: null, createdAt: new Date(), updatedAt: new Date(),
        });
        const [newMember] = await db.query.patients.findMany({ where: eq(patients.id, inserted.insertId), limit: 1 });
        if (!newMember) {
            throw new Error('Failed to retrieve newly created family member.');
        }
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
        if (familyHead.email) {
            try {
                const isHmoPatient = familyHead.hmo && typeof familyHead.hmo === 'object' && (familyHead.hmo as { name?: string }).name;
                let receiptData;
                if (isHmoPatient) {
                    receiptData = {
                        receiptNumber: `REG-FAM-${familyHead.id}-${Date.now()}`, receiptDate: new Date().toLocaleDateString(),
                        patientName: familyHead.name, patientEmail: familyHead.email,
                        items: [{ description: 'Registration & Consultation (Family, Covered by HMO)', quantity: 1, unitPrice: 0, totalPrice: 0 }],
                        subtotal: 0, amountPaid: 0, totalDueFromPatient: 0, paymentMethod: 'HMO Coverage', isHmoCovered: true,
                        hmoName: (familyHead.hmo as { name: string }).name, coveredAmount: 0, latestDentalRecord: null
                    };
                } else {
                    receiptData = {
                        receiptNumber: `REG-FAM-${familyHead.id}-${Date.now()}`, receiptDate: new Date().toLocaleDateString(),
                        patientName: familyHead.name, patientEmail: familyHead.email,
                        items: [{ description: 'Registration & Consultation (Family)', quantity: 1, unitPrice: 10000, totalPrice: 10000 }],
                        subtotal: 10000, amountPaid: 10000, totalDueFromPatient: 10000, paymentMethod: 'New Registration Fee', isHmoCovered: false,
                        hmoName: 'N/A', coveredAmount: 0, latestDentalRecord: null
                    };
                }
                const senderUserId = 1;
                await emailService.sendReceiptEmail(familyHead.email, receiptData, senderUserId);
                console.log(`Family registration confirmation sent to ${familyHead.email}`);
            } catch (emailError: any) {
                console.error(`Error sending family registration confirmation email: ${emailError.message}`);
            }
        }
        const completeFamily = await this.getPatientById(familyHead.id);
        if (!completeFamily) {
            throw new Error('Failed to retrieve the newly created family.');
        }
        return completeFamily;
    }

    async addReturningGuest(identifier: string) {
        const isEmail = identifier.includes('@');
        const queryCondition = isEmail 
            ? eq(patients.email, identifier) 
            : eq(patients.phoneNumber, identifier);

        const [patient] = await db.select().from(patients).where(queryCondition).limit(1);
        
        if (!patient) {
            throw new Error('Patient with this phone number or email not found.');
        }
        
        const now = new Date();

        await db.insert(dailyVisits).values({
            patientId: patient.id,
            checkInTime: now,
        });

        this._sendReturningPatientNotifications(patient, now);

        return { 
            message: 'Returning guest visit recorded successfully.', 
            patientName: patient.name, 
            visitDate: now.toISOString().split('T')[0] 
        };
    }

    async getTodaysReturningPatients(user?: AuthenticatedUser, settings?: any) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todaysVisits = await db.select({
            id: dailyVisits.id,
            checkInTime: dailyVisits.checkInTime,
            patient: {
                id: patients.id,
                name: patients.name,
                sex: patients.sex,
                dateOfBirth: patients.dateOfBirth,
                hmo: patients.hmo,
                nextAppointmentDate: patients.nextAppointmentDate,
                phoneNumber: patients.phoneNumber,
                email: patients.email,
                address: patients.address
            }
        })
        .from(dailyVisits)
        .leftJoin(patients, eq(dailyVisits.patientId, patients.id))
        .where(gte(dailyVisits.checkInTime, today))
        .orderBy(desc(dailyVisits.checkInTime));
        
        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        if (shouldSeeContact) {
            return todaysVisits;
        }

        return todaysVisits.map(visit => {
            if (visit.patient) {
                const { phoneNumber, email, address, ...safePatient } = visit.patient;
                return { ...visit, patient: safePatient };
            }
            return visit;
        });
    }

    async getAllPatients(user?: AuthenticatedUser, settings?: any) {
        const allPatientsData = await db.query.patients.findMany({
            with: {
                familyHead: true,
                familyMembers: true,
                dentalRecords: {
                    orderBy: [desc(dentalRecords.createdAt)],
                    limit: 1,
                    with: { doctor: true }
                },
                dailyVisits: true,
            },
            orderBy: [desc(patients.createdAt)],
        });

        const processedPatients = allPatientsData.map(p => {
            const latestRecord = p.dentalRecords && p.dentalRecords.length > 0 ? p.dentalRecords[0] : null;
            const { dentalRecords, ...patientData } = p;
            return {
                ...patientData,
                latestTreatmentDone: latestRecord?.treatmentDone,
                latestTreatmentPlan: latestRecord?.treatmentPlan,
                latestProvisionalDiagnosis: latestRecord?.provisionalDiagnosis,
                doctorName: latestRecord?.doctor?.username
            };
        });

        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        if (shouldSeeContact) {
            return processedPatients;
        }
        
        return processedPatients.map(p => stripContactInfo(p));
    }

    async getPatientById(patientId: number, user?: AuthenticatedUser, settings?: any) {
        const patient = await db.query.patients.findFirst({
            where: eq(patients.id, patientId),
            with: {
                familyHead: true,
                familyMembers: { with: { dentalRecords: true } },
                dentalRecords: { orderBy: [desc(dentalRecords.createdAt)] },
            },
        });

        if (!patient) {
            return null;
        }

        const shouldSeeContact = canUserSeeContactDetails(user, settings);
        return shouldSeeContact ? patient : stripContactInfo(patient);
    }

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
        
        await db.update(patients).set({ ...patientData, updatedAt: new Date() }).where(eq(patients.id, patientId));
        
        if (existingPatient.isFamilyHead) {
            const memberUpdateData: { hmo?: any; address?: any; updatedAt?: Date } = {};
            let shouldUpdateMembers = false;

            if (patientData.hmo !== undefined) {
                memberUpdateData.hmo = patientData.hmo;
                shouldUpdateMembers = true;
            }
            if (patientData.address !== undefined) {
                memberUpdateData.address = patientData.address;
                shouldUpdateMembers = true;
            }

            if (shouldUpdateMembers) {
                memberUpdateData.updatedAt = new Date();
                await db.update(patients)
                  .set(memberUpdateData)
                  .where(eq(patients.familyId, patientId));
            }
        }
        
        return { success: true, message: 'Patient information updated successfully.' };
    }

    async scheduleNextAppointment(patientId: number, interval: string) {
        const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!patientExists) {
            return { success: false, message: 'Patient not found.' };
        }
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
            default:
                return { success: false, message: 'Invalid appointment interval provided.' };
        }
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

    async sendAppointmentReminder(patientId: number) {
        const patient = await this.getPatientById(patientId);
        if (!patient) { return { success: false, message: "Patient not found." }; }
        if (!patient.email) { return { success: false, message: "Patient does not have an email address." }; }
        if (!patient.nextAppointmentDate) { return { success: false, message: "Patient does not have a next appointment date." }; }
        try {
            const reminderData = {
                patientName: patient.name,
                appointmentDate: patient.nextAppointmentDate.toISOString(),
                outstandingAmount: patient.outstanding || '0.00',
            };
            const staffBccRecipients = await (emailService as any)._getOwnerAndStaffEmails();
            await emailService.sendAppointmentReminder(patient.email, reminderData, staffBccRecipients);
            return { success: true, message: `Reminder sent to ${patient.name}.` };
        } catch (error: any) {
            console.error(`Error sending appointment reminder: ${error.message}`);
            return { success: false, message: `Failed to send reminder. ${error.message}` };
        }
    }

    async createDentalRecord(patientId: number, doctorId: number, recordData: Partial<DentalRecordInsert>) {
        const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
        if (!patientExists) { return { success: false, message: 'Patient not found.' }; }
        const newRecord: DentalRecordInsert = {
            patientId, doctorId, ...recordData,
            createdAt: new Date(), updatedAt: new Date(),
        };
        const [inserted] = await db.insert(dentalRecords).values(newRecord);
        const newRecordId = (inserted as any).insertId;
        const [newDentalRecord] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, newRecordId)).limit(1);
        if (!newDentalRecord) { return { success: false, message: 'Dental record added but could not be found immediately after.' }; }
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

