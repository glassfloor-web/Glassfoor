import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.SUPABASE_URL?.trim();
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = rawUrl && rawUrl !== "" ? rawUrl : "https://wclodubfdmmqfwsznzbs.supabase.co";
const SUPABASE_ANON_KEY = rawKey && rawKey !== "" ? rawKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbG9kdWJmZG1tcWZ3c3puemJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MzA1MTMsImV4cCI6MjEwMzMwNjUxM30.mfF_8FWI_7IF1JlGlQTU3647CrioDteoCKjY2MCChrQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateDetailedSummary(headline, snippet) {
  const prompt = `You are a Senior Wall Street Financial Analyst. 

Analyze this news item:
Headline: "${headline}"
Snippet Context: "${snippet}"

Provide a comprehensive, multi-paragraph analysis. You MUST write at least 2-3 thorough sentences for each section:

**1. Executive Summary**
Explain the event in depth. What is happening, why is it significant for the business/economy, and what macro factors are at play?

**2. Market Impact**
Which specific sectors, equities, bonds, commodities, or currencies will move because of this? Detail expected price action or sentiment shifts.

**3. Key Takeaway for Traders**
What action should portfolio managers or traders consider? Detail key risk metrics or strategic positioning.`;

  // Updated to stable model identifier
  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
  });

  if (!response.text) {
    throw new Error('Gemini returned an empty response.');
  }

  return response.text;
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
        console.error(`❌ GEMINI FAILED FOR "${item.title}":`, geminiErr.message);
        throw geminiErr;
      }

      const articlePayload = {
        title: item.title,
        summary: aiSummary,
        content: cleanSnippet,
        tier_required: 'free',
        category: 'Macro'
      };

      const { error } = await supabase
        .from('knowledge_repository')
        .insert([articlePayload]);

      if (error) {
        console.error('Error inserting article:', error.message);
      } else {
        console.log(`Successfully added multi-paragraph AI summary for: "${item.title}"`);
      }
    }
  } catch (err) {
    console.error('Pipeline process failed:', err);
    process.exit(1);
  }
}

fetchAndSaveNews();
