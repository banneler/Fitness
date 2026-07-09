import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Quads', 'Hamstrings', 'Glutes', 'Hips', 'Calves', 'Cardio'
];

const MATCH_THRESHOLD = 0.82;
const VALID_STATUS = new Set(['matched', 'fuzzy', 'unmatched']);

type LibraryEntry = { id: string; name: string; muscle_group?: string | null };

type ImportItem = {
  label: string;
  status: 'matched' | 'fuzzy' | 'unmatched';
  exercise_id: string | null;
  confidence: number;
  muscle_group: string | null;
};

function cleanId(raw: unknown): string | null {
  if (raw == null || raw === '' || raw === 'null' || raw === 'none') return null;
  return String(raw).trim() || null;
}

function normalizeStatus(item: ImportItem, libraryIds: Set<string>): ImportItem {
  let status = VALID_STATUS.has(item.status) ? item.status : 'unmatched';
  let exercise_id = cleanId(item.exercise_id);
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

function parseAiItems(raw: unknown): ImportItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.map(row => {
    const obj = row as Record<string, unknown>;
    return {
      label: String(obj.label || ''),
      status: String(obj.status || 'unmatched') as ImportItem['status'],
      exercise_id: cleanId(obj.exercise_id),
      confidence: Number(obj.confidence) || 0,
      muscle_group: obj.muscle_group ? String(obj.muscle_group) : null
    };
  });
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

    const compactLibrary = libraryEntries.map(e => `${e.id}|${e.name}`).join('\n');

    const prompt = `
You are an elite fitness AI. The user uploaded workout routine image(s). Read them in order.

LIBRARY — each line is "uuid|Exercise Name". Only use these uuid values for exercise_id:
${compactLibrary}

ALLOWED MUSCLE GROUPS for unmatched items: ${MUSCLE_GROUPS.join(', ')}

For each exercise found on the image(s), in workout order, return JSON:
{
  "items": [
    {
      "label": "name as written on image",
      "status": "matched" | "fuzzy" | "unmatched",
      "exercise_id": "uuid string or empty string if unmatched",
      "confidence": 0.0 to 1.0,
      "muscle_group": "muscle name for unmatched only, else empty string"
    }
  ]
}

Rules:
- "matched" = same movement, confidence >= 0.82, include exercise_id.
- "fuzzy" = closest substitute, include exercise_id.
- "unmatched" = no good library entry, exercise_id must be empty string.
- NEVER invent a uuid. Skip rest timers, notes, set/rep counts.
`;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: prompt }
    ];
    imagesBase64.forEach((base64: string) => {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: base64 } });
    });

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
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
                    label: { type: "STRING" },
                    status: { type: "STRING" },
                    exercise_id: { type: "STRING" },
                    confidence: { type: "NUMBER" },
                    muscle_group: { type: "STRING" }
                  },
                  required: ["label", "status", "confidence"]
                }
              }
            },
            required: ["items"]
          }
        }
      })
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      throw new Error(`Gemini API error (${apiResponse.status}): ${errorBody.slice(0, 500)}`);
    }

    const responseJson = await apiResponse.json();
    const candidate = responseJson?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      const blockReason = candidate?.finishReason || responseJson?.promptFeedback?.blockReason;
      throw new Error(blockReason ? `AI blocked response: ${blockReason}` : "AI returned empty response");
    }

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const rawItems = parseAiItems(parsed);
    const items = rawItems
      .map(item => normalizeStatus(item, libraryIds))
      .filter(item => item.label && item.label !== 'Unknown movement');

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("EDGE FUNCTION ERROR:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
