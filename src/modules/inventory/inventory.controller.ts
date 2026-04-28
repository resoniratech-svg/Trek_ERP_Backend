import { Request, Response } from "express";
import { pool } from "../../config/db";
import { success, error } from "../../utils/response";
import { AccessGuard } from "../../services/accessGuard.service";

export const deleteSalesOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Check if sales order exists
    const soResult = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [id]);
    if (soResult.rows.length === 0) return error(res, "Sales order not found", 404);

    const so = soResult.rows[0];

    // If the order was fulfilled and stock was decremented, restore it
    const wasFulfilled = ['Shipped', 'Delivered', 'Fulfilled'].includes(so.status);
    if (wasFulfilled && so.product_id && so.quantity) {
      await pool.query("UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2", [so.quantity, so.product_id]);
    }

    // Delete related inventory movements
    await pool.query("DELETE FROM inventory_movements WHERE reference_type = 'SALES_ORDER' AND reference_id::text = $1::text", [id]);
    // Delete the sales order
    await pool.query("DELETE FROM sales_orders WHERE id = $1", [id]);
    return success(res, "Sales order deleted successfully");
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    const formatted = result.rows.map((p: any) => ({
      ...p,
      purchasePrice: Number(p.purchase_price) || 0,
      sellingPrice: Number(p.sales_price) || 0,
      stockQuantity: Number(p.stock_quantity) || 0,
      minStock: Number(p.reorder_level) || 0,
      division: p.division
    }));
    return success(res, "Products fetched", formatted);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const getProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (result.rows.length === 0) return error(res, "Product not found", 404);
    
    // Map db columns to frontend expected camelCase
    const p = result.rows[0];
    const formatted = {
      ...p,
      purchasePrice: Number(p.purchase_price) || 0,
      sellingPrice: Number(p.sales_price) || 0,
      stockQuantity: Number(p.stock_quantity) || 0,
      minStock: Number(p.reorder_level) || 0,
      division: p.division
    };
    return success(res, "Product fetched", formatted);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const createProduct = async (req: Request, res: Response) => {
  const { name, purchasePrice, sellingPrice, stockQuantity, minStock, category, description, division } = req.body;
  try {
    const sku = "PRD-" + Date.now().toString().slice(-6); // generate a simple SKU
    const result = await pool.query(
      `INSERT INTO products 
        (sku, name, category, unit, description, stock_quantity, reorder_level, purchase_price, sales_price, division) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [sku, name, category, 'pcs', description, stockQuantity || 0, minStock || 0, purchasePrice || 0, sellingPrice || 0, division || 'SERVICE']
    );

    // After creating a product with initial stock > 0, make an inventory movement
    if (stockQuantity > 0) {
      await pool.query(
        `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, notes, user_id)
         VALUES ($1, 'IN', $2, 'INITIAL_STOCK', 'Initial setup', $3)`,
        [result.rows[0].id, stockQuantity, (req as any).user.id]
      );
    }

    return success(res, "Product created fully", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, purchasePrice, sellingPrice, stockQuantity, minStock, category, description, division } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET 
         name = $1, category = $2, description = $3, reorder_level = $4, purchase_price = $5, sales_price = $6, division = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, category, description, minStock || 0, purchasePrice || 0, sellingPrice || 0, division || 'SERVICE', id]
    );
    if (result.rows.length === 0) return error(res, "Product not found", 404);
    return success(res, "Product updated", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Delete movements first or cascade if defined. Assuming we need to delete movements manually just in case
    await pool.query("DELETE FROM inventory_movements WHERE product_id = $1", [id]);
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return error(res, "Product not found", 404);
    return success(res, "Product deleted successfully");
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const getMovements = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user.role;
    const userId = (req as any).user.id;
    let extraWhere = "";
    const params: any[] = [];

    if (userRole === "PROJECT_MANAGER") {
      extraWhere = "WHERE im.reference_type = 'SALES_ORDER' AND im.reference_id::text IN (SELECT id::text FROM sales_orders WHERE manager_id = $1)";
      params.push(userId);
    } else if (userRole === "CLIENT") {
      extraWhere = "WHERE im.reference_type = 'SALES_ORDER' AND im.reference_id::text IN (SELECT id::text FROM sales_orders WHERE client_id = $1)";
      params.push((req as any).user.client_id || userId);
    }

    const result = await pool.query(`
      SELECT im.*, p.name as product_name, u.name as user_name
      FROM inventory_movements im
      LEFT JOIN products p ON im.product_id = p.id
      LEFT JOIN users u ON im.user_id = u.id
      ${extraWhere}
      ORDER BY im.created_at DESC
    `, params);

    const movements = result.rows.map(row => ({
      ...row,
      productName: row.product_name,
      userName: row.user_name || 'System',
      date: row.created_at
    }));

    return success(res, "Movements fetched", movements);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const getSalesOrders = async (req: Request, res: Response) => {
  try {
    const params: any[] = [];
    const scopedWhere = AccessGuard.getScopedWhere((req as any).user, params, "so");

    const result = await pool.query(`
      SELECT 
        so.*, 
        c.name as client_name,
        p.name as product_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      LEFT JOIN products p ON so.product_id = p.id
      ${scopedWhere}
      ORDER BY so.created_at DESC
    `, params);
    
    // Map snake_case to camelCase for frontend consistency
    const orders = result.rows.map(row => ({
      ...row,
      productName: row.product_name,
      totalAmount: row.total_amount,
      orderNumber: row.order_number
    }));

    return success(res, "Sales orders fetched", orders);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const getInventoryStats = async (req: Request, res: Response) => {
    try {
        const revResult = await pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM sales_orders WHERE status IN ('Shipped', 'Delivered', 'Fulfilled')`);
        const costResult = await pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total_costs FROM purchase_orders WHERE status = 'Received'`);

        const totalRevenue = Number(revResult.rows[0].total_revenue);
        const totalCosts = Number(costResult.rows[0].total_costs);
        const totalProfit = totalRevenue - totalCosts;
        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        return success(res, "Inventory stats fetched", {
            totalRevenue,
            totalCosts,
            totalProfit,
            profitMargin
        });
    } catch (err: any) {
        return error(res, err.message, 500);
    }
};

export const createSalesOrder = async (req: Request, res: Response) => {
  const { client, client_id, date, status, totalAmount, productId, quantity, unitPrice } = req.body;
  try {
    const managerId = (req as any).user?.id; // Assign creator as manager directly
    const division = (req as any).user?.division; // Capture user division for scoping
    const orderNumber = `SO-${Date.now()}`; // Dynamically generate required NOT NULL property
    const result = await pool.query(
      `INSERT INTO sales_orders 
        (order_number, client, client_id, manager_id, division, date, status, total_amount, product_id, quantity, unit_price) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [orderNumber, client, client_id || null, managerId, division, date, status, totalAmount, productId, quantity, unitPrice]
    );

    // If status is Shipped or Delivered, reduce product stock
    if ((status === 'Shipped' || status === 'Delivered') && productId) {
      await pool.query("UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2", [quantity, productId]);
      // Log movement OUT
      await pool.query(
        `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, reference_id, notes, user_id)
         VALUES ($1, 'OUT', $2, 'SALES_ORDER', $3, 'Sold stock via Sales Order', $4)`,
        [productId, quantity, result.rows[0].id, managerId]
      );
    }

    return success(res, "Sales order created", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const updateSalesOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const soResult = await pool.query("SELECT * FROM sales_orders WHERE id = $1", [id]);
    if (soResult.rows.length === 0) return error(res, "Sales order not found", 404);
    
    const so = soResult.rows[0];

    // If status changes to Shipped/Delivered/Fulfilled and it wasn't before, decrement stock
    const isNowFulfilled = ['Shipped', 'Delivered', 'Fulfilled'].includes(status);
    const wasFulfilled = ['Shipped', 'Delivered', 'Fulfilled'].includes(so.status);

    if (isNowFulfilled && !wasFulfilled && so.product_id) {
      await pool.query("UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2", [so.quantity, so.product_id]);
      await pool.query(
        `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, reference_id, notes)
         VALUES ($1, 'OUT', $2, 'SALES_ORDER', $3, 'Sold stock from SO status update')`,
        [so.product_id, so.quantity, id]
      );
    }

    const result = await pool.query("UPDATE sales_orders SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
    return success(res, "Sales order status updated", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const reorderProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity } = req.body;
  try {
    if (!quantity || quantity <= 0) {
      return error(res, "Quantity must be a positive number", 400);
    }

    // Check if product exists
    const productRes = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (productRes.rows.length === 0) return error(res, "Product not found", 404);

    // Increase stock
    const updated = await pool.query(
      "UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [quantity, id]
    );

    // Log inventory movement
    await pool.query(
      `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, notes, user_id)
       VALUES ($1, 'IN', $2, 'REORDER', $3, $4)`,
      [id, quantity, `Reorder: +${quantity} units`, (req as any).user.id]
    );

    const p = updated.rows[0];
    return success(res, "Product restocked successfully", {
      ...p,
      purchasePrice: Number(p.purchase_price) || 0,
      sellingPrice: Number(p.sales_price) || 0,
      stockQuantity: Number(p.stock_quantity) || 0,
      minStock: Number(p.reorder_level) || 0,
      division: p.division
    });
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};
