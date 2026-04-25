import { supabase } from '../supabase'

export async function notify(message, actor = 'Zairul Farishah') {
  await supabase.from('notifications').insert({ message, actor })
}
