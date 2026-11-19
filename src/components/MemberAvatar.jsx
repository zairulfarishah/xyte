// Initials (or photo) in the Sites / Reports card style; the PIC gets an orange ring (className "pic")
export default function MemberAvatar({ member, className = '' }) {
  const name = member?.full_name || '?'
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <span className={`ss-av ${className}`} title={name}>
      {member?.avatar_url ? <img src={member.avatar_url} alt={name} loading="lazy" decoding="async" /> : initials}
    </span>
  )
}
