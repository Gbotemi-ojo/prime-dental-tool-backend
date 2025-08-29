// src/routes/inventory.routes.ts
import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller'; // Import the controller
import { authenticateToken, authorizeRoles } from '../middleware/auth'; // Your authentication/authorization middleware

const router = Router();

// --- Inventory Items ---

// GET /api/inventory/items - Get all inventory items
router.get('/items', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.getAllItems);

// GET /api/inventory/items/:id - Get a single inventory item by ID
router.get('/items/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.getItemById);

// POST /api/inventory/items - Add a new inventory item
router.post('/items', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.addItem);

// PUT /api/inventory/items/:id - Update an inventory item by ID
router.put('/items/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.updateItem);

// DELETE /api/inventory/items/:id - Delete an inventory item by ID
router.delete('/items/:id', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.deleteItem);

// GET /api/inventory/items/:id/current-stock - Get current stock level and status for an item
router.get('/items/:id/current-stock', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.getItemStockStatus);

// --- Inventory Transactions ---

// POST /api/inventory/transactions - Record an inventory transaction (stock_in, stock_out, adjustment)
router.post('/transactions', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.recordTransaction);

// GET /api/inventory/transactions - Get all inventory transactions
router.get('/transactions', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.getAllTransactions);

// GET /api/inventory/items/:itemId/transactions - Get transactions for a specific inventory item
router.get('/items/:itemId/transactions', authenticateToken, authorizeRoles(['owner', 'staff', 'nurse', 'doctor']), inventoryController.getTransactionsByItemId);

export default router;