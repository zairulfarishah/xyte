import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { useViewport } from '../utils/useViewport'
import { Plus, Trash2, Check, X, Calendar } from 'lucide-react'

const MEMBER_COLORS = [
  { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', header: '#2563eb' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', header: '#ea580c' },
  { bg: '#f0fdf4', border: '#86efac', text: '#166534', header: '#16a34a' },
  { bg: '#faf5ff', border: '#c4b5fd', text: '#6d28d9', header: '#7c3aed' },
  { bg: '#fdf2f8', border: '#f9a8d4', text: '#9d174d', header: '#db2777' },
]

const PRIORITY = {
  low:    { bg: '#f0fdf4', text: '#166534', border: '#86efac', label: 'Low' },
  medium: { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'Medium' },
  high:   { bg: '#fee2e2', text: '#991b1b', border: '#f87171', label: 'High' },
}

const lLabel = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }
const input  = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit' }

export default function TaskPage() {
  const { memberId } = useAuth()
  const { isMobile } = useViewport()
  const [members, setMembers] = useState([])
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '', assignees: [] })
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState(null)
  const [cardFilter, setCardFilter] = useState({}) // memberId -> 'all' | 'active' | 'done'

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from('team_members').select('id, full_name, short_name, avatar_url').order('full_name'),
      supabase.from('tasks')
        .select('*, task_assignments(member_id)')
        .order('created_at', { ascending: false }),
    ])
    setMembers(m || [])
    setTasks(t || [])
    setLoading(false)
  }

  function toggleAssignee(id) {
    setForm(f => ({
      ...f,
      assignees: f.assignees.includes(id) ? f.assignees.filter(x => x !== id) : [...f.assignees, id],
    }))
  }

  function openModal(preAssign = []) {
    setForm({ title: '', description: '', priority: 'medium', due_date: '', assignees: preAssign })
    setFormError(null)
    setShowModal(true)
  }

  async function handleAdd() {
    if (!form.title.trim())         { setFormError('Task title is required.'); return }
    if (form.assignees.length === 0) { setFormError('Assign to at least one person.'); return }
    setSaving(true); setFormError(null)

    const { data: task, error } = await supabase.from('tasks').insert({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      priority:    form.priority,
      due_date:    form.due_date || null,
      created_by:  memberId,
    }).select().single()

    if (error) { setFormError(error.message); setSaving(false); return }

    await supabase.from('task_assignments').insert(
      form.assignees.map(mid => ({ task_id: task.id, member_id: mid }))
    )

    setSaving(false)
    setShowModal(false)
    fetchAll()
  }

  async function toggleDone(task) {
    const next = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  async function handleDelete(task) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', task.id)
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  const tasksByMember = useMemo(() => {
    const map = {}
    members.forEach(m => { map[m.id] = [] })
    tasks.forEach(t => {
      t.task_assignments?.forEach(a => {
        if (map[a.member_id]) map[a.member_id].push(t)
      })
    })
    return map
  }, [tasks, members])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading tasks…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#071226 0 88px,#dde4ed 88px 100%)' }}>

      {/* Header */}
      <div style={{ padding: isMobile ? '18px 14px 0' : '24px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'white' }}>Tasks</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} · {tasks.filter(t => t.status === 'done').length} done
          </p>
        </div>
        <button
          onClick={() => openModal()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.3)' }}
        >
          <Plus size={14} /> New Task
        </button>
      </div>

      {/* Cards grid */}
      <div style={{ padding: isMobile ? '16px 14px 48px' : '24px 32px 48px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : members.length <= 3 ? `repeat(${members.length}, 1fr)` : 'repeat(3, 1fr)',
          gap: '14px',
          alignItems: 'start',
        }}>
          {members.map((member, idx) => {
            const c = MEMBER_COLORS[idx % MEMBER_COLORS.length]
            const memberTasks = tasksByMember[member.id] || []
            const fKey = member.id
            const cur  = cardFilter[fKey] || 'all'
            const shown = memberTasks.filter(t =>
              cur === 'active' ? t.status !== 'done' :
              cur === 'done'   ? t.status === 'done' : true
            )
            const doneCount   = memberTasks.filter(t => t.status === 'done').length
            const activeCount = memberTasks.length - doneCount
            const initials = member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            const name = member.short_name || member.full_name.split(' ')[0]

            return (
              <div key={member.id} style={{ background: 'white', borderRadius: '18px', border: `1px solid ${c.border}`, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

                {/* Card header */}
                <div style={{ background: c.header, padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: 'white', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)', overflow: 'hidden' }}>
                    {member.avatar_url
                      ? <img src={member.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '800', fontSize: '16px', color: 'white' }}>{name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>{activeCount} active</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>·</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>{doneCount} done</span>
                    </div>
                  </div>
                  {/* Progress ring */}
                  {memberTasks.length > 0 && (
                    <div style={{ position: 'relative', width: '34px', height: '34px', flexShrink: 0 }}>
                      <svg width="34" height="34" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="17" cy="17" r="13" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                        <circle
                          cx="17" cy="17" r="13" fill="none"
                          stroke="rgba(255,255,255,0.9)" strokeWidth="3"
                          strokeDasharray={`${2 * Math.PI * 13}`}
                          strokeDashoffset={`${2 * Math.PI * 13 * (1 - doneCount / memberTasks.length)}`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                        />
                      </svg>
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '800', color: 'white' }}>
                        {Math.round((doneCount / memberTasks.length) * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  {[['all', 'All'], ['active', 'Active'], ['done', 'Done']].map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setCardFilter(prev => ({ ...prev, [fKey]: val }))}
                      style={{ flex: 1, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: cur === val ? '700' : '500', color: cur === val ? c.header : '#94a3b8', borderBottom: `2px solid ${cur === val ? c.header : 'transparent'}`, transition: 'all 0.15s' }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Task list */}
                <div style={{ padding: '8px', minHeight: '60px', maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {shown.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '12px', padding: '28px 8px' }}>
                      {cur === 'done' ? 'No completed tasks' : cur === 'active' ? 'No active tasks' : 'No tasks yet'}
                    </p>
                  ) : shown.map(task => {
                    const isDone    = task.status === 'done'
                    const pc        = PRIORITY[task.priority] || PRIORITY.medium
                    const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date()
                    return (
                      <div
                        key={task.id}
                        style={{ background: isDone ? '#fafafa' : 'white', border: `1px solid ${isDone ? '#f1f5f9' : '#e8edf3'}`, borderRadius: '10px', padding: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start', transition: 'all 0.15s' }}
                      >
                        {/* Complete toggle */}
                        <button
                          onClick={() => toggleDone(task)}
                          title={isDone ? 'Mark as active' : 'Mark as done'}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${isDone ? c.header : '#d1d5db'}`, background: isDone ? c.header : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: '1px', transition: 'all 0.2s' }}
                        >
                          {isDone && <Check size={11} color="white" strokeWidth={3} />}
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: isDone ? '#94a3b8' : '#0f172a', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {task.title}
                          </p>
                          {task.description && !isDone && (
                            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {task.description}
                            </p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <span style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`, padding: '1px 7px', borderRadius: '99px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {pc.label}
                            </span>
                            {task.due_date && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: isOverdue ? '#ef4444' : '#94a3b8', fontWeight: isOverdue ? '700' : '400' }}>
                                <Calendar size={9} />
                                {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                                {isOverdue && ' · Overdue'}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(task)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', display: 'flex', padding: '2px', flexShrink: 0, borderRadius: '4px', transition: 'color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#e2e8f0'}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Quick add button */}
                <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => openModal([member.id])}
                    style={{ width: '100%', padding: '8px', borderRadius: '10px', border: `1.5px dashed ${c.border}`, background: 'transparent', color: c.text, fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = c.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Plus size={12} /> Add task for {name}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* New Task Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '500px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 70px rgba(15,23,42,.22)' }}>

            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: '700', fontSize: '16px', color: '#0f172a' }}>New Task</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Add a task and assign to team members</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '70vh' }}>

              {/* Title */}
              <div>
                <label style={lLabel}>What needs to be done? *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAdd()}
                  placeholder="e.g. Contact client about site access"
                  style={input}
                />
              </div>

              {/* Description */}
              <div>
                <label style={lLabel}>Description <span style={{ color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Add any notes or details..."
                  rows={2}
                  style={{ ...input, resize: 'vertical' }}
                />
              </div>

              {/* Priority + Due date */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={lLabel}>Priority</label>
                  <div style={{ display: 'flex', gap: '4px', background: '#f8fafc', borderRadius: '8px', padding: '3px', border: '1px solid #e2e8f0' }}>
                    {['low', 'medium', 'high'].map(p => {
                      const pc = PRIORITY[p]
                      const active = form.priority === p
                      return (
                        <button
                          key={p}
                          onClick={() => setForm(f => ({ ...f, priority: p }))}
                          style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: 'none', background: active ? pc.bg : 'transparent', color: active ? pc.text : '#94a3b8', fontSize: '11px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s', outline: active ? `1px solid ${pc.border}` : 'none' }}
                        >
                          {pc.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={lLabel}>Due Date <span style={{ color: '#94a3b8', fontWeight: '400' }}>(optional)</span></label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    style={{ ...input, padding: '8px 10px' }}
                  />
                </div>
              </div>

              {/* Assign to */}
              <div>
                <label style={lLabel}>Assign to *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {members.map((m, idx) => {
                    const c = MEMBER_COLORS[idx % MEMBER_COLORS.length]
                    const selected = form.assignees.includes(m.id)
                    const name = m.short_name || m.full_name.split(' ')[0]
                    const initials = m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleAssignee(m.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 13px 7px 8px', borderRadius: '99px', border: `1.5px solid ${selected ? c.header : '#e2e8f0'}`, background: selected ? c.bg : '#f8fafc', cursor: 'pointer', transition: 'all 0.15s' }}
                      >
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: selected ? c.header : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800', color: selected ? 'white' : '#94a3b8', flexShrink: 0, transition: 'all 0.15s', overflow: 'hidden' }}>
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initials}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: selected ? '700' : '500', color: selected ? c.text : '#64748b' }}>{name}</span>
                        {selected && <Check size={12} color={c.header} strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {formError && (
                <p style={{ fontSize: '12px', color: '#ef4444', background: '#fee2e2', padding: '9px 12px', borderRadius: '8px' }}>{formError}</p>
              )}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '2px' }}>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  style={{ flex: 2, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: '#2563eb', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
                >
                  {saving ? 'Adding…' : 'Add Task'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
