import { serial, int, varchar, text, boolean, timestamp, json, mysqlTable, decimal } from 'drizzle-orm/mysql-core';
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
  // UPDATED: Added 'doctor' to the enum for the role field
  role: varchar("role", { length: 50, enum: ['owner', 'staff', 'nurse', 'doctor'] }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Relations for Users
export const userRelations = relations(users, ({ many }) => ({
  dentalRecords: many(dentalRecords),
  inventoryTransactions: many(inventoryTransactions), // Added for inventory
}));


// Updated Dental Records Schema (doctorId is now nullable)
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


// --- NEW INVENTORY SCHEMAS ---

// Inventory Items Schema - UPDATED
export const inventoryItems = mysqlTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(), // e.g., "Gloves", "Syringes", "Composite Resin"

  // *** ADDED THESE TWO COLUMNS ***
  category: varchar("category", { length: 100 }).notNull(), // New: Item category (required)
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // New: Price per unit (required)
  // ******************************

  description: text("description"),
  unitOfMeasure: varchar("unit_of_measure", { length: 50 }).notNull(), // e.g., "box", "piece", "ml", "pack"
  reorderLevel: int("reorder_level").default(0).notNull(), // When to reorder
  currentStock: int("current_stock").default(0).notNull(), // To be managed by transactions
  costPerUnit: decimal("cost_per_unit", { precision: 10, scale: 2 }).default('0.00'), // Optional: for costing
  supplier: varchar("supplier", { length: 255 }), // Optional
  lastRestockedAt: timestamp("last_restocked_at", { mode: 'date' }), // Date of last stock-in
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
  userId: int("user_id") // The staff/owner who recorded the transaction
    .references(() => users.id, { onDelete: 'set null' }), // Set null if user is deleted
  transactionType: varchar("transaction_type", { length: 50, enum: ['stock_in', 'stock_out', 'adjustment'] }).notNull(), // 'stock_in', 'stock_out', 'adjustment'
  quantity: int("quantity").notNull(), // Positive for stock_in/adjustment+, negative for stock_out/adjustment-
  notes: text("notes"), // e.g., "Restocked from Supplier X", "Used for patient Y", "Count discrepancy"
  transactionDate: timestamp("transaction_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(), // This is effectively the transactionDate, kept for consistency
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

