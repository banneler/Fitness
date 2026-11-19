import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai"
import { corsHeaders, requireUser } from "../_shared/require-user.ts"

const systemPrompt = `
You are the BA Fitness coach, a world-class bio-hacker and performance coach. 
Your goal is to analyze the user's "Performance Intelligence" data and provide a high-agency executive briefing.

TONE: 
Cyberpunk, high-agency, scientific, and elite. Use terms like "Growth Vectors," "Neural Fuel," "Load Velocity," and "System Recovery."

DATA ARCHITECTURE:
- daily_metrics: weight trends, resting heart rate, sleep quality, and energy levels.
- workout_logs: tonnage (weight x reps), Time Under Load (TUL), and set volume.
- food_logs: macro-nutrient compliance (Protein/Carbs/Fats) vs targets.

OUTPUT PROTOCOL (Strict JSON Format):
{
  "summary": "A 2-3 sentence high-level analysis of the last 7 days. Focus on the 'Why' behind the data.",
  "encouragement": "One 'Neural Boost'—a hyper-specific win found in the data (e.g., 'Load Velocity on Squats increased by 12%').",
  "prediction": "A data-driven forecast for the next 72-120 hours regarding strength or body composition.",
  "advice": "One 'Growth Vector'—a specific technical adjustment to Nutrition, Recovery, or Loading."
}`;

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
      generationConfig: { responseMimeType: "application/json" }
    })

    // 3. Gather Intelligence (Last 7 Days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [workouts, nutrition, biometrics] = await Promise.all([
      client.from('workout_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      client.from('food_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      client.from('daily_metrics').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo).order('created_at', {ascending: false})
    ])

    const context = {
      workout_history: workouts.data?.map(w => ({ date: w.created_at, routine: w.protocol_name, sets: w.sets_data })),
      nutrition_logs: nutrition.data,
      latest_biometrics: biometrics.data?.[0],
      weight_trend: biometrics.data?.map(b => ({ date: b.created_at, weight: b.weight }))
    }

    // 4. Generate Analysis
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Analyze current Performance Intelligence Context: ${JSON.stringify(context)}` }
    ])

    const response = await result.response;
    const text = response.text();

    if (!text) throw new Error("Neural Engine returned empty payload.");

    return new Response(text, { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      } 
    })

  } catch (err) {
    console.error("Neural Engine Crash:", err.message)
    
    const fallback = {
      "summary": "Neural link unstable. Data ingestion incomplete due to system latency.",
      "encouragement": "Maintain standard loading protocols. Registry active.",
      "prediction": "Recalibrating projection vectors...",
      "advice": "Verify telemetry stream and API secrets."
    }
    
    return new Response(JSON.stringify(fallback), { 
      headers: { "Content-Type": "application/json", 'Access-Control-Allow-Origin': '*' },
      status: 200 
    })
  }
})