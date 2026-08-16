const { createClient } = require('@supabase/supabase-js');

// Load environment variables manually
// Next.js uses .env.local
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

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  console.log('Using URL:', supabaseUrl);
  console.log('Using Key (first 10 chars):', serviceRoleKey.substring(0, 10));
  try {
    const { data, error } = await supabaseAdmin.from('mnemonic_seeds').insert([
      { phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', user_id: 'public' }
    ]).select();
    if (error) {
      console.error('INSERT ERROR:', error);
    } else {
      console.log('INSERT SUCCESS:', data);
    }
  } catch (e) {
    console.error('EXCEPTION:', e);
  }
}
test();
