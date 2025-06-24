import { serial, int, varchar, text, boolean, timestamp, json, mysqlTable, decimal } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// --- MODIFIED PATIENTS SCHEMA ---
// Updated to support family hierarchies.
export const patients = mysqlTable("patients", {
    id: serial("id").primaryKey(),
    
    // --- NEW FIELDS FOR FAMILY STRUCTURE ---
    // A patient can be part of a family, linked by familyId.
    // The head of the family will have this field as NULL.
    familyId: int("family_id").references((): any => patients.id, { onDelete: 'set null' }),
    
    // Explicitly flag if a patient is the primary account holder for a family.
    isFamilyHead: boolean("is_family_head").default(false).notNull(),

    // --- EXISTING FIELDS ---
    name: varchar("name", { length: 255 }).notNull(),
    sex: varchar("sex", { length: 50 }).notNull(),
    dateOfBirth: timestamp("date_of_birth", { mode: 'date' }),

    // Phone number and email are now nullable because family members (sub-patients)
    // may not have their own unique contact info. This data will be managed
    // by the `isFamilyHead` patient.
    phoneNumber: varchar("phone_number", { length: 20 }).unique(),
    email: varchar("email", { length: 255 }).unique(),

    // HMO is stored on the primary patient and inherited by family members.
    hmo: json("hmo"), // e.g., { name: "HMO Name", status: "ONBOARD" }

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// --- UPDATED PATIENT RELATIONS ---
// Added relations to define the family hierarchy within the patients table.
export const patientRelations = relations(patients, ({ one, many }) => ({
    // Existing relation to dental records remains unchanged.
    dentalRecords: many(dentalRecords),

    // A member patient belongs to one family head.
    // This defines the "many-to-one" side of the relationship.
    familyHead: one(patients, {
        fields: [patients.familyId],
        references: [patients.id],
        relationName: 'familyHierarchy', // Use a consistent name for the bi-directional relation
    }),

    // A head patient can have many family members.
    // This defines the "one-to-many" side of the relationship.
    familyMembers: many(patients, {
        relationName: 'familyHierarchy',
    }),
}));


// Users Schema (Unchanged)
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

// Relations for Users (Unchanged)
export const userRelations = relations(users, ({ many }) => ({
    dentalRecords: many(dentalRecords),
    inventoryTransactions: many(inventoryTransactions),
}));


// Dental Records Schema (Unchanged)
// This schema correctly links a dental record to a specific patient's ID,
// whether they are a family head or a family member.
export const dentalRecords = mysqlTable("dental_records", {
    id: serial("id").primaryKey(),
    patientId: int("patient_id")
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),
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
    treatmentDone: text("treatment_done"),
    calculus: text("calculus"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Dental Record Relations (Unchanged)
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


// --- INVENTORY SCHEMAS (Unchanged) ---

// Inventory Items Schema
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

// Inventory Item Relations
export const inventoryItemRelations = relations(inventoryItems, ({ many }) => ({
    transactions: many(inventoryTransactions),
}));


// Inventory Transactions Schema
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

// Inventory Transaction Relations
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
