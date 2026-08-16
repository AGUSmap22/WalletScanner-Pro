const fetch = require('node-fetch'); // wait, Next.js Node version usually has global fetch
// Let's use global fetch (Node 18+ has it built-in)
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/admin/seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phrases: ['abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'],
        userId: 'public'
      })
    });
    console.log('STATUS:', res.status);
    const data = await res.json();
    console.log('RESPONSE:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}
run();
