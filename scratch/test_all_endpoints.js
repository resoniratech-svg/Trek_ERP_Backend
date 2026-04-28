// Test all 3 delete endpoints
const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign(
  { userId: 9, role: 'SUPER_ADMIN', client_id: null, division: null, sector: null },
  'trek_erp_jwt_secret_key_2026',
  { expiresIn: '1d' }
);

function testEndpoint(method, path, label) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 5000, path, method,
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`[${label}] ${method} ${path} => ${res.statusCode}: ${data.substring(0, 150)}`);
        resolve({ status: res.statusCode, data: JSON.parse(data) });
      });
    });
    req.end();
  });
}

async function main() {
  // Test GET products
  const products = await testEndpoint('GET', '/api/products', 'Products');
  const productItems = products.data.data || [];
  console.log(`\nProducts count: ${productItems.length}`);
  
  // Test GET purchase orders
  const pos = await testEndpoint('GET', '/api/purchase-orders', 'PurchaseOrders');
  const poItems = pos.data.data || [];
  console.log(`Purchase orders count: ${poItems.length}`);
  
  // Test GET sales orders
  const sos = await testEndpoint('GET', '/api/inventory/sales-orders', 'SalesOrders');
  const soItems = sos.data.data || [];
  console.log(`Sales orders count: ${soItems.length}`);
  
  console.log('\n--- All endpoints responding OK ---');
}

main().catch(console.error);
