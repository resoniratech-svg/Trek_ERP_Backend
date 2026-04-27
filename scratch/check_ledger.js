const { Client } = require('pg');
const c = new Client({ user: 'postgres', password: 'Akanksha123', host: 'localhost', database: 'trek_database_restore', port: 5432 });

async function run() {
  await c.connect();
  const res = await c.query("SELECT * FROM ledger_entries LIMIT 5");
  console.log(res.rows);
  
  const inv = await c.query("SELECT * FROM invoices LIMIT 5");
  console.log(inv.rows);

  const exp = await c.query("SELECT * FROM expenses LIMIT 5");
  console.log(exp.rows);
  await c.end();
}
run().catch(e => { console.error(e.message); c.end(); });
