// src/services/inventory.service.ts
import { eq, ne, and, asc, desc } from 'drizzle-orm';
import { db } from '../config/database';
import { inventoryItems, inventoryTransactions, users } from '../../db/schema';

export class InventoryService {
  constructor() {}

  async getAllItems() {
    return await db.select().from(inventoryItems);
  }

  async getItemById(itemId: number) {
    return await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  }

  async addItem(itemData: {
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    description?: string;
    unitOfMeasure?: string;
  }) {
    const { name, category, quantity, unitPrice, description, unitOfMeasure } = itemData;

    const [existingItem] = await db.select().from(inventoryItems)
      .where(eq(inventoryItems.name, name))
      .limit(1);

    if (existingItem) {
      return { success: false, message: 'An inventory item with this name already exists.' };
    }

    const insertResult = await db.insert(inventoryItems).values({
      name: name,
      category: category,
      unitPrice: unitPrice.toString(), // Ensure string if schema expects string
      currentStock: quantity,
      description: description || null,
      unitOfMeasure: unitOfMeasure || 'pcs',
    });

    const newId = (insertResult as any).insertId;
    if (!newId) {
      console.error('Failed to retrieve insertId from the insert operation result:', insertResult);
      const [refetchedItemByName] = await db.select().from(inventoryItems)
        .where(eq(inventoryItems.name, name))
        .orderBy(desc(inventoryItems.id))
        .limit(1);
      if (refetchedItemByName) {
        return { success: true, item: refetchedItemByName };
      }
      return { success: false, message: 'Item added but could not be retrieved.' };
    }

    const [newItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, newId)).limit(1);
    return { success: true, item: newItem };
  }

  async updateItem(itemId: number, updateData: {
    name?: string;
    description?: string;
    unitOfMeasure?: string;
    reorderLevel?: number;
    costPerUnit?: string;
    supplier?: string;
    category?: string;
  }) {
    const [existingItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!existingItem) {
      return { success: false, message: 'Inventory item not found.' };
    }

    if (updateData.name && updateData.name !== existingItem.name) {
      const [nameConflict] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.name, updateData.name), ne(inventoryItems.id, itemId)))
        .limit(1);
      if (nameConflict) {
        return { success: false, message: 'An inventory item with this name already exists.' };
      }
    }

    await db.update(inventoryItems).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, itemId));

    return { success: true, message: 'Inventory item updated successfully.' };
  }

  async deleteItem(itemId: number) {
    const [itemExists] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!itemExists) {
      return { success: false, message: 'Inventory item not found.' };
    }

    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
    return { success: true, message: 'Inventory item and associated transactions deleted successfully.' };
  }

  async recordTransaction(transactionData: {
    itemId: number;
    transactionType: 'stock_in' | 'stock_out' | 'adjustment';
    quantity: number;
    notes?: string;
    userId: number; // The user making the transaction
  }) {
    const { itemId, transactionType, quantity, notes, userId } = transactionData;

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
    if (!item) {
      return { success: false, message: 'Inventory item not found.' };
    }

    let newStock = item.currentStock;
    let finalTransactionQuantity = quantity;

    if (transactionType === 'stock_in') {
      newStock += quantity;
    } else if (transactionType === 'stock_out') {
      if (newStock < quantity) {
        return { success: false, message: `Insufficient stock. Only ${newStock} ${item.unitOfMeasure} of ${item.name} available.` };
      }
      newStock -= quantity;
      finalTransactionQuantity = -quantity;
    } else if (transactionType === 'adjustment') {
      newStock += quantity;
      finalTransactionQuantity = quantity;
    }

    await db.update(inventoryItems).set({
      currentStock: newStock,
      lastRestockedAt: transactionType === 'stock_in' ? new Date() : item.lastRestockedAt,
      updatedAt: new Date(),
    }).where(eq(inventoryItems.id, itemId));

    const [inserted] = await db.insert(inventoryTransactions).values({
      itemId,
      userId,
      transactionType,
      quantity: finalTransactionQuantity,
      notes,
      transactionDate: new Date(),
    });

    const newTransactionId = (inserted as any).insertId;
    const [newTransaction] = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.id, newTransactionId)).limit(1);

    return { success: true, transaction: newTransaction, newStockLevel: newStock };
  }

  async getTransactionsByItemId(itemId: number) {
    return await db.select({
      id: inventoryTransactions.id,
      itemId: inventoryTransactions.itemId,
      userId: inventoryTransactions.userId,
      username: users.username,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
      .from(inventoryTransactions)
      .leftJoin(users, eq(inventoryTransactions.userId, users.id))
      .where(eq(inventoryTransactions.itemId, itemId))
      .orderBy(asc(inventoryTransactions.transactionDate));
  }

  async getAllTransactions() {
    return await db.select({
      id: inventoryTransactions.id,
      itemId: inventoryTransactions.itemId,
      itemName: inventoryItems.name,
      itemUnit: inventoryItems.unitOfMeasure,
      userId: inventoryTransactions.userId,
      username: users.username,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
      .from(inventoryTransactions)
      .leftJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .leftJoin(users, eq(inventoryTransactions.userId, users.id))
      .orderBy(desc(inventoryTransactions.transactionDate));
  }

  async getItemStockStatus(itemId: number) {
    const [item] = await db.select({
      id: inventoryItems.id,
      name: inventoryItems.name,
      unitOfMeasure: inventoryItems.unitOfMeasure,
      currentStock: inventoryItems.currentStock,
      reorderLevel: inventoryItems.reorderLevel,
      costPerUnit: inventoryItems.costPerUnit,
      supplier: inventoryItems.supplier,
    }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);

    if (!item) {
      return null;
    }

    const status = item.currentStock <= (item.reorderLevel || 0) ? 'Reorder Needed' : 'In Stock';
    return {
      itemId: item.id,
      itemName: item.name,
      unitOfMeasure: item.unitOfMeasure,
      currentStock: item.currentStock,
      reorderLevel: item.reorderLevel,
      status: status
    };
  }
}

export const inventoryService = new InventoryService();