import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Quads', 'Hamstrings', 'Glutes', 'Hips', 'Calves', 'Cardio'
];

const MATCH_THRESHOLD = 0.82;

type LibraryEntry = { id: string; name: string; muscle_group?: string | null };

type ImportItem = {
  label: string;
  status: 'matched' | 'fuzzy' | 'unmatched';
  exercise_id: string | null;
  confidence: number;
  muscle_group: string | null;
};

function normalizeStatus(item: ImportItem, libraryIds: Set<string>): ImportItem {
  let status = item.status;
  let exercise_id = item.exercise_id != null ? String(item.exercise_id) : null;
  let confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));

  if (exercise_id && !libraryIds.has(exercise_id)) {
    exercise_id = null;
    status = 'unmatched';
    confidence = 0;
  }

  if (status === 'matched' && confidence < MATCH_THRESHOLD) {
    status = exercise_id != null ? 'fuzzy' : 'unmatched';
  }

  if (status === 'fuzzy' && !exercise_id) {
    status = 'unmatched';
  }

  if (status === 'unmatched') {
    exercise_id = null;
  }

  let muscle_group = item.muscle_group;
  if (muscle_group && !MUSCLE_GROUPS.includes(muscle_group)) {
    muscle_group = null;
  }

  return {
    label: String(item.label || '').trim() || 'Unknown movement',
    status,
    exercise_id,
    confidence,
    muscle_group
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imagesBase64, library } = await req.json();

    if (!imagesBase64?.length || !library?.length) {
      throw new Error("Missing images or library data");
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in Supabase secrets.");
    }

    const libraryEntries: LibraryEntry[] = library.map((e: LibraryEntry) => ({
      id: String(e.id),
      name: e.name,
      muscle_group: e.muscle_group ?? null
    }));
    const libraryIds = new Set(libraryEntries.map(e => e.id));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING", description: "Exercise name exactly as written on the image" },
                  status: { type: "STRING", enum: ["matched", "fuzzy", "unmatched"] },
                  exercise_id: { type: "STRING", nullable: true },
                  confidence: { type: "NUMBER", description: "0.0 to 1.0 match confidence" },
                  muscle_group: { type: "STRING", nullable: true }
                },
                required: ["label", "status", "confidence"]
              }
            }
          },
          required: ["items"]
        }
      }
    });

    const prompt = `
You are an elite fitness AI. The user uploaded workout routine image(s). Read them in order.

LIBRARY (only valid exercise_id values — use null if no good match):
${JSON.stringify(libraryEntries.map(e => ({ id: e.id, name: e.name, muscle_group: e.muscle_group || null })))}

ALLOWED MUSCLE GROUPS for unmatched items: ${MUSCLE_GROUPS.join(', ')}

For each exercise found on the image(s), in order:
1. "label" — name as written on the image (clean up abbreviations only slightly).
2. "status":
   - "matched" — same movement, confidence >= 0.82, include exercise_id.
   - "fuzzy" — closest library substitute but not the same movement (e.g. "DB Press" → "Dumbbell Bench Press"), include exercise_id.
   - "unmatched" — no reasonable library entry; exercise_id must be null.
3. "exercise_id" — library id when matched/fuzzy, else null. NEVER invent an id.
4. "confidence" — 0.0 to 1.0.
5. "muscle_group" — best guess for unmatched items; null when matched/fuzzy.

Skip rest timers, notes, and set/rep counts. Only list distinct exercises in workout order.
`;

    const imageParts = imagesBase64.map((base64: string) => ({
      inlineData: { data: base64, mimeType: "image/jpeg" }
    }));

    const result = await model.generateContent([prompt, ...imageParts]);
    const parsed = JSON.parse(result.response.text().trim());
    const rawItems: ImportItem[] = Array.isArray(parsed?.items) ? parsed.items : [];

    const items = rawItems
      .map(item => normalizeStatus(item, libraryIds))
      .filter(item => item.label);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("EDGE FUNCTION ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
