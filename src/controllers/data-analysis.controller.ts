import { Request, Response } from 'express';
import { dataAnalysisService } from '../services/data-analysis.service';

export class DataAnalysisController {

    /**
     * Handles the request for key performance metrics.
     */
    getDashboardKeyMetrics = async (req: Request, res: Response): Promise<void> => {
        try {
            const metrics = await dataAnalysisService.getKeyMetrics();
            res.json(metrics);
        } catch (error) {
            console.error('Error fetching key metrics:', error);
            res.status(500).json({ error: 'Server error fetching key metrics.' });
        }
    }

    /**
     * Handles the request for common diagnoses data.
     */
    getMostCommonDiagnoses = async (req: Request, res: Response): Promise<void> => {
        try {
            const diagnoses = await dataAnalysisService.getCommonDiagnoses();
            res.json(diagnoses);
        } catch (error) {
            console.error('Error fetching common diagnoses:', error);
            res.status(500).json({ error: 'Server error fetching common diagnoses.' });
        }
    }

    /**
     * Handles the request for treatment distribution data.
     */
    getTreatmentPlanDistribution = async (req: Request, res: Response): Promise<void> => {
        try {
            const distribution = await dataAnalysisService.getTreatmentDistribution();
            res.json(distribution);
        } catch (error) {
            console.error('Error fetching treatment distribution:', error);
            res.status(500).json({ error: 'Server error fetching treatment distribution.' });
        }
    }

    /**
     * Handles the request for patient demographics data.
     */
    getPatientDemographics = async (req: Request, res: Response): Promise<void> => {
        try {
            const demographics = await dataAnalysisService.getPatientDemographics();
            res.json(demographics);
        } catch (error) {
            console.error('Error fetching patient demographics:', error);
            res.status(500).json({ error: 'Server error fetching patient demographics.' });
        }
    }

    /**
     * Handles the request for patient flow data over the last 30 days.
     */
    getPatientFlowAnalysis = async (req: Request, res: Response): Promise<void> => {
        try {
            const flow = await dataAnalysisService.getPatientFlow();
            res.json(flow);
        } catch (error) {
            console.error('Error fetching patient flow:', error);
            res.status(500).json({ error: 'Server error fetching patient flow.' });
        }
    }

    /**
     * Handles the request for HMO distribution data.
     */
    getHmoProviderDistribution = async (req: Request, res: Response): Promise<void> => {
        try {
            const distribution = await dataAnalysisService.getHmoDistribution();
            res.json(distribution);
        } catch (error) {
            console.error('Error fetching HMO distribution:', error);
            res.status(500).json({ error: 'Server error fetching HMO distribution.' });
        }
    }

    /**
     * Handles the request for doctor performance data.
     */
    getDoctorPerformance = async (req: Request, res: Response): Promise<void> => {
        try {
            const performance = await dataAnalysisService.getDoctorPerformance();
            res.json(performance);
        } catch (error) {
            console.error('Error fetching doctor performance:', error);
            res.status(500).json({ error: 'Server error fetching doctor performance.' });
        }
    }

    /**
     * Handles the request for top inventory usage data.
     */
    getMostUsedInventoryItems = async (req: Request, res: Response): Promise<void> => {
        try {
            const usage = await dataAnalysisService.getTopInventoryUsage();
            res.json(usage);
        } catch (error) {
            console.error('Error fetching top inventory usage:', error);
            res.status(500).json({ error: 'Server error fetching top inventory usage.' });
        }
    }
}

export const dataAnalysisController = new DataAnalysisController();

