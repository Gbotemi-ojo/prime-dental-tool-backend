// src/services/report.service.ts
import { desc, eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database';
import { dailyReports } from '../../db/schema';
import { InferInsertModel } from 'drizzle-orm';

type NewReportData = InferInsertModel<typeof dailyReports>;

export class ReportService {
    
    async createReport(data: NewReportData) {
        await db.insert(dailyReports).values(data);
        return { success: true, message: 'Daily report submitted successfully.' };
    }

    async getReports(date?: string) {
        // If date provided, filter by that date, else get recent
        let query = db.select().from(dailyReports).orderBy(desc(dailyReports.date));
        
        if (date) {
            // Assuming date string YYYY-MM-DD
            // Using SQL raw for date comparison to be safe with timestamps
            const reports = await db.select()
                .from(dailyReports)
                .where(sql`DATE(${dailyReports.date}) = ${date}`)
                .orderBy(desc(dailyReports.createdAt));
            return reports;
        }

        return await query.limit(30); // Last 30 reports by default
    }
}

export const reportService = new ReportService();
