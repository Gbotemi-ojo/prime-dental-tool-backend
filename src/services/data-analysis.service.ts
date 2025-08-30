import { db } from '../config/database';
import { patients, dentalRecords, dailyVisits, users, inventoryItems, inventoryTransactions, hmoProviders, serviceItems } from '../../db/schema';
import { sql, and, eq, gte, lte, desc, isNull, not, between, count } from 'drizzle-orm';

export class DataAnalysisService {

    // Helper to get the start and end of the current day
    private getTodayDateRange() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { todayStart, todayEnd };
    }
    
    // Helper to get date ranges for "this month" and "last 30 days"
    private getMonthDateRanges() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thirtyDaysAgo = new Date(new Date().setDate(now.getDate() - 30));
        return { monthStart, thirtyDaysAgo };
    }
    
    /**
     * Fetches key performance indicators for the main dashboard view.
     */
    async getKeyMetrics() {
        const { todayStart, todayEnd } = this.getTodayDateRange();
        const { monthStart } = this.getMonthDateRanges();

        // --- FIX: Corrected "Today's Visits" Calculation ---
        // 1. Count returning patient visits from the daily_visits table.
        const [returningVisitsResult] = await db
            .select({ count: count() })
            .from(dailyVisits)
            .where(between(dailyVisits.checkInTime, todayStart, todayEnd));
        
        // 2. Count new patient registrations from the patients table.
        const [newPatientsTodayResult] = await db
            .select({ count: count() })
            .from(patients)
            .where(between(patients.createdAt, todayStart, todayEnd));

        // 3. Sum them to get the total visits for today.
        const todaysVisits = (returningVisitsResult?.count || 0) + (newPatientsTodayResult?.count || 0);

        const [newPatientsThisMonthResult] = await db
            .select({ count: count() })
            .from(patients)
            .where(gte(patients.createdAt, monthStart));

        const [totalOutstandingResult] = await db
            .select({ total: sql<string>`SUM(${patients.outstanding})` })
            .from(patients);

        const [lowStockItemsResult] = await db
            .select({ count: count() })
            .from(inventoryItems)
            .where(sql`${inventoryItems.currentStock} <= ${inventoryItems.reorderLevel}`);
            
        const [upcomingAppointmentsResult] = await db
            .select({ count: count() })
            .from(patients)
            .where(and(
                gte(patients.nextAppointmentDate, todayStart),
                not(isNull(patients.nextAppointmentDate))
            ));

        return {
            todaysVisits: todaysVisits,
            newPatientsThisMonth: newPatientsThisMonthResult?.count || 0,
            totalOutstanding: totalOutstandingResult?.total || '0.00',
            lowStockItems: lowStockItemsResult?.count || 0,
            upcomingAppointments: upcomingAppointmentsResult?.count || 0,
        };
    }

    /**
     * Aggregates and counts the most common provisional diagnoses.
     */
    async getCommonDiagnoses() {
        const records = await db
            .select({ provisionalDiagnosis: dentalRecords.provisionalDiagnosis })
            .from(dentalRecords)
            .where(not(isNull(dentalRecords.provisionalDiagnosis)));

        const diagnosisCounts = records.reduce((acc, record) => {
            // The diagnosis is stored as a JSON array of strings
            const diagnoses = record.provisionalDiagnosis as string[] | null;
            if (Array.isArray(diagnoses)) {
                diagnoses.forEach(diagnosis => {
                    const trimmedDiagnosis = diagnosis.trim();
                    if(trimmedDiagnosis) {
                        acc[trimmedDiagnosis] = (acc[trimmedDiagnosis] || 0) + 1;
                    }
                });
            }
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(diagnosisCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10); // Return top 10
    }
    
    /**
     * Analyzes the distribution of performed treatments.
     */
    async getTreatmentDistribution() {
        // This is a placeholder as `treatmentDone` is a text field. 
        // A more complex NLP or structured data approach would be needed for full analysis.
        // For now, we'll count records with non-empty treatment fields.
        const [result] = await db
            .select({ count: count() })
            .from(dentalRecords)
            .where(not(isNull(dentalRecords.treatmentDone)));
        
        return [{ name: 'Procedures Performed', value: result?.count || 0 }];
    }

    /**
     * Provides a breakdown of patient demographics (e.g., gender).
     */
    async getPatientDemographics() {
        const genderData = await db
            .select({ gender: patients.sex, count: count() })
            .from(patients)
            .groupBy(patients.sex);

        return {
            gender: genderData.map(g => ({ name: g.gender, value: g.count }))
        };
    }

    /**
     * Calculates patient flow over the last 30 days.
     */
    async getPatientFlow() {
        const { thirtyDaysAgo } = this.getMonthDateRanges();
        
        const visits = await db
            .select({ date: sql<string>`DATE(${dailyVisits.checkInTime})`, count: count() })
            .from(dailyVisits)
            .where(gte(dailyVisits.checkInTime, thirtyDaysAgo))
            .groupBy(sql`DATE(${dailyVisits.checkInTime})`)
            .orderBy(sql`DATE(${dailyVisits.checkInTime})`);
            
        const newPatients = await db
            .select({ date: sql<string>`DATE(${patients.createdAt})`, count: count() })
            .from(patients)
            .where(gte(patients.createdAt, thirtyDaysAgo))
            .groupBy(sql`DATE(${patients.createdAt})`)
            .orderBy(sql`DATE(${patients.createdAt})`);

        const flowMap = new Map<string, number>();

        visits.forEach(v => flowMap.set(v.date, (flowMap.get(v.date) || 0) + v.count));
        newPatients.forEach(p => flowMap.set(p.date, (flowMap.get(p.date) || 0) + p.count));

        return Array.from(flowMap.entries())
            .map(([date, visits]) => ({ date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), visits }))
            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    /**
     * Shows the distribution of patients by HMO provider.
     */
    async getHmoDistribution() {
        const patientHmos = await db.select({ hmo: patients.hmo }).from(patients).where(not(isNull(patients.hmo)));
        
        const hmoCounts = patientHmos.reduce((acc, p) => {
            const hmoName = (p.hmo as { name?: string })?.name;
            if (hmoName) {
                acc[hmoName] = (acc[hmoName] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(hmoCounts).map(([name, value]) => ({ name, value }));
    }

    /**
     * Ranks doctor performance based on the number of patient encounters.
     */
    async getDoctorPerformance() {
        const performanceData = await db
            .select({ 
                doctorName: users.username, 
                patientCount: count(dentalRecords.patientId) 
            })
            .from(dentalRecords)
            .leftJoin(users, eq(dentalRecords.doctorId, users.id))
            .where(not(isNull(dentalRecords.doctorId)))
            .groupBy(users.id, users.username)
            .orderBy(desc(count(dentalRecords.patientId)));

        return performanceData;
    }

    /**
     * Identifies the most frequently used inventory items.
     */
    async getTopInventoryUsage() {
        const usageData = await db
            .select({
                name: inventoryItems.name,
                value: sql<number>`SUM(${inventoryTransactions.quantity})`
            })
            .from(inventoryTransactions)
            .leftJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
            .where(eq(inventoryTransactions.transactionType, 'stock_out'))
            .groupBy(inventoryItems.id, inventoryItems.name)
            .orderBy(desc(sql`SUM(${inventoryTransactions.quantity})`))
            .limit(10);
            
        return usageData;
    }
}

export const dataAnalysisService = new DataAnalysisService();

