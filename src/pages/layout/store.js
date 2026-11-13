// Where saved layouts live in Supabase (sql/setup-layouts.sql)
export const TABLE = 'layout_plans'
export const BUCKET = 'layouts'
export const SELECT = '*, updater:team_members!layout_plans_updated_by_fkey(full_name, short_name)'
export const who = m => m?.short_name || m?.full_name?.split(' ')[0] || 'someone'
export const when = t => new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
