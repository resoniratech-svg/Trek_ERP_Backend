const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'trek_erp', password: 'root', port: 5432 });

async function main() {
  const users = await pool.query('SELECT id, name, email, role FROM users WHERE role = $1 LIMIT 3', ['SUPER_ADMIN']);
  console.log('SUPER_ADMIN users:', JSON.stringify(users.rows, null, 2));
  
  const so = await pool.query('SELECT id, order_number, status FROM sales_orders ORDER BY created_at DESC LIMIT 5');
  console.log('Sales orders:', JSON.stringify(so.rows, null, 2));
  
  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
