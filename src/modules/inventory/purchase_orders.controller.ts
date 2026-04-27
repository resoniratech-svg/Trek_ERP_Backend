import { Request, Response } from "express";
import { pool } from "../../config/db";
import { success, error } from "../../utils/response";

export const getPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT po.*, p.name as product_name 
      FROM purchase_orders po 
      LEFT JOIN products p ON po.product_id = p.id
      ORDER BY po.created_at DESC
    `);
    
    const formatted = result.rows.map((r: any) => ({
      id: r.id,
      supplier: r.supplier,
      date: r.date,
      status: r.status,
      totalAmount: r.total_amount,
      productId: r.product_id,
      productName: r.product_name,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      notes: r.notes
    }));

    return success(res, "Purchase orders fetched", formatted);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  const { supplier, date, status, totalAmount, productId, quantity, unitPrice, notes } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO purchase_orders 
        (supplier, date, status, total_amount, product_id, quantity, unit_price, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [supplier, date, status, totalAmount, productId, quantity, unitPrice, notes]
    );

    // If status is received, update product stock
    if (status === 'Received' && productId) {
      await pool.query("UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2", [quantity, productId]);
      // Log movement
      await pool.query(
        `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, reference_id, notes, user_id)
         VALUES ($1, 'IN', $2, 'PURCHASE_ORDER', $3, 'Received stock from PO', $4)`,
        [productId, quantity, result.rows[0].id, (req as any).user.id]
      );
    }

    return success(res, "Purchase order created", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const updatePurchaseOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const poResult = await pool.query("SELECT * FROM purchase_orders WHERE id = $1", [id]);
    if (poResult.rows.length === 0) return error(res, "Purchase order not found", 404);
    
    const po = poResult.rows[0];

    // If status changes to Received and it wasn't before, increment stock
    if (status === 'Received' && po.status !== 'Received' && po.product_id) {
      await pool.query("UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2", [po.quantity, po.product_id]);
      await pool.query(
        `INSERT INTO inventory_movements (product_id, type, quantity, reference_type, reference_id, notes, user_id)
         VALUES ($1, 'IN', $2, 'PURCHASE_ORDER', $3, 'Received stock from PO status update', $4)`,
        [po.product_id, po.quantity, id, (req as any).user.id]
      );
    }

    const result = await pool.query("UPDATE purchase_orders SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
    return success(res, "Purchase order status updated", result.rows[0]);
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};

export const deletePurchaseOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM purchase_orders WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return error(res, "Purchase order not found", 404);
    return success(res, "Purchase order deleted successfully");
  } catch (err: any) {
    return error(res, err.message, 500);
  }
};
