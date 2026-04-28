// Test the delete endpoint using a freshly generated token
const jwt = require('jsonwebtoken');
const http = require('http');

// Generate a valid token using the same JWT_SECRET
const token = jwt.sign(
  { userId: 9, role: 'SUPER_ADMIN', client_id: null, division: null, sector: null },
  'trek_erp_jwt_secret_key_2026',
  { expiresIn: '1d' }
);

console.log('Generated token');

// First fetch sales orders
const getReq = http.request({
  hostname: 'localhost', port: 5000,
  path: '/api/inventory/sales-orders',
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const parsed = JSON.parse(data);
    const orders = parsed.data || [];
    console.log(`Found ${orders.length} sales orders:`);
    orders.forEach(o => console.log(`  id=${o.id} order_number=${o.order_number} status=${o.status}`));
    
    if (orders.length > 0) {
      const lastOrder = orders[orders.length - 1];
      console.log(`\nDeleting order id=${lastOrder.id}...`);
      
      const delReq = http.request({
        hostname: 'localhost', port: 5000,
        path: `/api/inventory/sales-orders/${lastOrder.id}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (delRes) => {
        let delData = '';
        delRes.on('data', (chunk) => delData += chunk);
        delRes.on('end', () => {
          console.log(`Delete response: ${delRes.statusCode} ${delData}`);
        });
      });
      delReq.end();
    }
  });
});
getReq.end();
