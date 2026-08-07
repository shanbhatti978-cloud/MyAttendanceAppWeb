// Same Supabase project the mobile app syncs to. If you ever switch
// projects, update these two values (and re-run supabase_schema.sql
// against the new project).
const SUPABASE_URL = 'https://drmthrldfvfeludvkpwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybXRocmxkZnZmZWx1ZHZrcHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MzEwMDAsImV4cCI6MjEwMTMwNzAwMH0.8reJ422ue2EkFul0c3ILVHrbxqVlT_SNbu1kpd4CM68';

// The UMD build exposes a global `supabase` object with createClient().
// We immediately shadow that name with our actual client instance below
// so the rest of the app just calls `db.from(...)` etc.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
