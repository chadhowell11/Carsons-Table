// Positive control for guard 1: every line below is a violation.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
const url = process.env.TS_DB_URL;
const key = process.env.TS_EMAIL_API_KEY;
export default { pg, createClient, url, key };
