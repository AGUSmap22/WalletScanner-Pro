const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqocdrkkkqbqdzhypddf.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cPGJcSgX2ia3AwAJ5Jjb9Q_llrKYr2f';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

async function test() {
  const url = `${supabaseUrl}/rest/v1/`;
  console.log('Target URL:', url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
      }
    });
    console.log('STATUS:', res.status);
    const data = await res.json();
    const table = data.definitions.mnemonic_seeds;
    console.log('mnemonic_seeds definition:', JSON.stringify(table, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}
test();
