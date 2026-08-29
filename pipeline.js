import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.SUPABASE_URL?.trim();
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = rawUrl && rawUrl !== "" ? rawUrl : "https://wclodubfdmmqfwsznzbs.supabase.co";
const SUPABASE_ANON_KEY = rawKey && rawKey !== "" ? rawKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbG9kdWJmZG1tcWZ3c3puemJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MzA1MTMsImV4cCI6MjEwMzMwNjUxM30.mfF_8FWI_7IF1JlGlQTU3647CrioDteoCKjY2MCChrQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateDetailedSummary(headline, snippet) {
  try {
    const prompt = `Analyze this market news item:
Headline: "${headline}"
Snippet: "${snippet}"

Provide a concise 3-part financial breakdown:
1. Executive Summary
2. Market Impact (Sectors or assets affected)
3. Key Takeaway for Traders`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;
  } catch (err) {
    console.error('Gemini summary failed, falling back to RSS snippet:', err.message);
    return snippet;
  }
}

async function fetchAndSaveNews() {
  console.log('Fetching live market news...');
  
  try {
    // Pure financial news stream via Yahoo Finance RSS
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://finance.yahoo.com/news/rssindex');
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      console.log('No articles found.');
      return;
    }

    for (const item of data.items.slice(0, 5)) {
      const rawSnippet = item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'No summary provided.';
      
      const { data: existing } = await supabase
        .from('knowledge_repository')
        .select('id')
        .eq('title', item.title);

      if (existing && existing.length > 0) {
        console.log(`Skipping duplicate: "${item.title}"`);
        continue;
      }

      console.log(`Generating AI summary for: "${item.title}"...`);
      const aiSummary = await generateDetailedSummary(item.title, rawSnippet);

      const articlePayload = {
        title: item.title,
        summary: aiSummary,
        content: item.content ? item.content.replace(/<[^>]*>?/gm, '') : rawSnippet,
        tier_required: 'free',
        category: 'Macro'
      };

      const { error } = await supabase
        .from('knowledge_repository')
        .insert([articlePayload]);

      if (error) {
        console.error('Error inserting article:', error.message);
      } else {
        console.log(`Successfully added: "${item.title}"`);
      }
    }
  } catch (err) {
    console.error('Pipeline failed:', err);
    process.exit(1);
  }
}

fetchAndSaveNews();
