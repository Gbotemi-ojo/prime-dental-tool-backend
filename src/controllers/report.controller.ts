// src/controllers/report.controller.ts
import { Request, Response } from 'express';
import { reportService } from '../services/report.service';

interface AuthenticatedRequest extends Request {
    user?: { userId: number; role: string; };
}

export class ReportController {
    
    submitReport = async (req: AuthenticatedRequest, res: Response) => {
        try {
            const reportData = {
                ...req.body,
                date: new Date(req.body.date),
                submittedBy: req.user?.userId
            };
            
            const result = await reportService.createReport(reportData);
            res.status(201).json(result);
        } catch (error: any) {
            console.error('Error creating daily report:', error);
            res.status(500).json({ error: 'Failed to submit report.' });
        }
    }

    getReports = async (req: Request, res: Response) => {
        try {
            const { date } = req.query;
            const reports = await reportService.getReports(date as string);
            res.json(reports);
        } catch (error: any) {
            console.error('Error fetching reports:', error);
            res.status(500).json({ error: 'Failed to fetch reports.' });
        }
    }
}

export const reportController = new ReportController();
