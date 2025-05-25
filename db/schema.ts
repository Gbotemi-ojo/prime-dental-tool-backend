import { serial, int, varchar, text, boolean, timestamp, json, mysqlTable } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// Existing Patients Schema
export const patients = mysqlTable("patients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sex: varchar("sex", { length: 50 }).notNull(),
  dateOfBirth: timestamp("date_of_birth", { mode: 'date' }),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Existing Patient Relations
export const patientRelations = relations(patients, ({ many }) => ({
  dentalRecords: many(dentalRecords),
}));


// Users Schema
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  role: varchar("role", { length: 50, enum: ['owner', 'staff'] }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Relations for Users
export const userRelations = relations(users, ({ many }) => ({
  dentalRecords: many(dentalRecords),
}));


// Updated Dental Records Schema (doctorId is now nullable)
export const dentalRecords = mysqlTable("dental_records", {
  id: serial("id").primaryKey(),
  
  patientId: int("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  
  // *** CHANGE HERE: Removed .notNull() to allow SET NULL on doctor deletion ***
  doctorId: int("doctor_id")
    .references(() => users.id, { onDelete: 'set null' }),

  complaint: text("complaint"),
  historyOfPresentComplaint: text("history_of_present_complaint"),
  pastDentalHistory: text("past_dental_history"),

  medicationS: boolean("medication_s").default(false),
  medicationH: boolean("medication_h").default(false),
  medicationA: boolean("medication_a").default(false),
  medicationD: boolean("medication_d").default(false),
  medicationE: boolean("medication_e").default(false),
  medicationPUD: boolean("medication_pud").default(false),
  medicationBloodDisorder: boolean("medication_blood_disorder").default(false),
  medicationAllergy: boolean("medication_allergy").default(false),

  familySocialHistory: text("family_social_history"),
  extraOralExamination: text("extra_oral_examination"),
  intraOralExamination: text("intra_oral_examination"),

  teethPresent: json("teeth_present"),
  cariousCavity: json("carious_cavity"),
  filledTeeth: json("filled_teeth"),
  missingTeeth: json("missing_teeth"),
  fracturedTeeth: json("fractured_teeth"),

  periodontalCondition: varchar("periodontal_condition", { length: 100 }),
  oralHygiene: varchar("oral_hygiene", { length: 50 }),

  investigations: text("investigations"),
  xrayFindings: text("x_ray_findings"),

  provisionalDiagnosis: json("provisional_diagnosis"),
  treatmentPlan: json("treatment_plan"),

  calculus: text("calculus"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Dental Record Relations
export const dentalRecordRelations = relations(dentalRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [dentalRecords.patientId],
    references: [patients.id],
  }),
  doctor: one(users, {
    fields: [dentalRecords.doctorId],
    references: [users.id],
  }),
}));