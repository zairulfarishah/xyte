import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function App() {
  const [team, setTeam] = useState([])

  useEffect(() => {
    async function fetchTeam() {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')

      if (error) {
        console.error('Connection failed:', error)
      } else {
        setTeam(data)
      }
    }
    fetchTeam()
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Xyte — Connection Test</h1>
      {team.length === 0 ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {team.map(member => (
            <li key={member.id}>
              {member.full_name} — {member.role}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App