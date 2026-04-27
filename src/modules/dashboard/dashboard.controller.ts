import { Request, Response } from "express";
import { pool } from "../../config/db";
import { success, error } from "../../utils/response";

export const getAdminDashboardStats = async (req: any, res: Response) => {
  try {
    const division = req.query.division as string;
    console.log("--- DASHBOARD STATS LOGGING START ---");
    console.log("Active Division Context:", division || 'all');
    
    let divisionFilter = "";
    let payablesDivisionFilter = ""; // Special filter for internal_expenses
    let params: any[] = [];
    if (division && division !== "all") {
      divisionFilter = " AND division::TEXT = $1";
      payablesDivisionFilter = " AND EXISTS (SELECT 1 FROM expense_allocations WHERE expense_id = internal_expenses.id AND division::TEXT = $1)";
      params.push(division);
    }

    const runQuery = async (label: string, sql: string, p: any[]) => {
        try {
            const start = Date.now();
            const res = await pool.query(sql, p);
            console.log(`[PASS] ${label} - ${Date.now() - start}ms`);
            return res;
        } catch (err: any) {
            console.error(`[FAIL] ${label}:`, err.message);
            throw new Error(`${label}: ${err.message}`);
        }
    };

    // 1. Receivables (Unpaid Invoices)
    const receivablesRes = await runQuery("Receivables", 
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status != 'Paid'${divisionFilter}`,
      params
    );

    // 2. Payables (Internal Expenses)
    const payablesRes = await runQuery("Payables",
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM internal_expenses WHERE is_deleted = false AND approval_status::TEXT != 'PAID'${payablesDivisionFilter}`,
      params
    );

    // 3. Active Projects
    const projectsRes = await runQuery("ActiveProjects",
      `SELECT COUNT(*) as count FROM projects WHERE status IN ('Active', 'Ongoing', 'Pending')${divisionFilter}`,
      params
    );

    // 3.1 Inactive Projects (Completed + Cancelled)
    const inactiveProjectsRes = await runQuery("InactiveProjects",
      `SELECT COUNT(*) as count FROM projects WHERE status IN ('COMPLETED', 'Cancelled')${divisionFilter}`,
      params
    );

    // 3.2 Completed Projects
    const completedProjectsRes = await runQuery("CompletedProjects",
      `SELECT COUNT(*) as count FROM projects WHERE status = 'COMPLETED'${divisionFilter}`,
      params
    );

    // 4. Total Revenue
    const revenueRes = await runQuery("TotalRevenue",
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE 1=1${divisionFilter}`,
      params
    );

    // 5. Employee Count
    const employeesRes = await runQuery("EmployeeCount",
      `SELECT COUNT(*) as count FROM employees WHERE status = 'Active'${divisionFilter}`,
      params
    );

    // 6. Lead Conversion
    const leadsRes = await runQuery("LeadConversion",
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'Converted') as converted
       FROM leads WHERE 1=1${divisionFilter}`,
      params
    );

    const totalLeads = parseInt(leadsRes.rows[0].total) || 0;
    const convertedLeads = parseInt(leadsRes.rows[0].converted) || 0;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    // 7. Recent Invoices
    const recentInvoicesRes = await runQuery("RecentInvoices", `
      SELECT i.invoice_number, i.client_name as client, i.total_amount, i.status, i.division
      FROM invoices i
      ${division && division !== 'all' ? 'WHERE i.division::TEXT = $1' : ''}
      ORDER BY i.created_at DESC
      LIMIT 5
    `, division && division !== 'all' ? [division] : []);

    // 8. Lead Funnel
    const leadFunnelRes = await runQuery("LeadFunnel", `
      SELECT status as stage, COUNT(*) as count
      FROM leads
      WHERE 1=1${divisionFilter}
      GROUP BY status
    `, params);

    // 9. Recent Expenses
    const recentExpensesRes = await runQuery("RecentExpenses", `
      SELECT e.id, e.description as title, u.name, 
             COALESCE(
               (SELECT string_agg(division, ', ') FROM expense_allocations WHERE expense_id = e.id),
               'PENDING'
             ) as sector,
             e.total_amount as amount, e.approval_status as status, e.date
      FROM internal_expenses e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.is_deleted = false ${payablesDivisionFilter.replace('internal_expenses.id', 'e.id')}
      ORDER BY e.created_at DESC
      LIMIT 10
    `, params);

    // 10. Pending Payments (Top 5 Unpaid Invoices)
    const pendingPaymentsRes = await runQuery("PendingPaymentsList", `
      SELECT i.id, i.invoice_number as "invoiceNo", i.client_name as client, i.total_amount as amount, i.status, i.division, i.created_at
      FROM invoices i
      WHERE i.status != 'Paid' ${division && division !== 'all' ? 'AND i.division::TEXT = $1' : ''}
      ORDER BY i.created_at DESC
      LIMIT 5
    `, division && division !== 'all' ? [division] : []);

    // 11. Active Projects (Top 5 Active/Ongoing Projects)
    const activeProjectsListRes = await runQuery("ActiveProjectsList", `
      SELECT p.id, p.project_name as name, p.client_name as client, p.division, p.status, p.end_date as deadline,
             (SELECT COUNT(*) FROM jobs WHERE project_id = p.id) as "jobCount"
      FROM projects p
      WHERE p.status IN ('Active', 'Ongoing', 'Pending') ${division && division !== 'all' ? 'AND p.division::TEXT = $1' : ''}
      ORDER BY p.created_at DESC
      LIMIT 5
    `, division && division !== 'all' ? [division] : []);

    const statsResult = {
      totalReceivables: parseFloat(receivablesRes.rows[0].total) || 0,
      totalPayables: parseFloat(payablesRes.rows[0].total) || 0,
      activeProjects: parseInt(projectsRes.rows[0].count) || 0,
      inactiveProjects: parseInt(inactiveProjectsRes.rows[0].count) || 0,
      completedProjects: parseInt(completedProjectsRes.rows[0].count) || 0,
      totalRevenue: parseFloat(revenueRes.rows[0].total) || 0,
      totalEmployees: parseInt(employeesRes.rows[0].count) || 0,
      totalLeads,
      convertedLeads,
      conversionRate: parseFloat(conversionRate.toFixed(1))
    };

    console.log("--- DASHBOARD STATS LOGGING SUCCESS ---");

    return success(res, "Dashboard stats fetched", {
      stats: statsResult,
      recentInvoices: recentInvoicesRes.rows.map(inv => ({
          id: inv.invoice_number,
          client: inv.client || 'Unknown',
          amount: parseFloat(inv.total_amount),
          status: inv.status,
          division: inv.division
      })),
      recentExpenses: recentExpensesRes.rows.map(exp => ({
          id: `EXP-${String(exp.id).split('-')[0].toUpperCase()}`,
          title: exp.title || 'Untitled Expense',
          createdBy: exp.name ? String(exp.name).trim() : 'System',
          sector: exp.sector || 'N/A',
          amount: parseFloat(exp.amount),
          status: exp.status === 'PENDING_APPROVAL' ? 'Pending' : exp.status === 'APPROVED' ? 'Approved' : exp.status === 'REJECTED' ? 'Rejected' : exp.status,
          date: exp.date
      })),
      pendingPayments: pendingPaymentsRes.rows.map(p => ({
          id: p.id,
          invoiceNo: p.invoiceNo,
          client: p.client || 'N/A',
          amount: parseFloat(p.amount),
          status: p.status,
          division: p.division
      })),
      activeProjects: activeProjectsListRes.rows.map(p => ({
          id: p.id,
          name: p.name,
          client: p.client || 'N/A',
          division: p.division,
          status: p.status,
          deadline: p.deadline ? new Date(p.deadline).toLocaleDateString() : null,
          jobCount: parseInt(p.jobCount) || 0
      })),
      leadFunnel: leadFunnelRes.rows,
      revenueTrends: [
        { month: "Jan", revenue: 0, expense: 0, profit: 0 },
        { month: "Feb", revenue: 0, expense: 0, profit: 0 },
        { month: "Mar", revenue: statsResult.totalRevenue, expense: statsResult.totalPayables, profit: statsResult.totalRevenue - statsResult.totalPayables }
      ]
    });

  } catch (err: any) {
    console.error("DASHBOARD STATS DIAL-IN ERROR:", err.message);
    return error(res, err.message, 500);
  }

};
