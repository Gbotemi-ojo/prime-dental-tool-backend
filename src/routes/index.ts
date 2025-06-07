// src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.routes';
import patientRoutes from './patient.routes';
import userRoutes from './user.routes';
import inventoryRoutes from './inventory.routes';
import invoiceRoutes from './invoice.routes'; // NEW
import receiptRoutes from './receipt.routes'; // NEW

const router = Router();

// Health Check / Test Endpoint
router.get("/health", (req, res) => {
  res.json({ message: "EMR API is healthy and running!" });
});

// Mount individual routers under specific paths
router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/admin/users', userRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/invoices', invoiceRoutes); // NEW: Invoices routes
router.use('/receipts', receiptRoutes); // NEW: Receipts routes

export default router;