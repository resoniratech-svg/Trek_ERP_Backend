import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { pool } from "./config/db";

// ==============================
// DB CONNECTION CHECK
// ==============================
pool.query("SELECT NOW()")
  .then(async (res) => {
    console.log("DB Connected:", res.rows);
  })
  .catch(err => console.error("DB Error:", err));

// ==============================
// SERVER START
// ==============================
const PORT: number = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});