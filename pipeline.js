import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.SUPABASE_URL?.trim();
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = rawUrl && rawUrl !== "" ? rawUrl : "https://wclodubfdmmqfwsznzbs.supabase.co";
const SUPABASE_ANON_KEY = rawKey && rawKey !== "" ? rawKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbG9kdWJmZG1tcWZ3c3puemJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MzA1MTMsImV4cCI6MjEwMzMwNjUxM30.mfF_8FWI_7IF1JlGlQTU3647CrioDteoCKjY2MCChrQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateDetailedSummary(headline, snippet, retries = 3) {
  const prompt = `You are a Senior Wall Street Financial Analyst. 

Analyze this news item:
Headline: "${headline}"
Snippet Context: "${snippet}"

Provide a clean, readable financial analysis without using Markdown asterisks or hashtag headers. Format strictly as standard text paragraphs:

1. Executive Summary
Provide 2-3 sentences explaining the event in depth, its economic significance, and underlying macro factors.

2. Market Impact
Detail the specific sectors, equities, bonds, or commodities affected.

3. Key Takeaway for Traders
Provide actionable risk metrics or strategic positioning for portfolio managers.`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      if (response && response.text) {
        // Strip out raw Markdown symbols (###, **, *) for clean frontend rendering
        return response.text
          .replace(/#{1,6}\s?/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .trim();
      }
    } catch (err) {
      if (attempt < retries) {
        console.warn(`⚠️ Temporary API issue (${err.status || err.message}). Retrying in 5 seconds... (Attempt ${attempt}/${retries})`);
        await sleep(5000);
      } else {
        throw err;
      }
    }
  }
}

async function fetchAndSaveNews() {
  console.log('Fetching live market news...');
  
  try {
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://finance.yahoo.com/news/rssindex');
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      console.log('No articles found.');
      return;
    }

    for (const item of data.items.slice(0, 5)) {
      const cleanSnippet = item.description && item.description.trim() !== '' 
        ? item.description.replace(/<[^>]*>?/gm, '') 
        : item.title;
      
      const { data: existing } = await supabase
        .from('knowledge_repository')
        .select('id')
        .eq('title', item.title);

      if (existing && existing.length > 0) {
        console.log(`Skipping duplicate: "${item.title}"`);
        continue;
      }

      console.log(`Generating AI summary for: "${item.title}"...`);
      
      let aiSummary;
      try {
        aiSummary = await generateDetailedSummary(item.title, cleanSnippet);
      } catch (geminiErr) {
        console.error(`⚠️ SKIPPING ARTICLE due to API error: "${item.title}"`);
        continue;
      }

      const articlePayload = {
        title: item.title,
        summary: aiSummary,
        content: aiSummary,
        tier_required: 'free',
        category: 'Macro'
      };

      const { error } = await supabase
        .from('knowledge_repository')
        .insert([articlePayload]);

      if (error) {
        console.error('Error inserting article:', error.message);
      } else {
        console.log(`Successfully added clean AI summary for: "${item.title}"`);
      }
      
      await sleep(2000);
    }
  } catch (err) {
    console.error('Pipeline process failed:', err);
    process.exit(1);
  }
}

fetchAndSaveNews();
