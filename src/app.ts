import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";

// Routes
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/users.routes";
import clientRoutes from "./modules/clients/client.routes";
import proposalRoutes from "./modules/proposals/proposals.routes";
import invoiceRoutes from "./modules/invoices/invoice.routes";
import paymentRoutes from "./modules/payments/payments.routes";
import ledgerRoutes from "./modules/ledger/ledger.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import projectRoutes from "./modules/projects/projects.routes";
import portalRoutes from "./modules/portal/portal.routes";
import creditRoutes from "./modules/creditControl/credit.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import activityRoutes from "./modules/activity/activity.routes";
import expenseRoutes from "./modules/expense/expense.routes";
import approvalRoutes from "./modules/approvals/approvals.routes";
import boqRoutes from "./modules/boq/boq.routes";
import pmRoutes from "./modules/projects/pm.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import leadRoutes from "./modules/leads/leads.routes";
import quotationsRoutes from "./modules/quotations/quotations.routes";
// import uploadRoutes from "./modules/uploads/upload.routes";
import creditRequestRoutes from "./modules/creditRequests/creditRequest.routes";
import purchaseOrdersRoutes from "./modules/inventory/purchase_orders.routes";
import employeeRoutes from "./modules/employees/employees.routes";
import marketingRoutes from "./modules/leads/marketing.routes";
import accountsRoutes from "./modules/accounts/accounts.routes";
import proRoutes from "./modules/pro/pro.routes";


const app = express();

// ==============================
// MIDDLEWARES
// ==============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// ✅ Global Request Logger for Debugging
app.use((req, res, next) => {
    console.log(`[API_LOG] ${req.method} ${req.url}`);
    next();
});

// ==============================
// RATE LIMITER
// ==============================
/*
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000 // Boosted for development and high-concurrency testing
});
app.use(limiter);
*/

// ==============================
// ROUTES
// ==============================
app.get("/", (req, res) => {
  res.send("API Running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
import clientPortalRoutes from "./modules/clients/clientPortal.routes";

app.use("/api/clients", clientRoutes);
app.use("/api/client", clientPortalRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/quotations", quotationsRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/v1/credit-control", creditRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/v1/expenses", expenseRoutes);

// ✅ APPROVAL ROUTES (IMPORTANT)
app.use("/api/approvals", approvalRoutes);
app.use("/api/boqs", boqRoutes);
app.use("/api/pm", pmRoutes);
app.use("/api/admin", dashboardRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/purchase-orders", purchaseOrdersRoutes);
app.use("/api/products", (req, res, next) => {
  next();
}, inventoryRoutes);
app.use("/api/leads", leadRoutes);
// app.use("/api/upload", uploadRoutes);
app.use("/api/credit-requests", creditRequestRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/marketing", marketingRoutes);
import supportRoutes from "./modules/support/support.routes";

app.use("/api/accounts", accountsRoutes);
app.use("/api/pro", proRoutes);
app.use("/api/support", supportRoutes);

// marketing notifications fallback to stop console errors
app.get("/api/marketing/notifications", (req, res) => {
    res.json({ success: true, data: [] });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});


// ==============================
// 404 HANDLER
// ==============================
app.use((req, res, next) => {
  const err: any = new Error("Route not found");
  err.status = 404;
  next(err);
});

// ==============================
// ERROR HANDLER
// ==============================
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[ERROR]", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

export default app;