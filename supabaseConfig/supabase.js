const { createClient } = require('@supabase/supabase-js');
const { Agent, fetch: undiciFetch } = require('undici');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// Create a custom undici Agent with a 10-minute timeout
const dispatcher = new Agent({
  headersTimeout: 600000, // 10 minutes
  bodyTimeout: 600000,    // 10 minutes
  connectTimeout: 600000, // 10 minutes
});

const customFetch = (url, options = {}) => {
  return undiciFetch(url, { ...options, dispatcher });
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
  global: {
    fetch: customFetch,
  },
});

module.exports = supabase;
