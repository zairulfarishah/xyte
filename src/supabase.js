import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ipaxoqsoiouzrwjhsvgj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_tEuLdGER1Qw2505QUen3YA_nkncA02Y'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)