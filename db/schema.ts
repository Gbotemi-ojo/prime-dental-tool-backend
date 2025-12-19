// db/schema.ts
import { serial, int, varchar, text, boolean, timestamp, json, mysqlTable, decimal } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// --- PATIENTS SCHEMA ---
export const patients = mysqlTable("patients", {
    id: serial("id").primaryKey(),
    familyId: int("family_id").references((): any => patients.id, { onDelete: 'set null' }),
    isFamilyHead: boolean("is_family_head").default(false).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sex: varchar("sex", { length: 50 }).notNull(),
    dateOfBirth: timestamp("date_of_birth", { mode: 'date' }),
    phoneNumber: varchar("phone_number", { length: 20 }).unique(),
    email: varchar("email", { length: 255 }).unique(),
    address: text("address"), // UPDATED: Added patient address field
    hmo: json("hmo"),
    nextAppointmentDate: timestamp("next_appointment_date", { mode: 'date' }),
    outstanding: decimal("outstanding", { precision: 10, scale: 2 }).default('0.00').notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// --- PATIENT RELATIONS ---
export const patientRelations = relations(patients, ({ one, many }) => ({
    dentalRecords: many(dentalRecords),
    dailyVisits: many(dailyVisits), // ADDED RELATION
    familyHead: one(patients, {
        fields: [patients.familyId],
        references: [patients.id],
        relationName: 'familyHierarchy',
    }),
    familyMembers: many(patients, {
        relationName: 'familyHierarchy',
    }),
}));

// --- NEW SCHEMA: DAILY VISITS ---
export const dailyVisits = mysqlTable("daily_visits", {
    id: serial("id").primaryKey(),
    patientId: int("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
    checkInTime: timestamp("check_in_time").defaultNow().notNull(),
});

// --- DAILY VISITS RELATIONS ---
export const dailyVisitsRelations = relations(dailyVisits, ({ one }) => ({
    patient: one(patients, {
        fields: [dailyVisits.patientId],
        references: [patients.id],
    }),
}));


// --- USERS SCHEMA ---
export const users = mysqlTable("users", {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).unique(),
    role: varchar("role", { length: 50, enum: ['owner', 'staff', 'nurse', 'doctor'] }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// --- USER RELATIONS ---
export const userRelations = relations(users, ({ many }) => ({
    dentalRecords: many(dentalRecords),
    inventoryTransactions: many(inventoryTransactions),
}));

// --- DENTAL RECORDS SCHEMA ---
export const dentalRecords = mysqlTable("dental_records", {
    id: serial("id").primaryKey(),
    patientId: int("patient_id")
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: int("doctor_id")
        .references(() => users.id, { onDelete: 'set null' }),
    receptionistId: int("receptionist_id")
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
    medicationHIV: boolean("medication_hiv").default(false),
    medicationHepatitis: boolean("medication_hepatitis").default(false),
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
    xrayUrl: varchar("xray_url", { length: 512 }),
    provisionalDiagnosis: json("provisional_diagnosis"),
    treatmentPlan: json("treatment_plan"),
    treatmentDone: text("treatment_done"),
    calculus: text("calculus"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// --- DENTAL RECORD RELATIONS ---
export const dentalRecordRelations = relations(dentalRecords, ({ one }) => ({
    patient: one(patients, {
        fields: [dentalRecords.patientId],
        references: [patients.id],
    }),
    doctor: one(users, {
        fields: [dentalRecords.doctorId],
        references: [users.id],
        relationName: 'doctor_records'
    }),
    receptionist: one(users, {
        fields: [dentalRecords.receptionistId],
        references: [users.id],
        relationName: 'receptionist_records'
    }),
}));

// --- INVENTORY SCHEMAS ---
export const inventoryItems = mysqlTable("inventory_items", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    category: varchar("category", { length: 100 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    description: text("description"),
    unitOfMeasure: varchar("unit_of_measure", { length: 50 }).notNull(),
    reorderLevel: int("reorder_level").default(0).notNull(),
    currentStock: int("current_stock").default(0).notNull(),
    costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }).default('0.00'),
    supplier: varchar("supplier", { length: 255 }),
    lastRestockedAt: timestamp("last_restocked_at", { mode: 'date' }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const inventoryItemRelations = relations(inventoryItems, ({ many }) => ({
    transactions: many(inventoryTransactions),
}));

export const inventoryTransactions = mysqlTable("inventory_transactions", {
    id: serial("id").primaryKey(),
    itemId: int("item_id")
        .notNull()
        .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    userId: int("user_id")
        .references(() => users.id, { onDelete: 'set null' }),
    transactionType: varchar("transaction_type", { length: 50, enum: ['stock_in', 'stock_out', 'adjustment'] }).notNull(),
    quantity: int("quantity").notNull(),
    notes: text("notes"),
    transactionDate: timestamp("transaction_date").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryTransactionRelations = relations(inventoryTransactions, ({ one }) => ({
    item: one(inventoryItems, {
        fields: [inventoryTransactions.itemId],
        references: [inventoryItems.id],
    }),
    user: one(users, {
        fields: [inventoryTransactions.userId],
        references: [users.id],
    }),
}));

export const settings = mysqlTable("settings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  config: json("config").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const serviceItems = mysqlTable("service_items", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

export const hmoProviders = mysqlTable("hmo_providers", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull().unique(),
});

// Add this new table schema at the end of db/schema.ts

// --- IDEMPOTENCY KEYS SCHEMA ---
export const idempotencyKeys = mysqlTable("idempotency_keys", {
    key: varchar("key", { length: 255 }).primaryKey(),
    responseBody: json("response_body").notNull(),
    statusCode: int("status_code").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mirrors the patient table for demographic data, but for external web requests
export const websiteBookings = mysqlTable("website_bookings", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    sex: varchar("sex", { length: 50 }).notNull(),
    dateOfBirth: timestamp("date_of_birth", { mode: 'date' }),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(), // Vital for contact
    email: varchar("email", { length: 255 }),
    address: text("address"),
    hmo: json("hmo"), // Can capture HMO details if the form asks for it
    requestedAppointmentDate: timestamp("requested_appointment_date", { mode: 'date' }), // Maps to nextAppointmentDate
    complaint: text("complaint"), // Useful for knowing why they are booking
    status: varchar("status", { length: 20, enum: ['pending', 'confirmed', 'rejected', 'converted'] }).default('pending').notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const dailyReports = mysqlTable("daily_reports", {
    id: serial("id").primaryKey(),
    date: timestamp("report_date", { mode: 'date' }).notNull(),
    submittedBy: int("submitted_by").references(() => users.id, { onDelete: 'set null' }),
    receptionistName: varchar("receptionist_name", { length: 255 }), // In case they want to type a specific name
    
    // Operations
    openingTime: varchar("opening_time", { length: 20 }),
    closingTime: varchar("closing_time", { length: 20 }),
    
    // Counts
    newPatientsCount: int("new_patients_count").default(0),
    returningPatientsCount: int("returning_patients_count").default(0),
    hmoPatientsCount: int("hmo_patients_count").default(0),
    
    // Financials (JSON for flexibility)
    // Structure: [{ patient: string, description: string, amount: number, method: 'cash'|'pos'|'transfer' }]
    financialTransactions: json("financial_transactions"),
    cashTotal: decimal("cash_total", { precision: 12, scale: 2 }).default('0.00'),
    posTotal: decimal("pos_total", { precision: 12, scale: 2 }).default('0.00'),
    transferTotal: decimal("transfer_total", { precision: 12, scale: 2 }).default('0.00'),
    grandTotal: decimal("grand_total", { precision: 12, scale: 2 }).default('0.00'),
    
    // Expenses
    // Structure: [{ description: string, amount: number }]
    expensesBreakdown: json("expenses_breakdown"),
    expensesTotal: decimal("expenses_total", { precision: 12, scale: 2 }).default('0.00'),
    
    // Outstanding
    // Structure: [{ patient: string, amount: number }]
    outstandingBalances: json("outstanding_balances"),
    
    // Narrative Sections
    observations: text("observations"),
    followUpReminders: text("follow_up_reminders"),
    closingNotes: text("closing_notes"),
    
    // Clinical Activity Log (Summary #2)
    // Structure: [{ patient: string, summary: string }]
    patientActivityLog: json("patient_activity_log"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Add relation to users table relations if needed
export const dailyReportRelations = relations(dailyReports, ({ one }) => ({
    submitter: one(users, {
        fields: [dailyReports.submittedBy],
        references: [users.id],
    }),
}));
