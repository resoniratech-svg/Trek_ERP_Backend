import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { pool } from "./config/db";

// ==============================
// DB CONNECTION CHECK
// ==============================
pool.query("SELECT NOW()")
  .then(async (res: any) => {
    console.log("DB Connected:", res.rows);
  })
  .catch((err: any) => console.error("DB Error:", err));

// ==============================
// SERVER START
// ==============================
const PORT: number = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});