import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';

export class SettingsController {

    /**
     * Handles the request to get dashboard settings.
     * @param {Request} req - The Express request object.
     * @param {Response} res - The Express response object.
     */
    getDashboardSettings = async (req: Request, res: Response): Promise<void> => {
        try {
            const config = await settingsService.getSettings();
            res.status(200).json(config);
        } catch (error: any) {
            res.status(500).json({ message: 'Error fetching settings', error: error.message });
        }
    };

    /**
     * Handles the request to update dashboard settings.
     * @param {Request} req - The Express request object containing the new config in the body.
     * @param {Response} res - The Express response object.
     */
    updateDashboardSettings = async (req: Request, res: Response): Promise<void> => {
        try {
            const newConfig = req.body;
            if (!newConfig || Object.keys(newConfig).length === 0) {
                res.status(400).json({ message: 'Bad Request: No settings configuration provided.' });
                return;
            }

            const updatedConfig = await settingsService.updateSettings(newConfig);
            res.status(200).json(updatedConfig);
        } catch (error: any) {
            res.status(500).json({ message: 'Error updating settings', error: error.message });
        }
    };
}

export const settingsController = new SettingsController();