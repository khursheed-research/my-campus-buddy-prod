// supabase/functions/parse-profile-pdf/index.ts
//
// Receives the raw bytes of a PDF the user uploaded (their own LinkedIn
// "Save to PDF" export — LinkedIn's own official feature, not scraping),
// extracts its text with unpdf (same library process-document uses), then
// runs the same Gemini structured extraction as parse-profile-text. Never
// writes to the DB itself — returns the extraction for the user to review.

import { extractText, getDocumentProxy } from "npm:unpdf@0.11.0";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });
    }

    const arrayBuffer = await req.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: "No file received" }), { status: 400, headers: corsHeaders });
    }

    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No extractable text found in this PDF" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    const prompt = `Extract structured professional profile fields from this text, exported from the person's own LinkedIn profile as a PDF. Only extract what is explicitly stated — never invent or infer anything not present in the text.

- job_title: their current or most recent job title, or null
- previous_company: their most recent PRIOR employer (not their current one), or null
- years_experience: a numeric estimate of total professional years, calculated only from explicit dates given in the text, or null if dates aren't present
- education: a short one-line summary of their highest/most relevant degree and institution, or null
- skills: an array of skills explicitly mentioned (up to 15)
- certifications: an array of certifications explicitly mentioned (up to 10)

Text:
"""
${text.slice(0, 8000)}
"""`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                job_title: { type: "string", nullable: true },
                previous_company: { type: "string", nullable: true },
                years_experience: { type: "number", nullable: true },
                education: { type: "string", nullable: true },
                skills: { type: "array", items: { type: "string" }, maxItems: 15 },
                certifications: { type: "array", items: { type: "string" }, maxItems: 10 },
              },
              required: ["skills", "certifications"],
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini extraction failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    const extracted = JSON.parse(data.candidates[0].content.parts[0].text);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
