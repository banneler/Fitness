// File: supabase/functions/ai-nutrition-parser/index.ts

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image, query } = await req.json();
    
    if (!image && !query) {
      throw new Error("Request must contain either 'image' or 'query'.");
    }

    const gemini_api_key = Deno.env.get("GEMINI_API_KEY");
    if (!gemini_api_key) throw new Error("GEMINI_API_KEY secret is not set.");

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gemini_api_key}`;

    let contents = [];

    // SCENARIO 1: TEXT CALCULATOR
    if (query) {
      const textPrompt = `
        Act as a nutrition calculator. I will give you a list of ingredients or a meal description.
        Calculate the ESTIMATED TOTAL MACROS for the entire description.
        
        INPUT: "${query}"
        
        REQUIREMENTS:
        - Sum up values for all items mentioned.
        - "food_name" should be a short, clear title for this meal (e.g. "Egg White Omelet").
        - Return ONLY raw JSON. No markdown.
      `;
      contents = [{ parts: [{ text: textPrompt }] }];
    } 
    // SCENARIO 2: IMAGE VISION
    else if (image) {
      const base64Image = image.includes('base64,') ? image.split('base64,')[1] : image;
      const visionPrompt = `
        Analyze this image (nutrition label or food photo).
        If Label: Extract exact values.
        If Food: Identify items, estimate portion sizes visually, and calculate total macros.
        "food_name" should be concise.
        Return ONLY raw JSON. No markdown.
      `;
      contents = [{
        parts: [
          { text: visionPrompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      }];
    }

    const payload = {
      contents: contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "food_name": { "type": "STRING" },
            "calories": { "type": "INTEGER" },
            "protein": { "type": "INTEGER" },
            "carbs": { "type": "INTEGER" },
            "fat": { "type": "INTEGER" }
          },
          required: ["food_name", "calories", "protein", "carbs", "fat"]
        }
      }
    };

    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      throw new Error(`Gemini API Error: ${apiResponse.status} - ${errorBody}`);
    }

    const responseJson = await apiResponse.json();
    let extractedText = responseJson.candidates[0].content.parts[0].text;
    extractedText = extractedText.replace(/```json|```/g, '').trim();
    
    return new Response(extractedText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});