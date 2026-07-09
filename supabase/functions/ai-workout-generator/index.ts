// supabase/functions/ai-workout-generator/index.ts

// 1. PINNED IMPORT (This fixes the bundling error)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()
    if (!user_id) throw new Error("Missing user_id in request body")

    // 2. INIT SUPABASE (Service Role needed to read other tables)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. FETCH CONTEXT
    const [logsResponse, libraryResponse] = await Promise.all([
      // Get fatigue context
      supabase.from('workout_logs')
        .select('exercise_name, created_at, sets_data')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(20),
      
      // Get available equipment/exercises
      supabase.from('exercises')
        .select('id, name, muscle_group')
        // Only get exercises this user has access to (Global + Theirs) or just theirs depending on your RLS
        .or(`user_id.eq.${user_id},user_id.is.null`) 
    ])

    const recentLogs = logsResponse.data || []
    const library = libraryResponse.data || []

    if (library.length === 0) throw new Error("Exercise library is empty.")

    // 4. CONSTRUCT PROMPT
    const prompt = `
      ACT AS AN ELITE STRENGTH COACH.
      
      TASK:
      Create a "Gap Filler" workout.
      1. Analyze the HISTORY to see what is fatigued (ignore those muscles).
      2. Analyze the LIBRARY to see what is available.
      3. Select 4-5 exercises for FRESH/NEGLECTED muscles.
      
      CONTEXT:
      - LIBRARY: ${JSON.stringify(library.map(e => ({id: e.id, name: e.name, group: e.muscle_group})))}
      - RECENT HISTORY: ${JSON.stringify(recentLogs.map(l => l.exercise_name))}

      OUTPUT JSON (NO MARKDOWN):
      {
        "name": "Short Creative Title",
        "icon_name": "dumbbell", 
        "exercise_order": ["id_1", "id_2", "id_3", "id_4"]
      }
    `

    // 5. CALL GEMINI
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash';
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    )

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      throw new Error(`Gemini API Error: ${errText}`)
    }

    const aiJson = await aiResponse.json()
    const rawText = aiJson.candidates[0].content.parts[0].text
    
    // Clean potential markdown
    const cleanText = rawText.replace(/```json|```/g, '').trim()
    const workoutPlan = JSON.parse(cleanText)

    return new Response(JSON.stringify(workoutPlan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error("Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})