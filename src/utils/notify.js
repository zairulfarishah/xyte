import { supabase } from '../supabase'

export async function notify(message, actor = 'Zairul Farishah') {
  const { error } = await supabase.from('notifications').insert({ message, actor })
  if (error) {
    console.warn('Notification insert skipped:', error.message)
    return false
  }
  return true
}
