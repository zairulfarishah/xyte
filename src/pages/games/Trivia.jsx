import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { toast } from '../../utils/toast'
import { playedToday } from './scores'

// [question, right answer, three wrong answers]. Add more at the end any time —
// the daily pick spreads over however many there are.
const BANK = [
  // Malaysia
  ['What is the capital city of Malaysia?', 'Kuala Lumpur', 'Putrajaya', 'Johor Bahru', 'George Town'],
  ['Which city is Malaysia’s federal administrative centre?', 'Putrajaya', 'Cyberjaya', 'Shah Alam', 'Kuala Lumpur'],
  ['In which year did Malaya gain independence?', '1957', '1963', '1946', '1965'],
  ['In which year was Malaysia formed with Sabah and Sarawak?', '1963', '1957', '1965', '1971'],
  ['In which year did Singapore leave Malaysia?', '1965', '1963', '1969', '1957'],
  ['What is the highest mountain in Malaysia?', 'Mount Kinabalu', 'Gunung Tahan', 'Gunung Mulu', 'Gunung Ledang'],
  ['Which state is Mount Kinabalu in?', 'Sabah', 'Sarawak', 'Pahang', 'Perak'],
  ['What is Malaysia’s national flower?', 'Hibiscus (Bunga Raya)', 'Orchid', 'Jasmine', 'Rafflesia'],
  ['How many states does Malaysia have?', '13', '11', '14', '16'],
  ['How many federal territories does Malaysia have?', '3', '2', '4', '1'],
  ['Which is the largest state in Malaysia by area?', 'Sarawak', 'Sabah', 'Pahang', 'Perak'],
  ['Which is the largest state in Peninsular Malaysia?', 'Pahang', 'Perak', 'Johor', 'Kelantan'],
  ['How many floors do the Petronas Twin Towers have?', '88', '101', '72', '110'],
  ['What is the longest river in Malaysia?', 'Rajang River', 'Pahang River', 'Kinabatangan River', 'Perak River'],
  ['What is Malaysia’s national animal?', 'Malayan tiger', 'Orangutan', 'Hornbill', 'Malayan tapir'],
  ['Sarawak is known as the Land of the…', 'Hornbills', 'Tigers', 'Eagles', 'Turtles'],
  ['What is the capital of Penang?', 'George Town', 'Butterworth', 'Bayan Lepas', 'Bukit Mertajam'],
  ['What is the capital of Sabah?', 'Kota Kinabalu', 'Sandakan', 'Tawau', 'Lahad Datu'],
  ['What is the capital of Sarawak?', 'Kuching', 'Miri', 'Sibu', 'Bintulu'],
  ['What is the capital of Johor?', 'Johor Bahru', 'Muar', 'Batu Pahat', 'Kluang'],
  ['What is the capital of Kelantan?', 'Kota Bharu', 'Pasir Mas', 'Tumpat', 'Gua Musang'],
  ['What is the capital of Terengganu?', 'Kuala Terengganu', 'Kemaman', 'Dungun', 'Marang'],
  ['What is the capital of Pahang?', 'Kuantan', 'Temerloh', 'Bentong', 'Raub'],
  ['What is the capital of Perak?', 'Ipoh', 'Taiping', 'Teluk Intan', 'Kuala Kangsar'],
  ['What is the capital of Kedah?', 'Alor Setar', 'Sungai Petani', 'Kulim', 'Langkawi'],
  ['What is the capital of Selangor?', 'Shah Alam', 'Klang', 'Petaling Jaya', 'Subang Jaya'],
  ['What is the capital of Negeri Sembilan?', 'Seremban', 'Port Dickson', 'Nilai', 'Rembau'],
  ['What is the capital of Perlis?', 'Kangar', 'Arau', 'Padang Besar', 'Kuala Perlis'],
  ['Who was Malaysia’s first Prime Minister?', 'Tunku Abdul Rahman', 'Tun Abdul Razak', 'Tun Hussein Onn', 'Tun Dr Mahathir'],
  ['What is the title of Malaysia’s head of state?', 'Yang di-Pertuan Agong', 'Sultan Besar', 'Raja Muda', 'Perdana Menteri'],
  ['Langkawi island belongs to which state?', 'Kedah', 'Perlis', 'Penang', 'Perak'],
  ['Cameron Highlands is in which state?', 'Pahang', 'Perak', 'Kelantan', 'Selangor'],
  ['Batu Caves is in which state?', 'Selangor', 'Perak', 'Negeri Sembilan', 'Pahang'],
  ['Nasi lemak rice is cooked in…', 'Coconut milk', 'Chicken stock', 'Plain milk', 'Tea'],
  ['Which fruit is called the King of Fruits?', 'Durian', 'Mangosteen', 'Rambutan', 'Jackfruit'],
  ['Which side of the road does Malaysia drive on?', 'Left', 'Right', 'Either', 'Depends on the state'],
  ['What is Malaysia’s international calling code?', '+60', '+65', '+62', '+66'],
  ['Which time zone is Malaysia in?', 'UTC+8', 'UTC+7', 'UTC+9', 'UTC+6'],
  ['Which strait lies between Peninsular Malaysia and Sumatra?', 'Strait of Malacca', 'Strait of Johor', 'Sunda Strait', 'Strait of Hormuz'],
  ['When is Hari Merdeka?', '31 August', '16 September', '1 May', '31 July'],
  ['When is Malaysia Day?', '16 September', '31 August', '1 February', '9 September'],
  ['Up to which year did Sepang host Formula One races?', '2017', '2010', '2019', '2005'],
  ['Which Malaysian badminton player was world No. 1 in men’s singles for a record number of weeks?', 'Lee Chong Wei', 'Misbun Sidek', 'Lee Zii Jia', 'Rashid Sidek'],
  ['How many stripes does the Jalur Gemilang have?', '14', '13', '15', '11'],
  ['How many points does the star on the Jalur Gemilang have?', '14', '13', '5', '16'],
  ['What colour are the crescent and star on the Jalur Gemilang?', 'Yellow', 'White', 'Gold and white', 'Red'],
  ['Which animals hold up the shield on Malaysia’s coat of arms?', 'Two tigers', 'Two hornbills', 'Two elephants', 'Two lions'],
  ['“Teh tarik” literally means…', 'Pulled tea', 'Sweet tea', 'Hot tea', 'Milk tea'],
  ['What gives cendol its green colour?', 'Pandan', 'Matcha', 'Spinach', 'Lime'],
  ['Which is the largest tree-borne fruit in the world?', 'Jackfruit', 'Durian', 'Coconut', 'Watermelon'],
  ['What is the currency of Malaysia?', 'Ringgit', 'Rupiah', 'Baht', 'Peso'],
  // Science & numbers
  ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'],
  ['What is the chemical symbol for iron?', 'Fe', 'Ir', 'In', 'I'],
  ['What is the chemical symbol for sodium?', 'Na', 'So', 'Sd', 'S'],
  ['At sea level, water boils at…', '100 °C', '90 °C', '120 °C', '80 °C'],
  ['Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'],
  ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Earth'],
  ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury'],
  ['Which planet has the most famous rings?', 'Saturn', 'Jupiter', 'Uranus', 'Mars'],
  ['How many bones does an adult human have?', '206', '186', '226', '256'],
  ['How many hearts does an octopus have?', '3', '1', '2', '8'],
  ['What is the hardest natural substance?', 'Diamond', 'Gold', 'Quartz', 'Granite'],
  ['Which gas do plants take in from the air?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
  ['Roughly how fast does light travel?', '300,000 km/s', '30,000 km/s', '3,000 km/s', '3,000,000 km/s'],
  ['What is the fastest land animal?', 'Cheetah', 'Lion', 'Horse', 'Greyhound'],
  ['What is the largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
  ['What is the smallest prime number?', '2', '1', '3', '0'],
  ['What is 15% of 200?', '30', '15', '20', '35'],
  ['What is the square root of 144?', '12', '14', '11', '13'],
  ['The angles in a triangle add up to…', '180°', '360°', '90°', '270°'],
  ['How many sides does a hexagon have?', '6', '5', '7', '8'],
  ['How many minutes are there in a day?', '1,440', '1,200', '1,600', '2,400'],
  ['How many hours are there in a week?', '168', '144', '160', '172'],
  ['What is the Roman numeral L?', '50', '100', '5', '500'],
  ['Binary 1010 equals which number?', '10', '5', '12', '8'],
  ['How many days are in February in a leap year?', '29', '28', '30', '27'],
  ['A light-year measures…', 'Distance', 'Time', 'Speed', 'Brightness'],
  ['What are the primary colours of light?', 'Red, green, blue', 'Red, yellow, blue', 'Cyan, magenta, yellow', 'Red, green, yellow'],
  // World
  ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Vincent van Gogh', 'Pablo Picasso'],
  ['Who wrote “Romeo and Juliet”?', 'William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'],
  ['What is the largest hot desert in the world?', 'Sahara', 'Gobi', 'Kalahari', 'Arabian'],
  ['What is the tallest mountain on Earth above sea level?', 'Mount Everest', 'K2', 'Mount Kinabalu', 'Kilimanjaro'],
  ['What is the capital of Japan?', 'Tokyo', 'Osaka', 'Kyoto', 'Hiroshima'],
  ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
  ['What is the capital of Thailand?', 'Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya'],
  ['What is the capital of Turkey?', 'Ankara', 'Istanbul', 'Izmir', 'Antalya'],
  ['What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador'],
  ['What is the capital of South Korea?', 'Seoul', 'Busan', 'Incheon', 'Daegu'],
  ['What is the capital of New Zealand?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown'],
  ['What is the capital of Vietnam?', 'Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hue'],
  ['What is the capital of the Philippines?', 'Manila', 'Cebu', 'Davao', 'Quezon'],
  ['What is the currency of Japan?', 'Yen', 'Won', 'Yuan', 'Ringgit'],
  ['What is the currency of Thailand?', 'Baht', 'Kip', 'Dong', 'Riel'],
  ['What is the currency of Indonesia?', 'Rupiah', 'Rupee', 'Ringgit', 'Peso'],
  ['How many continents are there?', '7', '5', '6', '8'],
  ['Which is the largest country by area?', 'Russia', 'Canada', 'China', 'USA'],
  ['Which country has the largest population (since 2023)?', 'India', 'China', 'USA', 'Indonesia'],
  ['How many players does a football team have on the field?', '11', '10', '9', '12'],
  ['How many rings are on the Olympic flag?', '5', '4', '6', '7'],
  ['How many points win a game of badminton (without deuce)?', '21', '15', '11', '25'],
  ['What does “WWW” stand for?', 'World Wide Web', 'World Web Wide', 'Wide World Web', 'Web World Wide'],
  ['Who co-founded Microsoft with Paul Allen?', 'Bill Gates', 'Steve Jobs', 'Mark Zuckerberg', 'Larry Page'],
  // Work: scanning, construction, safety
  ['What does GPR stand for?', 'Ground Penetrating Radar', 'Global Positioning Radar', 'Ground Pressure Reader', 'General Pulse Receiver'],
  ['GPR sends what kind of waves into the ground or concrete?', 'Electromagnetic (radio) waves', 'Sound waves', 'X-rays', 'Seismic waves'],
  ['GPR signals travel fastest through…', 'Air', 'Water', 'Concrete', 'Wet clay'],
  ['Rebar in concrete is mainly made of…', 'Steel', 'Aluminium', 'Copper', 'Fibreglass'],
  ['Concrete hardens through a chemical reaction called…', 'Hydration', 'Oxidation', 'Evaporation', 'Combustion'],
  ['Concrete strength is usually specified at how many days?', '28', '7', '14', '60'],
  ['What is the SI unit of pressure?', 'Pascal', 'Newton', 'Joule', 'Watt'],
  ['What is the SI unit of force?', 'Newton', 'Pascal', 'Joule', 'Kilogram'],
  ['What is the unit of electrical resistance?', 'Ohm', 'Volt', 'Ampere', 'Watt'],
  ['One inch is how many centimetres?', '2.54 cm', '2.24 cm', '3.00 cm', '2.45 cm'],
  ['Which of these is an electrical insulator?', 'Rubber', 'Copper', 'Aluminium', 'Steel'],
  ['What does PPE stand for?', 'Personal Protective Equipment', 'Personal Project Equipment', 'Protective Personnel Equipment', 'Public Protection Equipment'],
  ['Which body issues the construction worker Green Card (Kad Hijau) in Malaysia?', 'CIDB', 'SOCSO', 'JKR', 'SIRIM'],
  ['DOSH in Malaysia is also known as…', 'JKKP', 'JKR', 'JPJ', 'JPN'],
  ['JKR is Malaysia’s…', 'Public Works Department', 'Road Transport Department', 'Fire Department', 'Drainage Department'],
]

const PER_DAY = 5
const SECONDS = 20

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Small seeded random, so everyone sees the same questions and answer order on the same day
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function questionsFor(key) {
  const day = Math.floor(new Date(`${key}T00:00:00Z`).getTime() / 86400000)
  const rand = seeded(day)
  // Walk the bank in a fixed shuffled order, PER_DAY at a time, so questions don't repeat until the bank runs out
  const order = BANK.map((_, i) => i)
  const shuffle = seeded(20261016)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuffle() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  return Array.from({ length: PER_DAY }, (_, k) => {
    const [text, right, ...wrong] = BANK[order[(day * PER_DAY + k) % order.length]]
    const options = [right, ...wrong]
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]] }
    return { text, options, answer: options.indexOf(right) }
  })
}

export default function Trivia({ onGameOver }) {
  const { memberId } = useAuth()
  const day = todayKey()
  const questions = questionsFor(day)
  const storeKey = `xyte_trivia_${day}_${memberId || 'guest'}`
  const [picks, setPicks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || '[]') } catch { return [] }
  }) // chosen option per question; -1 = ran out of time
  const [reveal, setReveal] = useState(false)
  const [left, setLeft] = useState(SECONDS)
  const [savedElsewhere, setSavedElsewhere] = useState(null)

  const qi = picks.length - (reveal ? 1 : 0)   // question on screen
  const done = picks.length >= PER_DAY && !reveal
  const correct = picks.filter((p, i) => p === questions[i].answer).length

  useEffect(() => {
    playedToday('trivia', memberId).then(row => { if (row && !picks.length) setSavedElsewhere(row.score) }).catch(() => {})
  }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps -- check once when opened

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(picks)) } catch { /* storage unavailable */ }
  }, [picks, storeKey])

  function choose(i) {
    if (reveal || done) return
    const next = [...picks, i]
    setPicks(next)
    setReveal(true)
    setTimeout(() => {
      setReveal(false)
      setLeft(SECONDS)
      if (next.length >= PER_DAY) {
        const score = next.filter((p, k) => p === questions[k].answer).length
        toast(score === PER_DAY ? '🎉 Perfect 5/5!' : `${score} of ${PER_DAY} right · +${score} pts`, { ms: 4000 })
        onGameOver?.(score)
      }
    }, 1300)
  }

  // Countdown for the current question; running out counts as a wrong answer
  useEffect(() => {
    if (done || reveal || savedElsewhere != null) return undefined
    const endAt = Date.now() + SECONDS * 1000
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining === 0) choose(-1)
    }, 200)
    return () => clearInterval(t)
  }, [qi, done, reveal, savedElsewhere]) // eslint-disable-line react-hooks/exhaustive-deps -- restart per question

  if (savedElsewhere != null) {
    return (
      <div className="gm-react" style={{ background: '#1e3a8a' }}>
        <b>Done for today</b>
        <span>You scored {savedElsewhere} of {PER_DAY} on today’s trivia. New questions come at midnight.</span>
      </div>
    )
  }

  if (done) {
    return (
      <div className="gm-trivia">
        <div className="gm-wdone">
          <b>{correct === PER_DAY ? '🎉 Perfect!' : `${correct} of ${PER_DAY} right`} · +{correct} pts</b>
          <span>New questions at midnight — same five for the whole team.</span>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="gm-tq-review">
            <span>{picks[i] === q.answer ? '✅' : '❌'}</span>
            <div><b>{q.text}</b><small>{q.options[q.answer]}</small></div>
          </div>
        ))}
      </div>
    )
  }

  const q = questions[qi]
  const picked = reveal ? picks[qi] : null

  return (
    <div className="gm-trivia">
      <div className="gm-bar">
        <div className="gm-stat dark"><small>Question</small><b>{qi + 1}/{PER_DAY}</b></div>
        <div className="gm-stat dark"><small>Time</small><b style={{ color: left <= 5 ? '#fca5a5' : undefined }}>{left}s</b></div>
        <div className="gm-stat dark"><small>Right</small><b>{picks.slice(0, qi).filter((p, i) => p === questions[i].answer).length}</b></div>
      </div>
      <div className="gm-tq">{q.text}</div>
      <div className="gm-topts">
        {q.options.map((opt, i) => {
          const cls = reveal ? (i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim') : ''
          return <button key={opt} className={cls} onClick={() => choose(i)} disabled={reveal}>{opt}</button>
        })}
      </div>
      {reveal && picked === -1 && <p className="mk-sub" style={{ textAlign: 'center' }}>Time’s up!</p>}
    </div>
  )
}
