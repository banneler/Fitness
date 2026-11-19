import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai"
import { jsonResponse, requireUser } from "../_shared/require-user.ts"
import { buildFacts, coachFallback, parseCoachReply } from "./facts.ts"

const systemPrompt = `
You write the short recap on the Tracker page for a lifter looking at their own last 7 days.

Voice: a knowledgeable, upbeat gym buddy. Plain everyday words. Short sentences. Warm and direct. Sound like someone who lifts and can read a log, not like a lab report or a sci-fi briefing.

The phone shows four fields:
- summary: the "This Week" paragraph. 2 or 3 sentences. Never more than 3.
- prediction: the "What to Expect" card. Exactly one short sentence.
- advice: the "Next Move" card. Exactly one short sentence.
- encouragement: stored, not shown on the card. Exactly one short sentence naming a real win. If nothing stands out, mention a real session they completed.

Rules:
- Use only the facts in the next message. Name the real workout names, exercise names, and numbers that appear there.
- If a number, name, or trend is not in the facts, leave it out. Do not estimate, round into a new figure, or fill a gap with a typical value.
- Do not invent percentages, body-weight targets, clock times, or forecasts like "in 48 hours" or "at hour 96".
- Do not diagnose and do not predict medical issues. Never say load velocity, mechanical tension, muscular edema, CNS fatigue, supercompensation, intra-cellular fluid, neural fuel, growth vector, system recovery, biohacking, or executive briefing.
- Dates are UTC calendar dates. Weights are pounds. Sleep is hours, not a score. Energy is out of 10. Water is ounces. A set marked "(failed)" means they flagged that set as a miss.
- weight.change_lb is the scale change across this window. Mention it only when change_lb is a number. One weigh-in is not a trend.
- lifts_repeated compares the best set of an exercise the first time it showed up this week with the last time. Say it went up or down only when those weight or rep numbers actually differ. Do not call anything a personal record. You do not have history before these 7 days.
- recovery: true means an easier day. Do not treat it as a max-effort session.
- Meals only cover days they logged. Do not treat a missing day as zero food. If targets are present, you may compare a logged day with that target.
- gaps lists what was not logged or could not be loaded. If a gap says logs could not be loaded, do not claim the person skipped that thing. If something simply was not logged, you may say so in plain words ("no meals logged") and use that for the one next step when it is the obvious move.
- prediction is a grounded expectation, such as sore legs the day after squats. If the facts are too thin to say that honestly, say you need a few more logs before calling it.
- advice is one concrete next step tied to the facts (repeat a weight that moved well, log water, add protein on days that came in under target).

Voice example only. Do not reuse these workouts or numbers unless the facts contain them:
{"summary":"You trained three days: Push, Legs, and Pull. Bench held 185 for 8. Body weight went from 198.4 to 197.3.","encouragement":"Squats at 225 for 5, three sets, is the best lift you logged.","prediction":"Legs may feel heavy tomorrow after that squat day.","advice":"Add one high-protein meal on days that came in under your 180g target."}

Return only JSON with exactly these string keys: summary, encouragement, prediction, advice.
`.trim()

Deno.serve(async (req) => {
  // 1. Handle CORS Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    // Identity comes from the caller's JWT. A user id in the body is ignored.
    const auth = await requireUser(req)
    if ('response' in auth) return auth.response
    const { user, client } = auth
    const user_id = user.id

    const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
    const model = genAI.getGenerativeModel({
      model: Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash',
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
    })

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [workouts, nutrition, biometrics] = await Promise.all([
      client.from('workout_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      client.from('food_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      client.from('daily_metrics').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false })
    ])

    if (workouts.error) console.error('workout_logs:', workouts.error.message)
    if (nutrition.error) console.error('food_logs:', nutrition.error.message)
    if (biometrics.error) console.error('daily_metrics:', biometrics.error.message)

    const facts = buildFacts({
      workouts: workouts.data,
      meals: nutrition.data,
      checkins: biometrics.data,
      workoutsFailed: !!workouts.error,
      mealsFailed: !!nutrition.error,
      checkinsFailed: !!biometrics.error,
    })

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `These are the only facts you may use. If a value is missing, it was not logged. Do not add numbers that are not here.\n\n${JSON.stringify(facts)}` }
    ])

    const response = await result.response
    const text = response.text()
    const reply = parseCoachReply(text || '')
    if (!reply) throw new Error('Coach summary was empty or not valid JSON.')

    return jsonResponse(reply)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Coach summary failed:', message)
    return jsonResponse(coachFallback())
  }
})
