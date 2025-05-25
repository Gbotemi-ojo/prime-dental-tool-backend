import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

import { patients, users, dentalRecords } from '../db/schema';
import * as schema from '../db/schema';

const app = express();

// Middleware Setup
app.use(cors());
app.use(express.json());

// Database Configuration
const dbCredentials = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
console.log('Database Credentials:', dbCredentials.host, ':', dbCredentials.port, '/', dbCredentials.database);

const pool = mysql.createPool({
  host: dbCredentials.host,
  port: dbCredentials.port,
  database: dbCredentials.database,
  user: dbCredentials.user,
  password: dbCredentials.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection on startup
async function testDatabaseConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Database connection successful!');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
testDatabaseConnection();

// Initialize Drizzle ORM
const db = drizzle(pool, { schema, mode: 'default' });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing MySQL connection pool...');
  await pool.end();
  console.log('MySQL connection pool closed.');
  process.exit(0);
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_please_change_me_in_env';

// Custom Middleware for Authentication and Authorization

// Authenticate Token: Verifies JWT from header and attaches user info to req.user
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// Authorize Roles: Checks if the authenticated user has one of the allowed roles
function authorizeRoles(allowedRoles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Access denied: No role assigned or token invalid.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied: You do not have the required permissions. Your role: ${req.user.role}` });
    }
    next();
  };
}

// API Endpoints

// Health Check / Test Endpoint
app.get("/api/health", (req, res) => {
  res.json({ message: "EMR API is healthy and running!" });
});

app.post('/api/auth/login', async (req:any, res:any) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, userId: user.id, role: user.role, username: user.username });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res:any) => {
  try {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Server error fetching user details.' });
  }
});

app.post('/api/patients/guest-submit', async (req:any, res:any) => {
  const { name, sex, dateOfBirth, phoneNumber, email } = req.body;

  if (!name || !sex || !phoneNumber) {
    return res.status(400).json({ error: 'Name, sex, and phone number are required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }

  try {
    const existingPatient = await db.select()
      .from(patients)
      .where(eq(patients.phoneNumber, phoneNumber))
      .limit(1);

    if (existingPatient.length > 0) {
      return res.status(409).json({ error: 'A patient with this phone number already exists.' });
    }

    const [inserted] = await db.insert(patients).values({
      name,
      sex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      phoneNumber,
      email,
    });

    const [newPatient] = await db.select().from(patients).where(eq(patients.id, inserted.insertId)).limit(1);

    res.status(201).json({ message: 'Patient information submitted successfully.', patient: newPatient });

  } catch (error: any) {
    console.error('Error submitting guest patient info:', error);
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'A patient with this email or phone number already exists.' });
    }
    res.status(500).json({ error: 'Server error during patient submission.' });
  }
});

app.post('/api/admin/users/staff', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }

  try {
    const [existingUser] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    if (email) {
      const [existingEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already exists.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [inserted] = await db.insert(users).values({
      username,
      passwordHash,
      email,
      role: 'staff',
      isActive: true,
    });

    const [newUser] = await db.select().from(users).where(eq(users.id, inserted.insertId)).limit(1);
    const { passwordHash: _, ...safeUser } = newUser;

    res.status(201).json({ message: 'Staff account created successfully.', user: safeUser });

  } catch (error) {
    console.error('Error creating staff account:', error);
    res.status(500).json({ error: 'Server error creating staff account.' });
  }
});

app.get('/api/admin/users/staff', authenticateToken, authorizeRoles(['owner']), async (req, res:any) => {
  try {
    const staffAccounts = await db.select().from(users).where(eq(users.role, 'staff'));
    const safeStaffAccounts = staffAccounts.map(({ passwordHash, ...user }) => user);
    res.json(safeStaffAccounts);
  } catch (error) {
    console.error('Error fetching staff accounts:', error);
    res.status(500).json({ error: 'Server error fetching staff accounts.' });
  }
});

app.put('/api/admin/users/:id/status', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const userId = parseInt(req.params.id);
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean.' });
  }
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userToUpdate || userToUpdate.role === 'owner') {
      return res.status(404).json({ error: 'Staff user not found or cannot change owner status.' });
    }

    await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
    res.json({ message: `Staff account ${isActive ? 'activated' : 'revoked'} successfully.` });

  } catch (error) {
    console.error('Error updating staff account status:', error);
    res.status(500).json({ error: 'Server error updating staff account status.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const userId = parseInt(req.params.id);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const [userToDelete] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userToDelete || userToDelete.role === 'owner') {
      return res.status(403).json({ error: 'User not found or cannot delete owner account.' });
    }

    await db.delete(users).where(eq(users.id, userId));
    res.json({ message: 'Staff account deleted successfully.' });

  } catch (error) {
    console.error('Error deleting staff account:', error);
    res.status(500).json({ error: 'Server error deleting staff account.' });
  }
});

app.get('/api/patients', authenticateToken, authorizeRoles(['owner', 'staff']), async (req, res:any) => {
  try {
    const allPatients = await db.select().from(patients);
    res.json(allPatients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Server error fetching patients.' });
  }
});

app.get('/api/patients/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const patientId = parseInt(req.params.id);

  if (isNaN(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  try {
    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    res.json(patient);
  } catch (error) {
    console.error('Error fetching patient by ID:', error);
    res.status(500).json({ error: 'Server error fetching patient.' });
  }
});

app.put('/api/patients/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const patientId = parseInt(req.params.id);
  const { name, sex, dateOfBirth, phoneNumber, email } = req.body;

  if (isNaN(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }
  if (!name || !sex || !phoneNumber) {
    return res.status(400).json({ error: 'Name, sex, and phone number are required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }

  try {
    const [existingPatient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const conflictByPhone = await db.select().from(patients)
      .where(and(eq(patients.phoneNumber, phoneNumber), eq(patients.id, patientId)))
      .limit(1);
    if (conflictByPhone.length > 0 && conflictByPhone[0].id !== patientId) {
        return res.status(409).json({ error: 'Another patient already exists with this phone number.' });
    }
    if (email) {
      const conflictByEmail = await db.select().from(patients)
        .where(and(eq(patients.email, email), eq(patients.id, patientId)))
        .limit(1);
      if (conflictByEmail.length > 0 && conflictByEmail[0].id !== patientId) {
          return res.status(409).json({ error: 'Another patient already exists with this email.' });
      }
    }

    await db.update(patients).set({
      name,
      sex,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      phoneNumber,
      email,
      updatedAt: new Date(),
    }).where(eq(patients.id, patientId));

    res.json({ message: 'Patient information updated successfully.' });

  } catch (error: any) {
    console.error('Error updating patient info:', error);
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'A patient with this phone number or email already exists.' });
    }
    res.status(500).json({ error: 'Server error updating patient information.' });
  }
});

app.post('/api/patients/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const patientId = parseInt(req.params.patientId);
  const doctorId = req.user.userId;

  if (isNaN(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  try {
    const [patientExists] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!patientExists) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const newRecordData = {
      patientId,
      doctorId,
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (newRecordData.teethPresent === undefined) newRecordData.teethPresent = null;
    if (newRecordData.cariousCavity === undefined) newRecordData.cariousCavity = null;
    if (newRecordData.filledTeeth === undefined) newRecordData.filledTeeth = null;
    if (newRecordData.missingTeeth === undefined) newRecordData.missingTeeth = null;
    if (newRecordData.fracturedTeeth === undefined) newRecordData.fracturedTeeth = null;
    if (newRecordData.provisionalDiagnosis === undefined) newRecordData.provisionalDiagnosis = null;
    if (newRecordData.treatmentPlan === undefined) newRecordData.treatmentPlan = null;


    const [inserted] = await db.insert(dentalRecords).values(newRecordData);

    const [newDentalRecord] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, inserted.insertId)).limit(1);

    res.status(201).json({ message: 'Dental record created successfully.', record: newDentalRecord });

  } catch (error) {
    console.error('Error creating dental record:', error);
    res.status(500).json({ error: 'Server error creating dental record.' });
  }
});

app.get('/api/patients/:patientId/dental-records', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const patientId = parseInt(req.params.patientId);

  if (isNaN(patientId)) {
    return res.status(400).json({ error: 'Invalid patient ID.' });
  }

  try {
    const records = await db
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
      .leftJoin(patients, eq(dentalRecords.patientId, patients.id))
      .where(eq(dentalRecords.patientId, patientId))
      .groupBy(dentalRecords.id);

    res.json(records);
  } catch (error) {
    console.error('Error fetching dental records for patient:', error);
    res.status(500).json({ error: 'Server error fetching dental records.' });
  }
});

app.get('/api/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const recordId = parseInt(req.params.id);

  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID.' });
  }

  try {
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

    if (!record) {
      return res.status(404).json({ error: 'Dental record not found.' });
    }
    res.json(record);
  } catch (error) {
    console.error('Error fetching dental record by ID:', error);
    res.status(500).json({ error: 'Server error fetching dental record.' });
  }
});

app.put('/api/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const recordId = parseInt(req.params.id);

  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID.' });
  }

  try {
    const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
    if (!recordExists) {
      return res.status(404).json({ error: 'Dental record not found.' });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    if (updateData.dateOfBirth) {
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }
    if (updateData.teethPresent === undefined) updateData.teethPresent = null;
    if (updateData.cariousCavity === undefined) updateData.cariousCavity = null;
    if (updateData.filledTeeth === undefined) updateData.filledTeeth = null;
    if (updateData.missingTeeth === undefined) updateData.missingTeeth = null;
    if (updateData.fracturedTeeth === undefined) updateData.fracturedTeeth = null;
    if (updateData.provisionalDiagnosis === undefined) updateData.provisionalDiagnosis = null;
    if (updateData.treatmentPlan === undefined) updateData.treatmentPlan = null;


    await db.update(dentalRecords).set(updateData).where(eq(dentalRecords.id, recordId));

    res.json({ message: 'Dental record updated successfully.' });

  } catch (error) {
    console.error('Error updating dental record:', error);
    res.status(500).json({ error: 'Server error updating dental record.' });
  }
});

app.delete('/api/dental-records/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const recordId = parseInt(req.params.id);

  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record ID.' });
  }

  try {
    const [recordExists] = await db.select().from(dentalRecords).where(eq(dentalRecords.id, recordId)).limit(1);
    if (!recordExists) {
      return res.status(404).json({ error: 'Dental record not found.' });
    }

    await db.delete(dentalRecords).where(eq(dentalRecords.id, recordId));

    res.json({ message: 'Dental record deleted successfully.' });

  } catch (error) {
    console.error('Error deleting dental record:', error);
    res.status(500).json({ error: 'Server error deleting dental record.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`EMR API Server running on port ${PORT}`));

export default app;
