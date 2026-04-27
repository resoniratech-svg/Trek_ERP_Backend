const { Client } = require('pg'); 
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/erp_backend_restored' }); 
client.connect().then(() => client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_orders'"))
.then(res => console.log(JSON.stringify(res.rows, null, 2)))
.catch(console.error)
.finally(()=>client.end());
