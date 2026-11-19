import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFacts, coachFallback, parseCoachReply } from './facts.ts'

test('groups a session, names the lifts, and compares a repeated exercise', () => {
  const facts = buildFacts({
    workouts: [
      {
        created_at: '2026-11-17T15:00:00.000Z',
        protocol_name: 'Chest and Arms',
        exercise_name: 'Bench Press',
        session_id: 's1',
        duration_seconds: 3000,
        sets_data: [
          { weight: 185, reps: 8 },
          { weight: 185, reps: 6, failure: true },
        ],
      },
      {
        created_at: '2026-11-17T15:00:05.000Z',
        protocol_name: 'Chest and Arms',
        exercise_name: 'DB Press',
        session_id: 's1',
        duration_seconds: 3000,
        sets_data: [{ weight: '60', reps: '10' }],
      },
      {
        created_at: '2026-11-19T15:00:00.000Z',
        protocol_name: 'Chest and Arms',
        exercise_name: 'Bench Press',
        session_id: 's2',
        sets_data: [{ weight: 195, reps: 5 }, { weight: 205, reps: 1, done: false }],
      },
      {
        created_at: '2026-11-18T18:00:00.000Z',
        protocol_name: 'Easy Day',
        exercise_name: 'Walk',
        session_id: 's3',
        is_recovery: 'true',
        sets_data: [{ weight: 0, reps: 20 }],
      },
    ],
    meals: null,
    checkins: null,
  })

  assert.equal(facts.sessions.length, 3)
  assert.deepEqual(
    facts.sessions.map((session) => session.name),
    ['Chest and Arms', 'Easy Day', 'Chest and Arms']
  )
  const chest = facts.sessions[0]
  assert.equal(chest.date, 'Nov 17')
  assert.equal(chest.minutes, 50)
  assert.equal(chest.recovery, false)
  assert.equal(chest.total_pounds, 185 * 8 + 185 * 6 + 60 * 10)
  assert.deepEqual(chest.exercises[0].sets, ['185 lb x 8', '185 lb x 6 (failed)'])
  assert.equal(chest.exercises[0].best_set.label, '185 lb x 8')
  assert.equal(facts.sessions[1].recovery, true)
  assert.equal(facts.sessions[1].exercises[0].sets[0], 'bodyweight x 20')
  assert.equal(facts.sessions[1].total_pounds, undefined)
  assert.equal(facts.lifts_repeated.length, 1)
  assert.equal(facts.lifts_repeated[0].exercise, 'Bench Press')
  assert.equal(facts.lifts_repeated[0].earlier.label, '185 lb x 8')
  assert.equal(facts.lifts_repeated[0].later.weight_lb, 195)
  assert.equal(JSON.stringify(facts).includes('user_id'), false)
  assert.ok(facts.gaps.includes('no meals logged'))
  assert.ok(facts.gaps.includes('no body weight logged'))
})

test('legacy rows without a session id group by workout name and minute', () => {
  const facts = buildFacts({
    workouts: [
      {
        created_at: '2026-11-12T14:01:02.000Z',
        protocol_name: 'Pull',
        exercise_name: 'Row',
        sets_data: [{ weight: 155, reps: 10 }],
      },
      {
        created_at: '2026-11-12T14:01:40.000Z',
        protocol_name: 'Pull',
        exercise_name: 'Pull-up',
        sets_data: [{ weight: 0, reps: 8 }],
      },
      {
        created_at: '2026-11-12T16:10:00.000Z',
        protocol_name: 'Pull',
        exercise_name: 'Row',
        sets_data: [{ weight: 165, reps: 8 }],
      },
    ],
    meals: [],
    checkins: [],
  })

  assert.equal(facts.sessions.length, 2)
  assert.equal(facts.sessions[0].exercises.length, 2)
  assert.equal(facts.lifts_repeated[0].earlier.weight_lb, 155)
  assert.equal(facts.lifts_repeated[0].later.weight_lb, 165)
})

test('sums meals, converts water, and only trends weight when there are two weigh-ins', () => {
  const facts = buildFacts({
    workouts: [],
    meals: [
      { created_at: '2026-11-18T12:00:00.000Z', food_name: 'Chicken rice', calories: 700, protein: 50, carbs: 60, fat: 15 },
      { created_at: '2026-11-18T18:00:00.000Z', food_name: 'chicken rice', calories: 300, protein: 20, carbs: 10, fat: 5 },
      { created_at: '2026-11-19T12:00:00.000Z', food_name: 'Whey', calories: 150, protein: 30, carbs: 5, fat: 2 },
    ],
    checkins: [
      { created_at: '2026-11-18T08:00:00.000Z', weight: 198.4, sleep_quality: 7.5, energy_level: 8, water_intake: 0, target_protein: 180 },
      { created_at: '2026-11-19T08:00:00.000Z', weight: 197.3, sleep_quality: 6, energy_level: 5, water_intake: 4, resting_hr: 58, target_protein: 180, target_calories: 2500 },
    ],
  })

  assert.equal(facts.meals.days_logged, 2)
  assert.equal(facts.meals.days[0].protein_g, 70)
  assert.deepEqual(facts.meals.days[0].foods, ['Chicken rice'])
  assert.equal(facts.meals.week_totals.protein_g, 100)
  assert.equal(facts.targets.protein_g, 180)
  assert.equal(facts.targets.calories, 2500)
  assert.equal(facts.checkins[1].water_oz, 64)
  assert.equal(facts.checkins[0].water_oz, undefined)
  assert.equal(facts.weight.change_lb, -1.1)
  assert.equal(facts.weight.start_lb, 198.4)
  assert.equal(facts.weight.latest_lb, 197.3)
  assert.equal(facts.gaps.includes('no water logged'), false)
  assert.ok(facts.gaps.includes('no workouts logged'))
})

test('one weigh-in is not a trend, and a failed read is not an empty week', () => {
  const single = buildFacts({
    workouts: [],
    meals: [],
    checkins: [{ created_at: '2026-11-18T08:00:00.000Z', weight: 197.3 }],
  })
  assert.equal(single.weight.weigh_ins, 1)
  assert.equal(single.weight.change_lb, null)

  const failed = buildFacts({
    workouts: null,
    meals: null,
    checkins: null,
    workoutsFailed: true,
    mealsFailed: true,
    checkinsFailed: true,
  })
  assert.deepEqual(failed.sessions, [])
  assert.equal(failed.meals, null)
  assert.ok(failed.gaps.some((gap) => gap.includes('do not say they skipped training')))
  assert.ok(failed.gaps.some((gap) => gap.includes('do not say they skipped eating')))
  assert.equal(failed.gaps.includes('no workouts logged'), false)
})

test('parse keeps the four card fields and drops anything else', () => {
  const parsed = parseCoachReply('```json\n{"summary":"Three days in.","encouragement":"Bench moved.","prediction":"Legs may feel heavy.","advice":"Log water.","secret":"nope"}\n```')
  assert.deepEqual(parsed, {
    summary: 'Three days in.',
    encouragement: 'Bench moved.',
    prediction: 'Legs may feel heavy.',
    advice: 'Log water.',
  })
  assert.equal(parseCoachReply('{"prediction":"x","advice":"y"}'), null)
  assert.equal(parseCoachReply('not json'), null)
  const fallback = coachFallback()
  assert.equal(typeof fallback.summary, 'string')
  assert.equal(fallback.summary.toLowerCase().includes('neural'), false)
  assert.equal(fallback.advice.toLowerCase().includes('vector'), false)
})
