import { pool } from "../db";

const up = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. EMPLOYEES
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(100),
        division VARCHAR(100) DEFAULT 'contracting',
        status VARCHAR(50) DEFAULT 'Active',
        joined_date DATE,
        qid_number VARCHAR(50),
        qid_expiry DATE,
        passport_number VARCHAR(50),
        passport_expiry DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. LEADS
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        company_name VARCHAR(255),
        contact_person VARCHAR(255),
        email VARCHAR(100),
        phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'New',
        priority VARCHAR(20) DEFAULT 'Medium',
        division VARCHAR(100) DEFAULT 'contracting',
        assigned_to INTEGER REFERENCES users(id),
        source VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. PRODUCTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        unit VARCHAR(50),
        description TEXT,
        stock_quantity NUMERIC DEFAULT 0,
        reorder_level NUMERIC DEFAULT 10,
        purchase_price NUMERIC DEFAULT 0,
        sales_price NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. SALES ORDERS (Inventory based)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(100) UNIQUE NOT NULL,
        client_id INTEGER REFERENCES clients(id),
        order_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(50) DEFAULT 'Processing',
        total_amount NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. INVENTORY MOVEMENTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        type VARCHAR(20) NOT NULL, -- 'IN', 'OUT'
        quantity NUMERIC NOT NULL,
        reference_type VARCHAR(50), -- 'SALE', 'PURCHASE', 'MANUAL'
        reference_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query("COMMIT");
    console.log("Core Production Migration Successful");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration Error:", err);
    throw err;
  } finally {
    client.release();
  }
};

up().then(() => process.exit(0)).catch(() => process.exit(1));
