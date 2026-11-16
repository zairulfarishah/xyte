import { useEffect, useState } from 'react'
import { CraneScene } from './SceneArt'

// Sidebar card: a short line that changes every day over the crane drawing, whose sky
// colour also changes. Lines are our own (no quotes put in real people's mouths).
const LINES = [
  'Measure twice, core once.',
  'Every slab has a story. Scan it first.',
  'Safe hands, sharp eyes, clean reports.',
  'Good data today saves a hole tomorrow.',
  'The best cut is the one that misses the tendon.',
  'Small checks keep big jobs on track.',
  'A clear report is the job done twice well.',
  'Plan the day, then work the plan.',
  'Helmet on, phone charged, GPR ready.',
  'Quality is what happens when no one is watching.',
  'Every site is a chance to learn something new.',
  'Mark it clearly. Someone is drilling after you.',
  'Together we build safer structures.',
  'Leave every site cleaner than you found it.',
  'Ask early. Fix early. Finish early.',
  'Precision is a habit, not an accident.',
  'One team, many sites, same standard.',
  'Check the drawing, then check it again.',
  'The client remembers how the job was finished.',
  'Slow is smooth. Smooth is fast.',
  'Share what you found. It helps the next crew.',
  'Building a smarter tomorrow together.',
  'Good morning starts with a good brief.',
  'Your report is our reputation.',
  'Look up, look down, then scan.',
  'Every rebar counts.',
  'Respect the site, respect the team.',
  'Finish strong: photos, DO, report.',
  'Today’s care is tomorrow’s safety.',
  'Great work is many small things done right.',
  'Keep calm and keep scanning.',
]

// [top, middle, horizon] — dawn, dusk, night, overcast, golden hour, early blue
const SKIES = [
  ['#3a4f78', '#c98a5c', '#f2b26b'],
  ['#1b2a44', '#7a5c8e', '#e89a7a'],
  ['#0e1a2e', '#22385e', '#4f6f9c'],
  ['#4b5a70', '#8b97a8', '#c9cfd8'],
  ['#5a3f2a', '#c77a3a', '#f5c26b'],
  ['#20406a', '#4f86b8', '#a9d1ec'],
  ['#2b2346', '#8a4f6e', '#f0a07a'],
]

function dayNumber() {
  const d = new Date()
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

export default function DailyCard() {
  const [day, setDay] = useState(dayNumber)
  // Pick up the new day if the app stays open past midnight
  useEffect(() => {
    const t = setInterval(() => setDay(dayNumber()), 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="promo" title="A new line every day">
      <CraneScene sky={SKIES[day % SKIES.length]} />
      <p>{LINES[day % LINES.length]}</p>
    </div>
  )
}
