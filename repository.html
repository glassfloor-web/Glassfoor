import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Google Gen AI Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Rate-limiting delay helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uses Gemini 2.5 Flash to generate a structured analysis AND assign a category tag.
 */
async function generateDetailedSummary(headline, snippet, retries = 3) {
  const prompt = `You are a Senior Wall Street Financial Analyst.

Analyze this news item:
Headline: "${headline}"
Snippet Context: "${snippet}"

Step 1: Determine the single best matching category for this article from this exact list:
- "Insider Trading"
- "Personal Finance & Banking"
- "Equities & Earnings"
- "Crypto & Digital Assets"
- "Real Estate & Commodities"
- "Macro & Central Banks"

Step 2: Provide a detailed financial analysis without using Markdown asterisks, bolding, or hashtag headers. Format as clean plain text:
1. Executive Summary: 2-3 sentences explaining the event, its economic significance, and underlying factors.
2. Market Impact: Specific sectors, equities, bonds, or commodities affected.
3. Key Takeaway: Actionable risk metrics or strategic positioning.

Respond strictly in valid JSON format with no Markdown code block wrappers:
{
  "category": "Exact Category Name",
  "summary": "1. Executive Summary\\n...\\n\\n2. Market Impact\\n...\\n\\n3. Key Takeaway\\n..."
}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      if (response && response.text) {
        // Strip out any accidental Markdown backticks
        const cleanedText = response.text
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();

        return JSON.parse(cleanedText);
      }
    } catch (err) {
      if (attempt < retries) {
        const backoff = attempt * 6000;
        console.warn(`⚠️ API attempt ${attempt} failed (${err.message}). Retrying in ${backoff / 1000}s...`);
        await sleep(backoff);
      } else {
        console.error(` Failed to summarize after ${retries} attempts: "${headline}"`);
        return {
          category: "Macro & Central Banks",
          summary: `${headline}\n\nAnalysis temporarily unavailable due to processing timeout.`
        };
      }
    }
  }
}

/**
 * Main Pipeline Function
 */
async function runPipeline() {
  console.log("Fetching live market news...");

  // Example news payload array (replace with your RSS / API news fetcher)
  const fetchedArticles = [
    {
      title: "Central Garden & Pet Chairman Sells 3,900 Shares for $152,100",
      snippet: "Executive stock sale transaction filed under SEC Form 4 rules.",
      source: "SEC Filings"
    },
    {
      title: "Best CD rates today: Lock in up to 4.30% APY with a 16- or 18-month CD",
      snippet: "Yield comparisons for personal savings and fixed income certificates of deposit.",
      source: "Bankrate"
    },
    {
      title: "A bankruptcy attorney explains exactly when creditors can garnish your 401(k)",
      snippet: "Legal protections for retirement assets under ERISA guidelines during debt collection.",
      source: "MarketWatch"
    }
  ];

  for (const article of fetchedArticles) {
    console.log(`Analyzing & categorizing: "${article.title}"...`);

    const aiResult = await generateDetailedSummary(article.title, article.snippet);

    // Save directly to Supabase with dynamic category
    const { data, error } = await supabase
      .from('knowledge_repository')
      .insert([
        {
          title: article.title,
          summary: aiResult.summary,
          category: aiResult.category,
          source: article.source || 'Live Market Feed',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error(`Error inserting "${article.title}":`, error.message);
    } else {
      console.log(` Saved [Category: ${aiResult.category}]: "${article.title}"`);
    }

    // 6-second delay between items to avoid rate limit spikes
    await sleep(6000);
  }

  console.log("Pipeline run complete!");
}

runPipeline();
