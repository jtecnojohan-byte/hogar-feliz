import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://nzchedfhmaaptcjtvlzf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o_6P_Qta6ej6qw1yoiQ0Xw_CZlZ4SAt';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});
