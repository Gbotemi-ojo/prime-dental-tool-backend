// src/routes/data-analysis.routes.ts
import { Router } from 'express';
import { dataAnalysisController } from '../controllers/data-analysis.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Secure all analysis routes to be accessed only by owner and staff
router.use(authenticateToken, authorizeRoles(['owner', 'staff']));

// --- DASHBOARD & KEY METRICS ---
router.get('/key-metrics', dataAnalysisController.getDashboardKeyMetrics);

// --- CLINICAL ANALYTICS ---
router.get('/diagnoses-common', dataAnalysisController.getMostCommonDiagnoses);
router.get('/doctor-performance', dataAnalysisController.getDoctorPerformance);

// --- OPERATIONAL ANALYTICS ---
router.get('/patient-demographics', dataAnalysisController.getPatientDemographics);
router.get('/patient-flow', dataAnalysisController.getPatientFlowAnalysis);

// --- FINANCIAL ANALYTICS ---
router.get('/hmo-distribution', dataAnalysisController.getHmoProviderDistribution);
router.get('/treatment-revenue', dataAnalysisController.getTreatmentRevenueAnalysis);

// --- INVENTORY ANALYTICS ---
router.get('/inventory-usage-top', dataAnalysisController.getMostUsedInventoryItems);


export default router;
