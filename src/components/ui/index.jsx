// Shared UI kit. Styling lives in kit.css (x- classes) on top of styles/tokens.css.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react'
import { statusInfo } from './status'
import './kit.css'

const cx = (...a) => a.filter(Boolean).join(' ')

export function Page({ className, children }) {
  return <div className={cx('x-page', className)}>{children}</div>
}

// Title, optional subtitle and breadcrumbs on the left; actions on the right
export function PageHeader({ title, subtitle, crumbs, actions, children }) {
  return (
    <header className="x-ph">
      <div style={{ minWidth: 0 }}>
        {crumbs?.length > 0 && (
          <nav className="x-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <ChevronRight size={12} />}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="x-sub">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="x-acts">{actions}</div>}
    </header>
  )
}

// variant: primary | secondary | ghost | danger | danger-outline ; size: sm ; icon-only via iconOnly
export function Button({ variant = 'secondary', size, iconOnly, icon: Icon, to, className, children, ...rest }) {
  const cls = cx('x-btn', `x-btn-${variant}`, size === 'sm' && 'x-btn-sm', iconOnly && 'x-btn-icon', className)
  const body = <>{Icon && <Icon />}{children}</>
  if (to) return <Link to={to} className={cls} {...rest}>{body}</Link>
  return <button type="button" className={cls} {...rest}>{body}</button>
}

export function Card({ title, action, className, bodyClassName, children, padded = false }) {
  return (
    <section className={cx('x-card', className)}>
      {(title || action) && <div className="x-card-h">{title && <h2>{title}</h2>}{action && <div className="x-more">{action}</div>}</div>}
      {padded ? <div className={cx('x-card-b', bodyClassName)}>{children}</div> : children}
    </section>
  )
}

const TONE_ICON = {
  success: ['var(--x-success-bg)', 'var(--x-success)'], warning: ['var(--x-warning-bg)', 'var(--x-warning-ink)'],
  danger: ['var(--x-danger-bg)', 'var(--x-danger)'], info: ['var(--x-info-bg)', 'var(--x-info)'],
  review: ['var(--x-review-bg)', 'var(--x-review)'], neutral: ['var(--x-neutral-bg)', 'var(--x-ink-3)'],
  orange: ['var(--x-orange-soft)', 'var(--x-orange)'],
}

// A number with a label; clickable when onClick or to is given; `active` outlines it (used as a filter)
export function StatCard({ icon: Icon, tone = 'info', value, label, onClick, to, active, title }) {
  const [bg, fg] = TONE_ICON[tone] || TONE_ICON.info
  const body = (
    <>
      {Icon && <span className="x-ic" style={{ background: bg, color: fg }}><Icon /></span>}
      <div style={{ minWidth: 0 }}><b>{value}</b><span>{label}</span></div>
    </>
  )
  const cls = cx('x-card', 'x-stat', active && 'on')
  if (to) return <Link to={to} className={cls} title={title}>{body}</Link>
  if (onClick) return <button type="button" className={cls} onClick={onClick} aria-pressed={!!active} title={title}>{body}</button>
  return <div className={cls} title={title}>{body}</div>
}

// <StatusBadge map={SITE_STATUS} value="ongoing" /> or <StatusBadge tone="danger">No crew</StatusBadge>
export function StatusBadge({ map, value, tone, dot = true, children, title }) {
  const info = map ? statusInfo(map, value) : { label: children, tone: tone || 'neutral' }
  return <span className={cx('x-badge', `x-tone-${info.tone}`, !dot && 'nodot')} title={title}>{children ?? info.label}</span>
}

// tabs: [{ key, label, count?, icon? }]
export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={cx('x-tabs', className)} role="tablist">
      {tabs.map(t => (
        <button key={t.key} role="tab" aria-selected={active === t.key} className={active === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.icon && <t.icon />}{t.label}{t.count != null && <span className="x-n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// options: [{ key, label, icon?, title? }]
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="x-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.key} type="button" className={value === o.key ? 'on' : ''} aria-pressed={value === o.key} onClick={() => onChange(o.key)} title={o.title}>
          {o.icon && <o.icon />}{o.label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, style, autoFocus }) {
  return (
    <label className={cx('x-inp', className)} style={style}>
      <Search />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      {value && <button type="button" className="x-clear" onClick={() => onChange('')} aria-label="Clear search"><X size={14} /></button>}
    </label>
  )
}

// Native select styled to match; `active` highlights it when a filter is set
export function Select({ value, onChange, options, active, className, ...rest }) {
  return (
    <select className={cx('x-select', active && 'on', className)} value={value} onChange={e => onChange(e.target.value)} {...rest}>
      {options.map(o => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function FilterBar({ children, className }) {
  return <div className={cx('x-filters', className)}>{children}</div>
}

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <div className={cx('x-field', error && 'bad', className)}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="x-err">{error}</span> : hint ? <span className="x-hint">{hint}</span> : null}
    </div>
  )
}

export function FormSection({ title, description, children }) {
  return <div className="x-section">{title && <h3>{title}</h3>}{description && <p>{description}</p>}{children}</div>
}

export function Pagination({ page, pages, total, from, to, onChange, noun = "items" }) {
  if (pages <= 1) return total ? <div className="x-pager">Showing {total} {noun}</div> : null
  const nums = []
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p)
  return (
    <div className="x-pager">
      {total != null && <span>Showing {from}–{to} of {total} {noun}</span>}
      <span className="x-sp" />
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={14} /></button>
      {nums[0] > 1 && <><button onClick={() => onChange(1)}>1</button>{nums[0] > 2 && <span>…</span>}</>}
      {nums.map(p => <button key={p} className={p === page ? 'on' : ''} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>)}
      {nums[nums.length - 1] < pages && <>{nums[nums.length - 1] < pages - 1 && <span>…</span>}<button onClick={() => onChange(pages)}>{pages}</button></>}
      <button onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={14} /></button>
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, children, actions }) {
  return (
    <div className="x-state">
      <span className="x-ic"><Icon /></span>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {actions && <div className="x-acts">{actions}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', children = 'Check your connection and try again.', onRetry }) {
  return (
    <div className="x-state err">
      <span className="x-ic"><AlertCircle /></span>
      <b>{title}</b>
      <p>{children}</p>
      {onRetry && <div className="x-acts"><Button size="sm" onClick={onRetry}>Retry</Button></div>}
    </div>
  )
}

// Skeleton rows while data loads
export function LoadingState({ rows = 4 }) {
  return (
    <div style={{ display: 'grid', gap: 12, padding: '18px' }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="x-skel" style={{ width: `${[85, 100, 70, 92, 60][i % 5]}%` }} />)}
    </div>
  )
}

export function Avatar({ member, size }) {
  const name = member?.full_name || member?.name || '?'
  const ini = name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.38) } : undefined
  return <span className="x-av" title={name} style={style}>{member?.avatar_url ? <img src={member.avatar_url} alt="" loading="lazy" /> : ini}</span>
}

export function AvatarStack({ members, max = 4 }) {
  const shown = members.slice(0, max)
  return (
    <span className="x-avs">
      {shown.map((m, i) => <Avatar key={m.id || i} member={m} />)}
      {members.length > max && <span className="x-more-n">+{members.length - max}</span>}
    </span>
  )
}

// Closes on Escape and backdrop click. size: sm | lg
export function Modal({ open = true, title, onClose, footer, size, children, labelledBy }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="x-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={cx('x-modal', size)} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy}>
        {title && (
          <div className="x-modal-h">
            <h3>{title}</h3>
            {onClose && <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Close" />}
          </div>
        )}
        <div className="x-modal-b">{children}</div>
        {footer && <div className="x-modal-f">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open = true, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="x-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel?.() }}>
      <div className="x-modal sm" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className={cx('x-confirm', danger && 'danger')}>
          <span className="x-ic"><AlertTriangle size={18} /></span>
          <div><b>{title}</b>{message && <p>{message}</p>}</div>
        </div>
        <div className="x-modal-f">
          <Button onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
