// api/pipeline.js
//
// This runs as a Vercel serverless function at: https://your-site.vercel.app/api/pipeline
// It is meant to be triggered on a schedule (every 5-15 min) by an external
// scheduler — see the deploy instructions for why Vercel's own free cron
// can't do this at that frequency.
//
// What it does, in order:
//   1. Pulls fresh items from a licensed news API + public SEC filings
//   2. Sends each one to Claude to summarize, tag, and add labeled AI analysis
//   3. Runs a guardrail check before anything is allowed to publish
//   4. Saves the result to Supabase

import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  // --- security: only your scheduler should be able to trigger this ---
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.PIPELINE_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const newsItems = await fetchNews();
    const filingItems = await fetchSecFilings();
    const rawItems = [...newsItems, ...filingItems];

    const results = [];
    for (const item of rawItems) {
      const processed = await processWithClaude(item);
      const { flagged, reason } = runGuardrail(processed, item);

      const { error } = await supabase.from('repo_items').insert({
        source_type: item.source_type,
        source_name: item.source_name,
        source_url: item.url,
        title: processed.title,
        summary: processed.summary,
        ai_analysis: processed.ai_analysis,
        tags: processed.tags,
        tier: processed.suggested_tier,
        published: !flagged,
        flag_reason: flagged ? reason : null,
        created_at: new Date().toISOString(),
      });

      if (!error) results.push({ title: processed.title, flagged });
    }

    return res.status(200).json({ processed: results.length, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

// ---------------- data sources ----------------

async function fetchNews() {
  // Swap in whichever licensed news API you use — this shape matches
  // most of them closely enough (NewsAPI, Benzinga, etc). NewsAPI's free
  // tier is for local development only; for a live product you'll want
  // Benzinga News API or a similar production-licensed source.
  const url = `${process.env.NEWS_API_URL}?category=business&pageSize=10&apiKey=${process.env.NEWS_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const articles = data.articles || [];

  return articles.map(a => ({
    source_type: 'news',
    source_name: a.source?.name || 'unknown',
    url: a.url,
    // NOTE: we only ever pass the headline + short description to Claude,
    // never the full article body — see the copyright note in the deploy
    // instructions for why that matters.
    raw_text: `${a.title}\n${a.description || ''}`,
  }));
}

async function fetchSecFilings() {
  // SEC EDGAR "latest filings" feed — public, free, no key needed.
  // SEC requires a descriptive User-Agent identifying you — replace the
  // email below with your own contact address before deploying.
  const url = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&company=&dateb=&owner=include&count=10&output=atom';
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Glassfloor research bot (you@yourdomain.com)' },
  });
  const xml = await resp.text();
  const parser = new XMLParser();
  const feed = parser.parse(xml);
  const entries = feed?.feed?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];

  return list.map(e => ({
    source_type: 'sec_filing',
    source_name: 'SEC EDGAR',
    url: e.link?.['@_href'] || '',
    raw_text: `${e.title}\nFiled: ${e.updated}`,
  }));
}

// ---------------- AI processing ----------------

async function processWithClaude(item) {
  const system = `You process financial news and SEC filings for a trading education platform.
Given a headline/snippet, respond ONLY with JSON (no markdown fences, no preamble):
{
  "title": "short plain-English title",
  "summary": "2-3 sentences in your own words, plain English, no jargon left unexplained",
  "ai_analysis": "1-2 sentences of clearly-labeled speculative analysis, MUST start with 'AI take:' and MUST include a hedge word (may/could/often/tends to) — never state a prediction as fact",
  "tags": { "companies": ["..."], "tickers": ["..."], "event_type": "earnings|filing|macro|other" },
  "suggested_tier": "free|pro|institutional"
}
Never invent facts not present in the source. If the source is too thin to analyze, set ai_analysis to null.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: item.raw_text }],
    }),
  });

  const data = await resp.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { title: item.raw_text.slice(0, 80), summary: '', ai_analysis: null, tags: {}, suggested_tier: 'free' };
  }
}

// ---------------- guardrail ----------------

function runGuardrail(processed, sourceItem) {
  // 1. Any named company/ticker in the analysis must also appear in the
  //    source text — catches the AI inventing an unrelated company.
  const companies = processed.tags?.companies || [];
  for (const name of companies) {
    if (!sourceItem.raw_text.toLowerCase().includes(name.toLowerCase())) {
      return { flagged: true, reason: `"${name}" not found in source text` };
    }
  }

  // 2. Speculative analysis must be hedged, never stated as fact.
  if (processed.ai_analysis) {
    const hedged = /may|could|often|tends to|likely|possibly/i.test(processed.ai_analysis);
    if (!hedged) {
      return { flagged: true, reason: 'AI analysis not properly hedged' };
    }
  }

  return { flagged: false, reason: null };
}
