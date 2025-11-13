// js/supabase.client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase project URL (Project settings → API → Project URL)
const SUPABASE_URL = 'https://blsmmhbillndyxehtbmt.supabase.co';

// Public anon key (mag in de frontend, NIET de service_role key)
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsc21taGJpbGxuZHl4ZWh0Ym10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNDE1MzYsImV4cCI6MjA3ODYxNzUzNn0.8Mg3JP9ZcO4t2QhQ70FMllN_UTCTrYd0Tmob1cYbirw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
