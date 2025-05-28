import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, and, sum, ne, asc, desc } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

import { patients, users, dentalRecords,inventoryItems,inventoryTransactions } from '../db/schema';
import * as schema from '../db/schema';

const app = express();
const saltRounds = 10;

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

app.get('/api/admin/users/:id', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const userId = parseInt(req.params.id);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID provided.' });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    // Exclude sensitive information like password hash before sending the response
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);

  } catch (error) {
    console.error('Error fetching staff account by ID:', error);
    res.status(500).json({ error: 'Server error fetching staff account details.' });
  }
});
app.put('/api/admin/users/:id', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const userId = parseInt(req.params.id);
  const { username, email, role, isActive } = req.body;
  const currentLoggedInUserId = req.user.userId; // Get ID of the user making the request

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID provided.' });
  }

  // Basic validation for required fields
  if (!username || !role) {
    return res.status(400).json({ error: 'Username and Role are required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean.' });
  }

  try {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!userToUpdate) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    // --- Critical Security Checks ---
    // 1. Prevent an owner from changing their own role or deactivating their own account
    if (String(userId) === String(currentLoggedInUserId)) {
      if (userToUpdate.role === 'owner' && role !== 'owner') {
        return res.status(403).json({ error: "Forbidden: An owner cannot change their own role." });
      }
      if (userToUpdate.role === 'owner' && isActive === false) {
        return res.status(403).json({ error: "Forbidden: An owner cannot deactivate their own account." });
      }
    }

    // 2. Prevent changing an 'owner' role to 'staff' or vice-versa if not allowed
    // (This assumes only owners can manage roles, and an owner cannot demote another owner to staff here)
    if (userToUpdate.role === 'owner' && role === 'staff') {
        return res.status(403).json({ error: "Forbidden: Cannot change an owner's role to staff." });
    }
    // If you want to prevent changing a staff to owner without a specific 'promote' endpoint, add similar logic
    // if (userToUpdate.role === 'staff' && role === 'owner') {
    //     return res.status(403).json({ error: "Forbidden: Cannot promote staff to owner via this endpoint." });
    // }


    // Check for duplicate username (if changed)
    if (username !== userToUpdate.username) {
      const [existingUserWithUsername] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (existingUserWithUsername) {
        return res.status(409).json({ error: 'Username already exists.' });
      }
    }

    // Check for duplicate email (if changed and provided)
    if (email && email !== userToUpdate.email) {
      const [existingUserWithEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUserWithEmail) {
        return res.status(409).json({ error: 'Email already exists.' });
      }
    }

    // Perform the update
    await db.update(users).set({
      username,
      email,
      role,
      isActive,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    res.json({ message: 'Staff account updated successfully.' });

  } catch (error) {
    console.error('Error updating staff account:', error);
    res.status(500).json({ error: 'Server error updating staff account.' });
  }
});
// there is a chance we wont be using the /status enpoint below

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

app.put('/api/user/profile', authenticateToken, async (req:any, res:any) => {
  const currentLoggedInUserId = req.user.userId; // User ID from the JWT token
  const { username, email } = req.body; // Only allow updating username and email

  // Basic validation for required fields
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }

  try {
    const [userToUpdate] = await db.select().from(users).where(eq(users.id, currentLoggedInUserId)).limit(1);

    if (!userToUpdate) {
        // This case should ideally not happen if the token is valid and user exists
        return res.status(404).json({ error: 'User profile not found.' });
    }

    // Check for duplicate username if changed
    if (username !== userToUpdate.username) {
      const [existingUserWithUsername] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (existingUserWithUsername) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
    }

    // Check for duplicate email if changed and provided
    if (email && email !== userToUpdate.email) {
      const [existingUserWithEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUserWithEmail) {
        return res.status(409).json({ error: 'Email already in use.' });
      }
    }

    // Perform the update for allowed fields
    await db.update(users).set({
      username,
      email,
      updatedAt: new Date(), // Update timestamp
    }).where(eq(users.id, currentLoggedInUserId));

    res.json({ message: 'Profile updated successfully.' });

  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});


// PUT /api/user/profile/password - Change password for the authenticated user
// This endpoint allows a user to change their own password.
app.put('/api/user/profile/password', authenticateToken, async (req:any, res:any) => {
  const currentLoggedInUserId = req.user.userId;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: 'All password fields are required.' });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'New passwords do not match.' });
  }
  if (newPassword.length < 8) { // Example: minimum password length
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, currentLoggedInUserId)).limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' }); // Should not happen if token is valid
    }

    // Compare current password with stored hash
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds); // Use your defined saltRounds

    // Update password in DB
    await db.update(users).set({
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    }).where(eq(users.id, currentLoggedInUserId));

    res.json({ message: 'Password updated successfully.' });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Server error changing password.' });
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
// Add this new GET route to your backend API
app.get('/api/patients/:patientId/dental-records/:recordId', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
    const patientId = parseInt(req.params.patientId);
    const recordId = parseInt(req.params.recordId);

    if (isNaN(patientId) || isNaN(recordId)) {
        return res.status(400).json({ error: 'Invalid patient ID or record ID.' });
    }

    try {
        // Fetch the dental record, ensuring it belongs to the specified patient
        const [record] = await db.select({
            id: dentalRecords.id,
            patientId: dentalRecords.patientId,
            doctorId: dentalRecords.doctorId,
            doctorUsername: users.username, // Assuming 'users' table is joined to get doctor's name
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
        .leftJoin(users, eq(dentalRecords.doctorId, users.id)) // Join to get doctor's username
        .where(and( // Ensure both patientId and recordId match
            eq(dentalRecords.patientId, patientId),
            eq(dentalRecords.id, recordId)
        ))
        .limit(1); // Expect only one record

        if (!record) {
            return res.status(404).json({ error: 'Dental record not found for this patient.' });
        }
        res.json(record);
    } catch (error) {
        console.error('Error fetching specific dental record:', error);
        res.status(500).json({ error: 'Server error fetching dental record.' });
    }
});
// INVENTORY
app.get('/api/inventory/items', authenticateToken, authorizeRoles(['owner', 'staff']), async (req, res) => {
  try {
    const items = await db.select().from(inventoryItems);
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Server error fetching inventory items.' });
  }
});

// Existing GET inventory item by ID
app.get('/api/inventory/items/:id', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const itemId = parseInt(req.params.id);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID.' });
  }

  try {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item by ID:', error);
    res.status(500).json({ error: 'Server error fetching inventory item.' });
  }
});

// NEW: POST route to add a new inventory item
app.post('/api/inventory/items', authenticateToken, authorizeRoles(['owner', 'staff']), async (req: any, res: any) => {
  // Destructure all expected fields from the request body
  const { name, category, quantity, unitPrice, description, unitOfMeasure /* Optional: if you want to make unitOfMeasure dynamic */ } = req.body;

  // Basic validation
  if (!name || !category || quantity === undefined || unitPrice === undefined) {
    return res.status(400).json({ error: 'Name, Category, Quantity, and Unit Price are required.' });
  }

  // Validate quantity and unitPrice are numbers
  const parsedQuantity = parseInt(quantity);
  const parsedUnitPrice = parseFloat(unitPrice);

  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    return res.status(400).json({ error: 'Quantity must be a non-negative number.' });
  }
  if (isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
    return res.status(400).json({ error: 'Unit Price must be a non-negative number.' });
  }

  // Validate unitOfMeasure if it's being sent in the body, otherwise it will use the default.
  // The schema requires unitOfMeasure to be notNull.
  // If you always want to default to 'pcs' when not provided,
  // you can set it before the insert.
  const itemUnitOfMeasure = unitOfMeasure || 'pcs'; // Default to 'pcs' if not provided

  try {
    // Check for duplicate Name only before inserting
    const [existingItem] = await db.select().from(inventoryItems)
      .where(eq(inventoryItems.name, name))
      .limit(1);

    if (existingItem) {
      return res.status(409).json({ error: 'An inventory item with this name already exists.' });
    }

    // *** CORRECTED .values() OBJECT TO MATCH SCHEMA JS PROPERTY NAMES ***
    const insertResult = await db.insert(inventoryItems).values({
      name: name,                           // Schema field: name
      category: category,                   // Schema field: category
      unitPrice: parsedUnitPrice.toString(),// Ensure string if schema expects string
      currentStock: parsedQuantity,         // Schema field: currentStock (number)
      description: description || null,     // Schema field: description
      unitOfMeasure: itemUnitOfMeasure,     // Schema field: unitOfMeasure
      // reorderLevel, costPerUnit, supplier, lastRestockedAt, createdAt, updatedAt use schema defaults
    });

    // Drizzle's insert result structure can vary by driver.
    // 'insertId' is common for MySQL. For other DBs or to be more robust,
    // you might need to adjust this or use .returning() if available and preferred.
    const newId = (insertResult as any).insertId; // This is typical for mysql2 driver

    if (!newId && insertResult.length > 0 && (insertResult[0] as any).insertId) {
        // Some drivers might wrap it in an array, e.g. PlanetScale
        // const newId = (insertResult[0] as any).insertId;
    }
    
    if (!newId) {
        // If insertId is not directly available, and you don't have .returning(),
        // you might have to fetch by a unique field (like name) if insertId is unreliable.
        // However, for simplicity, we'll stick to fetching by ID if newId is retrieved.
        // This scenario should be rare if the DB driver consistently provides insertId.
        console.error('Failed to retrieve insertId from the insert operation result:', insertResult);
        // As a fallback, if you absolutely need the item and don't get an ID,
        // you could re-fetch by name, but this is less ideal.
        const [refetchedItemByName] = await db.select().from(inventoryItems)
                                          .where(eq(inventoryItems.name, name))
                                          .orderBy(inventoryItems.id) // Ensure you get the latest if names could be non-unique temporarily
                                          .limit(1);
        if (refetchedItemByName) {
             res.status(201).json({ message: 'Inventory item added successfully! (Fetched by name)', item: refetchedItemByName });
        } else {
            return res.status(500).json({ error: 'Server error: Item added but could not be retrieved.' });
        }
        return; // Exit after handling this case
    }


    // Fetch the newly created item to return it in the response
    const [newItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, newId)).limit(1);

    if (!newItem) {
        // This case should ideally not happen if insertId was valid
        return res.status(404).json({ error: 'Inventory item added but could not be found immediately after.'});
    }

    res.status(201).json({ message: 'Inventory item added successfully!', item: newItem });

  } catch (error: any) {
    console.error('Error adding inventory item:', error);
    // This 'ER_DUP_ENTRY' code is for MySQL. If you use a different DB, the code might vary.
    if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('UNIQUE constraint failed'))) { // More generic check
      // Check if the error message specifically mentions the 'name' constraint
      // For MySQL, error.message might be like: "Duplicate entry 'Test Item' for key 'inventory_items.name'"
      if (error.message && error.message.toLowerCase().includes("name")) { // Check if error message mentions the 'name' column
         return res.status(409).json({ error: 'An inventory item with this name already exists.' });
      }
      // Handle other unique constraint violations if any
      return res.status(409).json({ error: 'A unique constraint was violated.' });
    }
    res.status(500).json({ error: 'Server error adding inventory item.' });
  }
});

// Existing PUT inventory item by ID
app.put('/api/inventory/items/:id', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const itemId = parseInt(req.params.id);
  const { name, description, unitOfMeasure, reorderLevel, costPerUnit, supplier } = req.body;

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID.' });
  }
  if (!name || !unitOfMeasure) { // Name and unitOfMeasure are required for update too
    return res.status(400).json({ error: 'Item name and unit of measure are required.' });
  }

  try {
    const [existingItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!existingItem) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    // Check for duplicate name if name is changed
    // Use `ne` (not equal) operator to exclude the current item itself
    const [nameConflict] = await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.name, name), ne(inventoryItems.id, itemId)))
      .limit(1);
    if (nameConflict) {
      return res.status(409).json({ error: 'An inventory item with this name already exists.' });
    }

    await db.update(inventoryItems).set({
      name,
      description,
      unitOfMeasure,
      reorderLevel,
      costPerUnit,
      supplier,
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, itemId));

    res.json({ message: 'Inventory item updated successfully.' });

  } catch (error: any) {
    console.error('Error updating inventory item:', error);
    if (error.code === 'ER_DUP_ENTRY') { // This can still happen if another item already has that name
      return res.status(409).json({ error: 'An inventory item with this name already exists.' });
    }
    res.status(500).json({ error: 'Server error updating inventory item.' });
  }
});

// Existing DELETE inventory item by ID
app.delete('/api/inventory/items/:id', authenticateToken, authorizeRoles(['owner']), async (req:any, res:any) => {
  const itemId = parseInt(req.params.id);

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID.' });
  }

  try {
    const [itemExists] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!itemExists) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
    res.json({ message: 'Inventory item deleted successfully. Associated transactions will also be removed.' });

  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Server error deleting inventory item.' });
  }
});

// Existing POST inventory transactions
app.post('/api/inventory/transactions', authenticateToken, authorizeRoles(['owner', 'staff']), async (req: any, res:any) => {
  const { itemId, transactionType, quantity, notes } = req.body;
  const userId = req.user.userId;

  if (!itemId || !transactionType || !quantity) { // Quantity can be negative for adjustment
    return res.status(400).json({ error: 'Item ID, transaction type, and quantity are required.' });
  }
  if (!['stock_in', 'stock_out', 'adjustment'].includes(transactionType)) {
    return res.status(400).json({ error: 'Invalid transaction type. Must be "stock_in", "stock_out", or "adjustment".' });
  }
  if (transactionType !== 'adjustment' && quantity <= 0) { // Quantity for stock_in/out must be positive
    return res.status(400).json({ error: `Quantity must be positive for '${transactionType}' transaction.` });
  }

  try {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    let newStock = item.currentStock;
    let finalTransactionQuantity = quantity; // The quantity that will be stored in the transaction table

    if (transactionType === 'stock_in') {
      newStock += quantity;
    } else if (transactionType === 'stock_out') {
      if (newStock < quantity) {
        return res.status(400).json({ error: `Insufficient stock. Only ${newStock} ${item.unitOfMeasure} of ${item.name} available.` });
      }
      newStock -= quantity;
      finalTransactionQuantity = -quantity; // Store as negative for stock-out
    } else if (transactionType === 'adjustment') {
        // For adjustment, quantity can be positive or negative
        newStock += quantity;
        finalTransactionQuantity = quantity; // Store as is for adjustment
    }

    // Update item's current stock and last restocked date
    await db.update(inventoryItems).set({
      currentStock: newStock,
      lastRestockedAt: transactionType === 'stock_in' ? new Date() : item.lastRestockedAt, // Update only on stock_in
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, itemId));

    // Record the transaction
    const [inserted] = await db.insert(inventoryTransactions).values({
      itemId,
      userId,
      transactionType,
      quantity: finalTransactionQuantity, // Store actual change (+/-)
      notes,
      transactionDate: new Date(),
    });

    const newTransactionId = (inserted as any).insertId;
    const [newTransaction] = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.id, newTransactionId)).limit(1);

    res.status(201).json({ message: 'Inventory transaction recorded successfully.', transaction: newTransaction, newStockLevel: newStock });

  } catch (error) {
    console.error('Error recording inventory transaction:', error);
    res.status(500).json({ error: 'Server error recording inventory transaction.' });
  }
});

// Existing GET inventory transactions for a specific item
app.get('/api/inventory/items/:itemId/transactions', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const itemId = parseInt(req.params.itemId);

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID.' });
  }

  try {
    const transactions = await db.select({
      // ... your select fields ...
      id: inventoryTransactions.id,
      itemId: inventoryTransactions.itemId,
      userId: inventoryTransactions.userId,
      username: users.username,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
      .from(inventoryTransactions)
      .leftJoin(users, eq(inventoryTransactions.userId, users.id))
      .where(eq(inventoryTransactions.itemId, itemId))
      .orderBy(asc(inventoryTransactions.transactionDate)); // <-- CORRECTED LINE HERE

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching item transactions:', error);
    res.status(500).json({ error: 'Server error fetching item transactions.' });
  }
});

// Existing GET all inventory transactions
app.get('/api/inventory/transactions', authenticateToken, authorizeRoles(['owner']), async (req, res) => {
  try {
    const transactions = await db.select({
      // ... your select fields ...
      id: inventoryTransactions.id,
      itemId: inventoryTransactions.itemId,
      itemName: inventoryItems.name,
      itemUnit: inventoryItems.unitOfMeasure,
      userId: inventoryTransactions.userId,
      username: users.username,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
      .from(inventoryTransactions)
      .leftJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .leftJoin(users, eq(inventoryTransactions.userId, users.id))
      .orderBy(desc(inventoryTransactions.transactionDate)); // <-- CORRECTED LINE HERE
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching all inventory transactions:', error);
    res.status(500).json({ error: 'Server error fetching all inventory transactions.' });
  }
});

// Existing GET current stock level
app.get('/api/inventory/items/:id/current-stock', authenticateToken, authorizeRoles(['owner', 'staff']), async (req:any, res:any) => {
  const itemId = parseInt(req.params.id);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID.' });
  }

  try {
    const [item] = await db.select({
      id: inventoryItems.id,
      name: inventoryItems.name,
      unitOfMeasure: inventoryItems.unitOfMeasure,
      currentStock: inventoryItems.currentStock,
      reorderLevel: inventoryItems.reorderLevel,
      costPerUnit: inventoryItems.costPerUnit,
      supplier: inventoryItems.supplier,
    }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    res.json({
      itemId: item.id,
      itemName: item.name,
      unitOfMeasure: item.unitOfMeasure,
      currentStock: item.currentStock,
      reorderLevel: item.reorderLevel,
      status: item.currentStock <= item.reorderLevel ? 'Reorder Needed' : 'In Stock'
    });

  } catch (error) {
    console.error('Error fetching current stock level:', error);
    res.status(500).json({ error: 'Server error fetching current stock level.' });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`EMR API Server running on port ${PORT}`));

export default app;
