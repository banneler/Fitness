import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imagesBase64, library } = await req.json();

    if (!imagesBase64 || !imagesBase64.length || !library) {
      throw new Error("Missing images or library data");
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in Supabase secrets.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an elite fitness AI. The user has uploaded one or more images of a workout routine. 
      Read them in order.
      
      Here is the JSON list of available exercises in the database:
      ${JSON.stringify(library)}

      Task:
      1. Identify the exercises listed across all the provided images.
      2. Match each exercise you find to the CLOSEST match in the provided JSON library.
      3. Return ONLY a single, combined raw JSON array of the matched exercise IDs in the order they appear.
      4. DO NOT include any text, markdown, or explanation. ONLY the array.
      
      Example valid response:
      [12, 45, 3, 19, 22]
    `;

    // Map all uploaded images into the format Gemini expects
    const imageParts = imagesBase64.map((base64: string) => ({
        inlineData: {
            data: base64,
            mimeType: "image/jpeg"
        }
    }));

    // Send the prompt AND all the images at once
    const result = await model.generateContent([prompt, ...imageParts]);

    let responseText = result.response.text().trim();
    console.log("Raw AI Response:", responseText);
    
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const startIdx = responseText.indexOf('[');
    const endIdx = responseText.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
        throw new Error("AI did not return a valid array. Response was: " + responseText);
    }
    
    const cleanArrayString = responseText.substring(startIdx, endIdx + 1);
    const matchedIds = JSON.parse(cleanArrayString);

    return new Response(JSON.stringify({ exercises: matchedIds }), {
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