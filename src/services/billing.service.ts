// src/services/billing.service.ts
import { db } from '../config/database';
import { serviceItems, hmoProviders } from '../../db/schema';
import { eq, asc } from 'drizzle-orm'; // Import asc for ordering
import { InferInsertModel } from 'drizzle-orm';

type ServiceItemInsert = InferInsertModel<typeof serviceItems>;
type HmoProviderInsert = InferInsertModel<typeof hmoProviders>;

export class BillingService {
    async getBillingOptions() {
        // Order the results alphabetically
        const services = await db.select().from(serviceItems).orderBy(asc(serviceItems.name));
        const hmos = await db.select().from(hmoProviders).orderBy(asc(hmoProviders.name));
        return { services, hmos };
    }

    // --- Service Item Management ---
    async createServiceItem(itemData: Omit<ServiceItemInsert, 'id'>) {
        const [newItem] = await db.insert(serviceItems).values(itemData);
        return { id: newItem.insertId, ...itemData };
    }
    
    async updateServiceItem(id: number, itemData: Partial<ServiceItemInsert>) {
        await db.update(serviceItems).set(itemData).where(eq(serviceItems.id, id));
        return { success: true };
    }
    
    // NEW: Delete a service item
    async deleteServiceItem(id: number) {
        await db.delete(serviceItems).where(eq(serviceItems.id, id));
        return { success: true };
    }

    // --- HMO Provider Management ---
    async createHmoProvider(hmoData: Omit<HmoProviderInsert, 'id'>) {
        const [newHmo] = await db.insert(hmoProviders).values(hmoData);
        return { id: newHmo.insertId, ...hmoData };
    }

    async updateHmoProvider(id: number, hmoData: Partial<HmoProviderInsert>) {
        await db.update(hmoProviders).set(hmoData).where(eq(hmoProviders.id, id));
        return { success: true };
    }

    // NEW: Delete an HMO provider
    async deleteHmoProvider(id: number) {
        await db.delete(hmoProviders).where(eq(hmoProviders.id, id));
        return { success: true };
    }
}

export const billingService = new BillingService();
