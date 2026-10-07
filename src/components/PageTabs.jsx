// Dark page header with a title, hint line and pill tabs
export default function PageTabs({ title, hint, tabs, active, onChange }) {
  return (
    <div className="xt-hero">
      <h1>{title}</h1>
      {hint && <p>{hint}</p>}
      <div className="xt-tabs" role="tablist">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} role="tab" aria-selected={active === key} className={active === key ? 'on' : ''} onClick={() => onChange(key)}>
            {Icon && <Icon size={15} />} {label}
          </button>
        ))}
      </div>
    </div>
  )
}
