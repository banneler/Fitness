// Turns the last 7 days of logs into a short fact sheet for the coach prompt.
// Only numbers computed here may be quoted back to the lifter.

export type WorkoutRow = {
  created_at?: string | null
  protocol_name?: string | null
  exercise_name?: string | null
  sets_data?: unknown
  session_id?: string | null
  is_recovery?: boolean | string | number | null
  duration_seconds?: number | string | null
}

export type FoodRow = {
  created_at?: string | null
  food_name?: string | null
  calories?: number | string | null
  protein?: number | string | null
  carbs?: number | string | null
  fat?: number | string | null
}

export type MetricRow = {
  created_at?: string | null
  weight?: number | string | null
  resting_hr?: number | string | null
  sleep_quality?: number | string | null
  energy_level?: number | string | null
  water_intake?: number | string | null
  target_calories?: number | string | null
  target_protein?: number | string | null
  target_carbs?: number | string | null
  target_fat?: number | string | null
}

export type FactsInput = {
  workouts: WorkoutRow[] | null
  meals: FoodRow[] | null
  checkins: MetricRow[] | null
  workoutsFailed?: boolean
  mealsFailed?: boolean
  checkinsFailed?: boolean
}

export type CoachReply = {
  summary: string
  encouragement: string
  prediction: string
  advice: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function positive(value: unknown): number | null {
  const n = asNumber(value)
  if (n == null || n <= 0) return null
  return n
}

function trimNum(n: number): string {
  const rounded = Math.round(n * 10) / 10
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded))
  return rounded.toFixed(1)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function labelDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function timeOf(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function asSets(raw: unknown): Array<Record<string, unknown>> {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((set) => set && typeof set === 'object') as Array<Record<string, unknown>>
}

function isRecovery(value: WorkoutRow['is_recovery']): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

type BestSet = { label: string; weight_lb: number | null; reps: number | null }

function formatSet(set: Record<string, unknown>): { label: string; weight: number; reps: number; load: number } | null {
  if (set.done === false || set.done === 'false') return null
  const weight = asNumber(set.weight)
  const reps = asNumber(set.reps)
  if ((weight == null || weight <= 0) && (reps == null || reps <= 0)) return null
  const failed = set.failure === true || set.failure === 'true' || set.failure === 1
  const fail = failed ? ' (failed)' : ''
  if (weight == null || weight <= 0) {
    return { label: `bodyweight x ${trimNum(reps as number)}${fail}`, weight: 0, reps: reps as number, load: 0 }
  }
  if (reps == null || reps <= 0) {
    return { label: `${trimNum(weight)} lb${fail}`, weight, reps: 0, load: 0 }
  }
  return {
    label: `${trimNum(weight)} lb x ${trimNum(reps)}${fail}`,
    weight,
    reps,
    load: weight * reps,
  }
}

function toBest(set: { label: string; weight: number; reps: number } | null): BestSet | null {
  if (!set) return null
  return {
    label: set.label.replace(' (failed)', ''),
    weight_lb: set.weight > 0 ? round1(set.weight) : null,
    reps: set.reps > 0 ? round1(set.reps) : null,
  }
}

function betterSet(
  a: { weight: number; reps: number },
  b: { weight: number; reps: number }
): boolean {
  if (a.weight !== b.weight) return a.weight > b.weight
  return a.reps > b.reps
}

type ExerciseAcc = {
  name: string
  sets: string[]
  omitted: number
  bestRaw: { label: string; weight: number; reps: number } | null
  load: number
}

type SessionAcc = {
  key: string
  time: number
  date: string
  name: string
  recovery: boolean
  seconds: number
  exercises: Map<string, ExerciseAcc>
}

function sessionKey(row: WorkoutRow): string {
  if (row.session_id) return `id:${row.session_id}`
  const minute = String(row.created_at || '').slice(0, 16)
  return `legacy:${(row.protocol_name || '').trim()}|${minute}`
}

function buildSessions(rows: WorkoutRow[]) {
  const sessions = new Map<string, SessionAcc>()
  const ordered: SessionAcc[] = []

  for (const row of rows) {
    const sets = asSets(row.sets_data).map(formatSet).filter((set): set is NonNullable<typeof set> => !!set)
    if (!sets.length) continue
    const key = sessionKey(row)
    let session = sessions.get(key)
    if (!session) {
      session = {
        key,
        time: timeOf(row.created_at),
        date: labelDate(row.created_at),
        name: (row.protocol_name || '').trim() || 'Workout',
        recovery: false,
        seconds: 0,
        exercises: new Map(),
      }
      sessions.set(key, session)
      ordered.push(session)
    }
    if (isRecovery(row.is_recovery)) session.recovery = true
    const seconds = positive(row.duration_seconds)
    if (seconds != null) session.seconds = Math.max(session.seconds, seconds)
    const rowTime = timeOf(row.created_at)
    if (rowTime && (session.time === 0 || rowTime < session.time)) {
      session.time = rowTime
      session.date = labelDate(row.created_at) || session.date
    }

    const name = (row.exercise_name || '').trim() || 'Exercise'
    let exercise = session.exercises.get(name)
    if (!exercise) {
      exercise = { name, sets: [], omitted: 0, bestRaw: null, load: 0 }
      session.exercises.set(name, exercise)
    }
    for (const set of sets) {
      exercise.load += set.load
      if (!exercise.bestRaw || betterSet(set, exercise.bestRaw)) exercise.bestRaw = set
      if (exercise.sets.length < 8) exercise.sets.push(set.label)
      else exercise.omitted += 1
    }
  }

  ordered.sort((a, b) => a.time - b.time)

  const sessionFacts = ordered.map((session) => {
    const exercises = [...session.exercises.values()].map((exercise) => {
      const fact: Record<string, unknown> = {
        name: exercise.name,
        sets: exercise.sets,
      }
      const best = toBest(exercise.bestRaw)
      if (best) fact.best_set = best
      if (exercise.omitted > 0) fact.more_sets = exercise.omitted
      return fact
    })
    const total = [...session.exercises.values()].reduce((sum, exercise) => sum + exercise.load, 0)
    const fact: Record<string, unknown> = {
      date: session.date,
      name: session.name,
      recovery: session.recovery,
      exercises,
    }
    if (session.seconds > 0) fact.minutes = Math.round(session.seconds / 60)
    if (total > 0) fact.total_pounds = Math.round(total)
    return fact
  })

  const appearances = new Map<string, Array<{ date: string; time: number; best: BestSet }>>()
  for (const session of ordered) {
    for (const exercise of session.exercises.values()) {
      const best = toBest(exercise.bestRaw)
      if (!best) continue
      const list = appearances.get(exercise.name) || []
      list.push({ date: session.date, time: session.time, best })
      appearances.set(exercise.name, list)
    }
  }

  const liftsRepeated = [...appearances.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([exercise, list]) => {
      const earlier = list[0]
      const later = list[list.length - 1]
      return {
        exercise,
        earlier: { date: earlier.date, ...earlier.best },
        later: { date: later.date, ...later.best },
      }
    })

  return { sessions: sessionFacts, liftsRepeated }
}

function buildMeals(rows: FoodRow[]) {
  const byDay = new Map<string, { time: number; date: string; calories: number; protein: number; carbs: number; fat: number; foods: string[]; seen: Set<string> }>()
  for (const row of rows) {
    const date = labelDate(row.created_at)
    if (!date) continue
    let day = byDay.get(date)
    if (!day) {
      day = { time: timeOf(row.created_at), date, calories: 0, protein: 0, carbs: 0, fat: 0, foods: [], seen: new Set() }
      byDay.set(date, day)
    }
    day.calories += asNumber(row.calories) ?? 0
    day.protein += asNumber(row.protein) ?? 0
    day.carbs += asNumber(row.carbs) ?? 0
    day.fat += asNumber(row.fat) ?? 0
    const name = (row.food_name || '').trim()
    const key = name.toLowerCase()
    if (name && !day.seen.has(key)) {
      day.seen.add(key)
      if (day.foods.length < 8) day.foods.push(name)
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.time - b.time)
  if (!days.length) return null

  const week = days.reduce(
    (sum, day) => {
      sum.calories += day.calories
      sum.protein_g += day.protein
      sum.carbs_g += day.carbs
      sum.fat_g += day.fat
      return sum
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  return {
    days_logged: days.length,
    days: days.map((day) => ({
      date: day.date,
      calories: Math.round(day.calories),
      protein_g: Math.round(day.protein),
      carbs_g: Math.round(day.carbs),
      fat_g: Math.round(day.fat),
      foods: day.foods,
    })),
    week_totals: {
      calories: Math.round(week.calories),
      protein_g: Math.round(week.protein_g),
      carbs_g: Math.round(week.carbs_g),
      fat_g: Math.round(week.fat_g),
    },
  }
}

function buildCheckins(rows: MetricRow[]) {
  const sorted = [...rows].sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))
  const checkins = []
  for (const row of sorted) {
    const date = labelDate(row.created_at)
    if (!date) continue
    const fact: Record<string, unknown> = { date }
    const weight = positive(row.weight)
    const sleep = positive(row.sleep_quality)
    const energy = positive(row.energy_level)
    const hr = positive(row.resting_hr)
    const water = positive(row.water_intake)
    if (weight != null) fact.weight_lb = round1(weight)
    if (sleep != null) fact.sleep_hours = round1(sleep)
    if (energy != null) fact.energy_out_of_10 = round1(energy)
    if (hr != null) fact.resting_hr = Math.round(hr)
    if (water != null) fact.water_oz = Math.round(water * 16)
    if (Object.keys(fact).length > 1) checkins.push(fact)
  }

  const weighed = checkins.filter((row) => typeof row.weight_lb === 'number')
  let weight: Record<string, unknown> | null = null
  if (weighed.length) {
    const first = weighed[0]
    const last = weighed[weighed.length - 1]
    weight = {
      weigh_ins: weighed.length,
      start_date: first.date,
      start_lb: first.weight_lb,
      latest_date: last.date,
      latest_lb: last.weight_lb,
      change_lb: weighed.length >= 2 ? round1((last.weight_lb as number) - (first.weight_lb as number)) : null,
    }
  }

  let targets: Record<string, number> | null = null
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i]
    const calories = positive(row.target_calories)
    const protein = positive(row.target_protein)
    const carbs = positive(row.target_carbs)
    const fat = positive(row.target_fat)
    if (calories == null && protein == null && carbs == null && fat == null) continue
    targets = {}
    if (calories != null) targets.calories = Math.round(calories)
    if (protein != null) targets.protein_g = Math.round(protein)
    if (carbs != null) targets.carbs_g = Math.round(carbs)
    if (fat != null) targets.fat_g = Math.round(fat)
    break
  }

  return { checkins, weight, targets }
}

export function buildFacts(input: FactsInput) {
  const workouts = input.workouts || []
  const meals = input.meals || []
  const checkins = input.checkins || []
  const { sessions, liftsRepeated } = input.workoutsFailed ? { sessions: [], liftsRepeated: [] } : buildSessions(workouts)
  const mealFacts = input.mealsFailed ? null : buildMeals(meals)
  const checkinFacts = input.checkinsFailed
    ? { checkins: [], weight: null, targets: null }
    : buildCheckins(checkins)

  const gaps: string[] = []
  if (input.workoutsFailed) gaps.push('workout logs could not be loaded; do not say they skipped training')
  else if (!sessions.length) gaps.push('no workouts logged')
  if (input.mealsFailed) gaps.push('meals could not be loaded; do not say they skipped eating')
  else if (!mealFacts) gaps.push('no meals logged')
  if (input.checkinsFailed) gaps.push('check-ins could not be loaded; do not invent weight, sleep, energy, or water')
  else {
    if (!checkinFacts.weight) gaps.push('no body weight logged')
    if (!checkinFacts.checkins.some((row) => row.sleep_hours != null)) gaps.push('no sleep logged')
    if (!checkinFacts.checkins.some((row) => row.water_oz != null)) gaps.push('no water logged')
    if (!checkinFacts.checkins.some((row) => row.energy_out_of_10 != null)) gaps.push('no energy logged')
  }

  return {
    window: 'last 7 days',
    dates_are: 'UTC calendar dates',
    units: {
      weight: 'pounds',
      sleep: 'hours',
      energy: 'out of 10',
      water: 'ounces',
      load: 'pounds times reps',
    },
    sessions,
    lifts_repeated: liftsRepeated,
    meals: mealFacts,
    targets: checkinFacts.targets,
    checkins: checkinFacts.checkins,
    weight: checkinFacts.weight,
    gaps,
  }
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function parseCoachReply(raw: string): CoachReply | null {
  if (!raw || typeof raw !== 'string') return null
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const summary = asText(obj.summary)
  const prediction = asText(obj.prediction)
  const advice = asText(obj.advice)
  if (!summary || !prediction || !advice) return null
  return {
    summary,
    encouragement: asText(obj.encouragement),
    prediction,
    advice,
  }
}

export function coachFallback(): CoachReply {
  return {
    summary: "I couldn't read your week just now. Hit the button again in a minute.",
    encouragement: 'Your logs are still saved.',
    prediction: 'Nothing to call until this recap loads.',
    advice: 'Try again in a moment.',
  }
}
