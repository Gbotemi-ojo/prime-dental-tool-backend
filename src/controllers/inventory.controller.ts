// src/controllers/inventory.controller.ts
import { Request, Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventory.service';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export class InventoryController {
  constructor() {}

  getAllItems = async (req: Request, res: Response): Promise<void> => {
    try {
      const items = await inventoryService.getAllItems();
      res.json(items);
    } catch (error) {
      console.error('Error in getAllItems controller:', error);
      res.status(500).json({ error: 'Server error fetching inventory items.' });
    }
  }

  getItemById = async (req: Request, res: Response): Promise<void> => {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID.' });
      return;
    }

    try {
      const [item] = await inventoryService.getItemById(itemId);
      if (!item) {
        res.status(404).json({ error: 'Inventory item not found.' });
        return;
      }
      res.json(item);
    } catch (error) {
      console.error('Error in getItemById controller:', error);
      res.status(500).json({ error: 'Server error fetching inventory item.' });
    }
  }

  addItem = async (req: Request, res: Response): Promise<void> => {
    const { name, category, quantity, unitPrice, description, unitOfMeasure } = req.body;

    if (!name || !category || quantity === undefined || unitPrice === undefined) {
      res.status(400).json({ error: 'Name, Category, Quantity, and Unit Price are required.' });
      return;
    }

    const parsedQuantity = parseInt(quantity);
    const parsedUnitPrice = parseFloat(unitPrice);

    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      res.status(400).json({ error: 'Quantity must be a non-negative number.' });
      return;
    }
    if (isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
      res.status(400).json({ error: 'Unit Price must be a non-negative number.' });
      return;
    }

    try {
      const result = await inventoryService.addItem({
        name,
        category,
        quantity: parsedQuantity,
        unitPrice: parsedUnitPrice,
        description,
        unitOfMeasure
      });

      if (!result.success) {
        res.status(409).json({ error: result.message });
        return;
      }
      res.status(201).json({ message: 'Inventory item added successfully!', item: result.item });

    } catch (error: any) {
      console.error('Error in addItem controller:', error);
      // Catch specific Drizzle/DB errors here if needed, or handle in service layer
      if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('UNIQUE constraint failed'))) {
        res.status(409).json({ error: 'An inventory item with this name already exists.' });
        return;
      }
      res.status(500).json({ error: 'Server error adding inventory item.' });
    }
  }

  updateItem = async (req: Request, res: Response): Promise<void> => {
    const itemId = parseInt(req.params.id);
    const { name, description, unitOfMeasure, reorderLevel, costPerUnit, supplier, category } = req.body;

    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID.' });
      return;
    }
    if (!name || !unitOfMeasure || !category) {
      res.status(400).json({ error: 'Item name, category, and unit of measure are required for update.' });
      return;
    }

    try {
      const result = await inventoryService.updateItem(itemId, {
        name, description, unitOfMeasure, reorderLevel, costPerUnit, supplier, category
      });

      if (!result.success) {
        res.status(result.message.includes('not found') ? 404 : 409).json({ error: result.message });
        return;
      }
      res.json({ message: 'Inventory item updated successfully.' });

    } catch (error: any) {
      console.error('Error in updateItem controller:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'An inventory item with this name already exists.' });
        return;
      }
      res.status(500).json({ error: 'Server error updating inventory item.' });
    }
  }

  deleteItem = async (req: Request, res: Response): Promise<void> => {
    const itemId = parseInt(req.params.id);

    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID.' });
      return;
    }

    try {
      const result = await inventoryService.deleteItem(itemId);
      if (!result.success) {
        res.status(404).json({ error: result.message });
        return;
      }
      res.json({ message: 'Inventory item and associated transactions deleted successfully.' });

    } catch (error) {
      console.error('Error in deleteItem controller:', error);
      res.status(500).json({ error: 'Server error deleting inventory item.' });
    }
  }

  recordTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { itemId, transactionType, quantity, notes } = req.body;
    const userId = req.user!.userId;

    if (!itemId || !transactionType || quantity === undefined) {
      res.status(400).json({ error: 'Item ID, transaction type, and quantity are required.' });
      return;
    }
    if (!['stock_in', 'stock_out', 'adjustment'].includes(transactionType)) {
      res.status(400).json({ error: 'Invalid transaction type. Must be "stock_in", "stock_out", or "adjustment".' });
      return;
    }
    if (transactionType !== 'adjustment' && quantity <= 0) {
      res.status(400).json({ error: `Quantity must be positive for '${transactionType}' transaction.` });
      return;
    }

    try {
      const result = await inventoryService.recordTransaction({
        itemId, transactionType, quantity, notes, userId
      });

      if (!result.success) {
        const statusCode = result.message && result.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({ error: result.message });
        return;
      }
      res.status(201).json({
        message: 'Inventory transaction recorded successfully.',
        transaction: result.transaction,
        newStockLevel: result.newStockLevel
      });

    } catch (error) {
      console.error('Error in recordTransaction controller:', error);
      res.status(500).json({ error: 'Server error recording inventory transaction.' });
    }
  }

  getTransactionsByItemId = async (req: Request, res: Response): Promise<void> => {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID.' });
      return;
    }

    try {
      const transactions = await inventoryService.getTransactionsByItemId(itemId);
      res.json(transactions);
    } catch (error) {
      console.error('Error in getTransactionsByItemId controller:', error);
      res.status(500).json({ error: 'Server error fetching item transactions.' });
    }
  }

  getAllTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
      const transactions = await inventoryService.getAllTransactions();
      res.json(transactions);
    } catch (error) {
      console.error('Error in getAllTransactions controller:', error);
      res.status(500).json({ error: 'Server error fetching all inventory transactions.' });
    }
  }

  getItemStockStatus = async (req: Request, res: Response): Promise<void> => {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID.' });
      return;
    }

    try {
      const stockStatus = await inventoryService.getItemStockStatus(itemId);
      if (!stockStatus) {
        res.status(404).json({ error: 'Inventory item not found.' });
        return;
      }
      res.json(stockStatus);
    } catch (error) {
      console.error('Error in getItemStockStatus controller:', error);
      res.status(500).json({ error: 'Server error fetching current stock level.' });
    }
  }
}

export const inventoryController = new InventoryController();
