// src/controllers/billing.controller.ts
import { Request, Response } from 'express';
import { billingService } from '../services/billing.service';

export class BillingController {
    // Public endpoint for frontend to fetch options
    getBillingOptions = async (req: Request, res: Response): Promise<void> => {
        try {
            const options = await billingService.getBillingOptions();
            res.status(200).json(options);
        } catch (error: any) {
            res.status(500).json({ message: 'Error fetching billing options', error: error.message });
        }
    };

    // --- Admin: Service Items ---
    createServiceItem = async (req: Request, res: Response): Promise<void> => {
        try {
            const newItem = await billingService.createServiceItem(req.body);
            res.status(201).json(newItem);
        } catch (error: any) {
            res.status(500).json({ message: 'Error creating service item', error: error.message });
        }
    };
    
    updateServiceItem = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id);
        try {
            await billingService.updateServiceItem(id, req.body);
            res.status(200).json({ message: 'Service item updated successfully.' });
        } catch (error: any) {
            res.status(500).json({ message: 'Error updating service item', error: error.message });
        }
    };

        // NEW: Handle service item deletion
    deleteServiceItem = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id);
        try {
            await billingService.deleteServiceItem(id);
            res.status(200).json({ message: 'Service item deleted successfully.' });
        } catch (error: any) {
            res.status(500).json({ message: 'Error deleting service item', error: error.message });
        }
    };

    // --- Admin: HMO Providers ---
     createHmoProvider = async (req: Request, res: Response): Promise<void> => {
        try {
            const newHmo = await billingService.createHmoProvider(req.body);
            res.status(201).json(newHmo);
        } catch (error: any) {
            res.status(500).json({ message: 'Error creating HMO provider', error: error.message });
        }
    };

    updateHmoProvider = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id);
        try {
            await billingService.updateHmoProvider(id, req.body);
            res.status(200).json({ message: 'HMO provider updated successfully.' });
        } catch (error: any) {
            res.status(500).json({ message: 'Error updating HMO provider', error: error.message });
        }
    };

        deleteHmoProvider = async (req: Request, res: Response): Promise<void> => {
        const id = parseInt(req.params.id);
        try {
            await billingService.deleteHmoProvider(id);
            res.status(200).json({ message: 'HMO provider deleted successfully.' });
        } catch (error: any) {
            res.status(500).json({ message: 'Error deleting HMO provider', error: error.message });
        }
    };
}

export const billingController = new BillingController();
