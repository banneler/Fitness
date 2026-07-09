import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ICONS = new Set([
  'dumbbell', 'biceps-flexed', 'weight', 'disc', 'anchor', 'sword', 'shield',
  'arrow-up-circle', 'arrow-down-circle', 'move', 'layers', 'columns-2',
  'footprints', 'bike', 'waves', 'zap', 'activity', 'trophy', 'sparkles'
]);

type LibraryEntry = { id: string; name: string; muscle_group?: string | null };

type WorkoutExercise = {
  exercise_id: string;
  name: string;
  muscle_group: string | null;
};

function cleanId(raw: unknown): string | null {
  if (raw == null || raw === '' || raw === 'null') return null;
  return String(raw).trim() || null;
}

function normalizeExercises(
  raw: WorkoutExercise[],
  libraryMap: Map<string, LibraryEntry>
): WorkoutExercise[] {
  const seen = new Set<string>();
  const out: WorkoutExercise[] = [];

  for (const row of raw || []) {
    const id = cleanId(row.exercise_id);
    if (!id || seen.has(id)) continue;
    const lib = libraryMap.get(id);
    if (!lib) continue;
    seen.add(id);
    out.push({
      exercise_id: id,
      name: lib.name,
      muscle_group: lib.muscle_group || row.muscle_group || null
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, library, target_muscles, user_prompt } = await req.json();
    if (!user_id) throw new Error('Missing user_id in request body');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let libraryEntries: LibraryEntry[] = [];
    if (library?.length) {
      libraryEntries = library.map((e: LibraryEntry) => ({
        id: String(e.id),
        name: e.name,
        muscle_group: e.muscle_group ?? null
      }));
    } else {
      const { data } = await supabase.from('exercises').select('id, name, muscle_group')
        .or(`user_id.eq.${user_id},user_id.is.null`);
      libraryEntries = (data || []).map((e: LibraryEntry) => ({
        id: String(e.id),
        name: e.name,
        muscle_group: e.muscle_group ?? null
      }));
    }

    if (!libraryEntries.length) throw new Error('Exercise library is empty.');

    const libraryMap = new Map(libraryEntries.map(e => [e.id, e]));
    const targets = Array.isArray(target_muscles)
      ? target_muscles.filter((m: string) => typeof m === 'string' && m.trim())
      : [];
    const hasTargets = targets.length > 0;
    const promptNote = (user_prompt || '').trim();

    const { data: recentLogs } = await supabase.from('workout_logs')
      .select('exercise_name, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(30);

    const eligible = hasTargets
      ? libraryEntries.filter(e => targets.includes(e.muscle_group || ''))
      : libraryEntries;

    if (!eligible.length) {
      throw new Error(hasTargets
        ? `No exercises in your library for: ${targets.join(', ')}`
        : 'Exercise library is empty.');
    }

    const compactLibrary = eligible.map(e => `${e.id}|${e.name}|${e.muscle_group || ''}`).join('\n');
    const recentNames = (recentLogs || []).map(l => l.exercise_name).slice(0, 20);

    const modeBlock = hasTargets
      ? `TARGET MODE — user chose these muscle groups ONLY: ${targets.join(', ')}.
Select 4-6 exercises exclusively from muscles in this list. Do NOT add exercises outside these groups even if other muscles are fresh.`
      : `AUTO MODE — gap filler based on recovery.
Avoid muscles heavily represented in RECENT HISTORY. Prefer fresh/cold muscle groups. Select 4-5 exercises.`;

    const prompt = `
ACT AS AN ELITE STRENGTH COACH building a one-off workout protocol.

${modeBlock}

${promptNote ? `USER NOTES (follow closely): ${promptNote}` : ''}

ELIGIBLE EXERCISES — each line is "uuid|Name|MuscleGroup". ONLY use these uuids:
${compactLibrary}

RECENT HISTORY (avoid overloading these if in auto mode): ${JSON.stringify(recentNames)}

Return JSON:
{
  "name": "Short creative protocol title",
  "icon_name": "dumbbell",
  "exercises": [
    { "exercise_id": "uuid", "name": "Exercise Name", "muscle_group": "Muscle" }
  ]
}

Rules:
- exercise_id MUST be an exact uuid from the eligible list. Never invent ids.
- Order exercises logically for the session (compounds before isolation when sensible).
- icon_name: one of dumbbell, sparkles, zap, activity, trophy, biceps-flexed, footprints.
`;

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error('GEMINI_API_KEY is not set.');

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash';
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                icon_name: { type: 'STRING' },
                exercises: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      exercise_id: { type: 'STRING' },
                      name: { type: 'STRING' },
                      muscle_group: { type: 'STRING' }
                    },
                    required: ['exercise_id', 'name']
                  }
                }
              },
              required: ['name', 'exercises']
            }
          }
        })
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`Gemini API error (${aiResponse.status}): ${errText.slice(0, 500)}`);
    }

    const aiJson = await aiResponse.json();
    const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI returned empty response');

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const exercises = normalizeExercises(parsed.exercises || [], libraryMap);

    if (!exercises.length) throw new Error('AI did not return valid exercises from your library.');

    let icon_name = String(parsed.icon_name || 'sparkles').trim();
    if (!VALID_ICONS.has(icon_name)) icon_name = 'sparkles';

    return new Response(JSON.stringify({
      name: String(parsed.name || 'AI Protocol').trim() || 'AI Protocol',
      icon_name,
      exercises,
      exercise_order: exercises.map(e => e.exercise_id),
      mode: hasTargets ? 'targeted' : 'auto',
      target_muscles: targets
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Function Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
