import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai"

const systemPrompt = `
You are the CONSTELLATION Neural Analyst, a world-class bio-hacker and performance coach. 
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
    // 2. Validate Request Body
    const body = await req.json().catch(() => null);
    if (!body || !body.user_id) {
      throw new Error("Invalid request: missing user_id");
    }
    const { user_id } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    })

    // 3. Gather Intelligence (Last 7 Days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [workouts, nutrition, biometrics] = await Promise.all([
      supabase.from('workout_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      supabase.from('food_logs').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo),
      supabase.from('daily_metrics').select('*').eq('user_id', user_id).gte('created_at', sevenDaysAgo).order('created_at', {ascending: false})
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
        'Access-Control-Allow-Origin': '*' 
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