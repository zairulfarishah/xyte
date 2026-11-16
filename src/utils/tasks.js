import { supabase } from '../supabase'
import { notifyMany } from './notify'

// Shared task actions (dashboard strip + Tasks page): create a task and tell the people
// it was given to; mark done / undo and tell whoever gave it.

const firstOf = name => String(name || '').split(' ')[0] || 'Someone'

// form: { title, description, priority, due_date, assignees: [memberId] }
// me: { memberId, fullName }
export async function createTask(form, me) {
  const { data: task, error } = await supabase.from('tasks').insert({
    title: form.title.trim(),
    description: form.description?.trim() || null,
    priority: form.priority || 'medium',
    due_date: form.due_date || null,
    created_by: me.memberId,
  }).select().single()
  if (error) return { error }

  const { error: aErr } = await supabase.from('task_assignments')
    .insert(form.assignees.map(member_id => ({ task_id: task.id, member_id })))
  if (aErr) return { error: aErr }

  const others = form.assignees.filter(id => id !== me.memberId)
  if (others.length) {
    notifyMany(`${firstOf(me.fullName)} gave you a task: "${task.title}"`, me.fullName, others, 'task').catch(() => {})
  }
  return { task: { ...task, task_assignments: form.assignees.map(member_id => ({ member_id })) } }
}

export async function setTaskDone(task, done, me) {
  const status = done ? 'done' : 'todo'
  const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id)
  if (!error && done && task.created_by && task.created_by !== me.memberId) {
    notifyMany(`${firstOf(me.fullName)} finished your task: "${task.title}"`, me.fullName, [task.created_by], 'task').catch(() => {})
  }
  return { error, status }
}

const pad = n => String(n).padStart(2, '0')
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// 'over' | 'today' | 'soon' | 'none' — for colour and ordering
export function dueState(task, today = todayIso()) {
  if (!task.due_date) return 'none'
  const d = String(task.due_date).slice(0, 10)
  return d < today ? 'over' : d === today ? 'today' : 'soon'
}

export function dueLabel(task, today = todayIso()) {
  if (!task.due_date) return 'No date'
  const d = String(task.due_date).slice(0, 10)
  const days = Math.round((new Date(`${today}T00:00:00`) - new Date(`${d}T00:00:00`)) / 86400000)
  if (days > 0) return days === 1 ? '1 day late' : `${days} days late`
  if (days === 0) return 'Today'
  if (days === -1) return 'Tomorrow'
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
}

const RANK = { over: 0, today: 1, soon: 2, none: 3 }
export function sortTasks(list, today = todayIso()) {
  return [...list].sort((a, b) => RANK[dueState(a, today)] - RANK[dueState(b, today)]
    || String(a.due_date || '9').localeCompare(String(b.due_date || '9'))
    || String(b.created_at || '').localeCompare(String(a.created_at || '')))
}
