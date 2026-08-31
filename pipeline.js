import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import Parser from 'rss-parser';

// Initialize Supabase & Gemini
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const parser = new Parser();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Multi-topic RSS Feed Sources
const FEED_SOURCES = [
  'https://feeds.content.dowjones.io/public/rss/mw_topstories',     // MarketWatch Top Stories
  'https://www.coindesk.com/arc/outboundfeeds/rss/',              // Crypto & Web3
  'https://www.sec.gov/news/pressreleases.rss',                  // SEC Corporate Filings
  'https://finance.yahoo.com/rss/headline?s=AAPL,MSFT,NVDA,TSLA'  // Equities & Tech
];

/**
 * Uses Gemini 2.5 Flash to generate a structured analysis and select a precise category tag.
 */
async function generateDetailedSummary(headline, snippet, retries = 3) {
  const prompt = `You are a Senior Wall Street Financial Analyst.

Analyze this news item:
Headline: "${headline}"
Snippet: "${snippet}"

Step 1: Pick the SINGLE best category from this list:
- "Insider Trading"
- "Personal Finance & Banking"
- "Equities & Earnings"
- "Crypto & Digital Assets"
- "Real Estate & Commodities"
- "Macro & Central Banks"

Step 2: Provide a 3-paragraph plain text financial analysis without markdown bolding or headers:
1. Executive Summary: What happened and its economic context.
2. Market Impact: Affected sectors, assets, or equities.
3. Key Takeaway: Strategic risk considerations or takeaway.

Respond EXCLUSIVELY in valid raw JSON format with no code block formatting:
{
  "category": "Chosen Category",
  "summary": "1. Executive Summary\\n...\\n\\n2. Market Impact\\n...\\n\\n3. Key Takeaway\\n..."
}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      if (response && response.text) {
        // Parse raw JSON response reliably using regex bounds
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (err) {
      if (attempt < retries) {
        console.warn(`⚠️ API attempt ${attempt} failed (${err.message}). Retrying in 5 seconds...`);
        await sleep(5000);
      } else {
        console.error(` Failed to analyze article: "${headline}"`);
        return {
          category: "Macro & Central Banks",
          summary: `${headline}\n\nAnalysis temporarily unavailable due to external feed processing timeout.`
        };
      }
    }
  }
}

/**
 * Main Execution Pipeline
 */
async function runPipeline() {
  console.log("📡 Fetching live news across multiple market feeds...");
  let articlesToProcess = [];

  // Fetch top stories from each RSS source
  for (const feedUrl of FEED_SOURCES) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const topItems = (feed.items || []).slice(0, 2).map(item => ({
        title: item.title,
        snippet: item.contentSnippet || item.snippet || item.title,
        source: feed.title || 'Live Market Feed'
      }));
      articlesToProcess.push(...topItems);
    } catch (e) {
      console.warn(`Could not parse feed URL (${feedUrl}):`, e.message);
    }
  }

  console.log(`Processing ${articlesToProcess.length} market articles...`);

  for (const article of articlesToProcess) {
    if (!article.title) continue;

    console.log(`Analyzing: "${article.title}"...`);
    const aiResult = await generateDetailedSummary(article.title, article.snippet);

    // Save directly to Supabase with dynamic category classification
    const { error } = await supabase
      .from('knowledge_repository')
      .insert([
        {
          title: article.title,
          summary: aiResult.summary,
          category: aiResult.category,
          source: article.source,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error(`Supabase error for "${article.title}":`, error.message);
    } else {
      console.log(` Saved [${aiResult.category}]: "${article.title}"`);
    }

    // Rate-limiting pause between requests
    await sleep(5000);
  }

  console.log("Pipeline execution successfully completed!");
}

runPipeline();
