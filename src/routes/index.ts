// src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.routes';
import patientRoutes from './patient.routes';
import userRoutes from './user.routes';
import inventoryRoutes from './inventory.routes';
import invoiceRoutes from './invoice.routes';
import receiptRoutes from './receipt.routes';
import xrayRoutes from './xray.routes';
import settingsRoutes from './settings.routes'; // Import settings routes
import billingRoutes from './billing.routes'
import dataAnalysisRoutes from './data-analysis.routes';
import broadcastRoutes from './broadcast.routes';
import websiteBookingRoutes from './websiteBooking.routes';


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
router.use('/invoices', invoiceRoutes);
router.use('/receipts', receiptRoutes);
router.use('/xray', xrayRoutes);
router.use('/settings', settingsRoutes); // Add settings routes
router.use('/billing', billingRoutes);
router.use('/analytics', dataAnalysisRoutes);
router.use('/broadcast', broadcastRoutes);
router.use('/website-bookings', websiteBookingRoutes);

export default router;