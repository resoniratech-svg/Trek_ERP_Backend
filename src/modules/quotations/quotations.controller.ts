import { Request, Response } from "express";
import pool from "../../config/db";
import { validateCreditLimit } from "../../utils/creditService";
import { createAuditLog } from "../../utils/auditService";

// Helper for standardized responses
const success = (res: Response, message: string, data?: any) => res.status(200).json({ success: true, message, data });
const error = (res: Response, message: string, code = 500) => res.status(code).json({ success: false, message });

/**
 * GET ALL QUOTATIONS
 * Role-aware: Clients only see their own
 */
export const getQuotations = async (req: any, res: Response) => {
  try {
    let query = `
      SELECT 
        q.*,
        u.name as client_name,
        u.company_name as client_company
      FROM quotations q
      LEFT JOIN users u ON q.client_id = u.id
    `;
    
    const params: any[] = [];
    
    if (req.user && req.user.role === 'CLIENT') {
      params.push(req.user.id);
      query += ` WHERE q.client_id = $1`;
    }

    query += ` ORDER BY q.created_at DESC`;

    const result = await pool.query(query, params);
    return success(res, "Quotations fetched successfully", result.rows);
  } catch (err: any) {
    console.error("GET QUOTATIONS ERROR:", err.message);
    return error(res, "Failed to fetch quotations");
  }
};

/**
 * CREATE QUOTATION
 */
export const createQuotation = async (req: any, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      qtn_number,
      client_id,
      division,
      total_amount,
      status,
      items,
      valid_until,
      terms,
      project_name,
      client_name
    } = req.body;

    let final_qtn = qtn_number;
    if (!final_qtn) {
      // Auto-generate if missing
      const divPrefix = ({
        'service': 'SER',
        'trading': 'TRD',
        'contracting': 'CON',
        'business': 'SER'
      } as any)[division?.toLowerCase() || 'contracting'] || 'CON';
      
      const formatPrefix = `${divPrefix}-QUO-`;
      const resData = await client.query(`
        SELECT qtn_number FROM quotations 
        WHERE qtn_number LIKE $1 ORDER BY qtn_number DESC LIMIT 1
      `, [`${formatPrefix}%`]);

      let nextNum = 1;
      if (resData.rows.length > 0) {
        const lastQtn = resData.rows[0].qtn_number;
        const parts = lastQtn.split('-');
        const lastPart = parts[parts.length - 1];
        const parsed = parseInt(lastPart);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      final_qtn = `${formatPrefix}${nextNum.toString().padStart(3, '0')}`;
    }

    if (!client_id) {
      return error(res, "Client ID is required", 400);
    }

    await client.query("BEGIN");

    // ✅ 1. Credit Control Check for Quotation
    let final_status = (status || 'PENDING_APPROVAL').toUpperCase();
    const creditCheck = await validateCreditLimit(client, client_id, total_amount || 0);
    
    if (creditCheck.isExceeded && final_status === 'APPROVED') {
       final_status = 'PENDING_APPROVAL';
       console.log(`CREDIT LIMIT TRIGGERED for Quotation: Status forced to PENDING_APPROVAL`);
    }

    const query = `
      INSERT INTO quotations (
        qtn_number, 
        client_id, 
        division, 
        total_amount, 
        status, 
        items, 
        valid_until, 
        terms,
        project_name,
        client_name
      ) VALUES ($1, $2, $3::division_type, $4, $5::approval_status, $6::jsonb, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      final_qtn,
      client_id || null,
      (division || 'CONTRACTING').toUpperCase().trim(),
      total_amount || 0,
      final_status,
      JSON.stringify(items || []),
      valid_until ? new Date(valid_until).toISOString() : null,
      terms || '',
      project_name || '',
      client_name || ''
    ];

    const result = await client.query(query, values);
    const quotationId = result.rows[0].id;

    // ✅ 2. Log Credit Override if applicable
    if (creditCheck.isExceeded) {
       await createAuditLog(client, {
          userId: req.user.id,
          action: "CREDIT_OVERRIDE",
          entityType: "QUOTATION",
          entityId: quotationId,
          oldValue: { status: status || 'NEW' },
          newValue: { status: 'PENDING_APPROVAL', ...creditCheck }
       });
    }

    await client.query("COMMIT");
    return success(res, "Quotation created successfully", result.rows[0]);

  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("CREATE QUOTATIONS ERROR:", err.message);
    return error(res, "Failed to create quotation: " + err.message);
  } finally {
    client.release();
  }
};

/**
 * UPDATE QUOTATION
 */
export const updateQuotation = async (req: any, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      status,
      total_amount,
      items,
      valid_until,
      terms,
      project_name,
      client_name
    } = req.body;

    await client.query("BEGIN");

    // 1. Get old record and ensure it exists
    const oldRes = await client.query(`SELECT * FROM quotations WHERE id::text = $1 OR qtn_number = $1`, [id]);
    if (!oldRes.rows.length) return error(res, "Quotation not found", 404);
    const oldRecord = oldRes.rows[0];
    const internalId = oldRecord.id;

    // ✅ Senior Level Security: Client restriction logic
    if (req.user && req.user.role === 'CLIENT') {
       if (String(oldRecord.client_id) !== String(req.user.id)) {
          await client.query("ROLLBACK");
          return error(res, "Unauthorized: Ownership mismatch", 403);
       }
       // Clients can ONLY update status
       if (!status) {
          await client.query("ROLLBACK");
          return error(res, "Invalid request: Status required for client update", 400);
       }
    }

    const oldStatus = oldRecord.status;
    let final_status = (status || oldStatus).toUpperCase();

    // 2. Perform Credit Check (Wrap in try-catch to avoid blocking the main update)
    try {
      if (final_status === 'APPROVED' && oldStatus !== 'APPROVED') {
         const creditCheck = await validateCreditLimit(client, oldRecord.client_id, total_amount || oldRecord.total_amount || 0);
         if (creditCheck.isExceeded) {
            // Do not override if the client is the one approving (client acceptance)
            if (req.user && req.user.role !== 'CLIENT') {
                final_status = 'PENDING_APPROVAL';
                console.warn(`[CREDIT] Limit exceeded for ${oldRecord.qtn_number}. Status adjusted to PENDING_APPROVAL.`);
            } else {
                console.warn(`[CREDIT] Limit exceeded for ${oldRecord.qtn_number}, but client approved it. Keeping status as APPROVED.`);
            }
         }
      }
    } catch (creditErr: any) {
      console.error(`[CREDIT_CHECK_ERROR] Non-blocking failure for ${oldRecord.qtn_number}:`, creditErr.message);
      // We continue with the update as failing the credit check logic shouldn't crash the entire API
    }

    const query = `
      UPDATE quotations 
      SET 
        status = $1::approval_status, 
        total_amount = $2, 
        items = $3::jsonb, 
        valid_until = $4, 
        terms = $5,
        project_name = COALESCE($6, project_name),
        client_name = COALESCE($7, client_name),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;

    const values = [
      final_status, 
      total_amount !== undefined ? total_amount : oldRecord.total_amount, 
      JSON.stringify(items || oldRecord.items || []), 
      valid_until !== undefined ? valid_until : oldRecord.valid_until, 
      terms !== undefined ? terms : (oldRecord.terms || ''), 
      project_name || null,
      client_name || null,
      internalId // Use the verified internal UUID
    ];

    const result = await client.query(query, values);

    // 3. Log Audit (Wrap in try-catch: Logging failure should NEVER block the business transaction)
    try {
      if (final_status !== oldStatus) {
         await createAuditLog(client, {
            userId: req.user.id,
            action: "STATUS_CHANGE",
            entityType: "QUOTATION",
            entityId: internalId,
            oldValue: { status: oldStatus },
            newValue: { status: final_status }
         });
      }
    } catch (auditErr: any) {
      console.error(`[AUDIT_LOG_ERROR] Failed to log status change for ${oldRecord.qtn_number}:`, auditErr.message);
    }

    await client.query("COMMIT");
    return success(res, "Quotation updated successfully", result.rows[0]);
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("UPDATE QUOTATION ERROR:", err.message);
    return error(res, "Failed to update quotation: " + err.message);
  } finally {
    client.release();
  }
};

/**
 * GET QUOTATION BY ID
 */
export const getQuotationById = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    let query = `
      SELECT 
        q.*,
        u.name as client_name,
        u.company_name as client_company
      FROM quotations q
      LEFT JOIN users u ON q.client_id = u.id
      WHERE q.id = $1
    `;
    
    const params = [id];

    if (req.user && req.user.role === 'CLIENT') {
      params.push(req.user.id);
      query += ` AND q.client_id = $2`;
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return error(res, "Quotation not found", 404);
    return success(res, "Quotation fetched successfully", result.rows[0]);
  } catch (err: any) {
    console.error("GET QUOTATION BY ID ERROR:", err.message);
    return error(res, "Failed to fetch quotation");
  }
};

/**
 * GET NEXT QUOTATION NUMBER
 */
export const getNextQuotationNumber = async (req: Request, res: Response) => {
  try {
    const { division } = req.params;
    const divisionStr = String(division);
    const prefixMap: Record<string, string> = {
      'service': 'SER',
      'trading': 'TRD',
      'contracting': 'CON',
      'business': 'SER'
    };
    
    const prefix = prefixMap[divisionStr.toLowerCase()] || 'CON';
    const formatPrefix = `${prefix}-QUO-`;

    // Fetch the max number for this division from the database
    const resData = await pool.query(`
      SELECT qtn_number 
      FROM quotations 
      WHERE qtn_number LIKE $1 
      ORDER BY qtn_number DESC 
      LIMIT 1
    `, [`${formatPrefix}%`]);

    let nextNum = 1;
    if (resData.rows.length > 0) {
      const lastQtn = resData.rows[0].qtn_number;
      const parts = lastQtn.split('-');
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }

    const formattedNum = nextNum.toString().padStart(3, '0');
    return success(res, "Next number fetched", { nextNumber: `${formatPrefix}${formattedNum}` });
  } catch (err: any) {
    console.error("GET NEXT NUMBER ERROR:", err.message);
    return error(res, "Failed to fetch next number");
  }
};

/**
 * DELETE QUOTATION
 */
export const deleteQuotation = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    
    // 1. Check if it exists
    const checkRes = await pool.query(`SELECT id FROM quotations WHERE id = $1`, [id]);
    if (checkRes.rows.length === 0) return error(res, "Quotation not found", 404);

    // 2. Perform Delete
    await pool.query(`DELETE FROM quotations WHERE id = $1`, [id]);

    return success(res, "Quotation deleted successfully from database");
  } catch (err: any) {
    console.error("DELETE QUOTATION ERROR:", err.message);
    return error(res, "Failed to delete quotation");
  }
};
