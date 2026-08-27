const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAndSaveNews() {
  console.log('Fetching live market news...');
  
  try {
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://feeds.content.dowjones.io/public/rss/mw_topstories');
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) {
      console.log('No articles found.');
      return;
    }

    for (const item of data.items.slice(0, 5)) {
      const articlePayload = {
        title: item.title,
        summary: item.description ? item.description.replace(/<[^>]*>?/gm, '').slice(0, 200) + '...' : 'No summary provided.',
        content: item.content ? item.content.replace(/<[^>]*>?/gm, '') : item.description.replace(/<[^>]*>?/gm, ''),
        tier_required: 'free',
        category: 'macro'
      };

      const { data: existing } = await supabase
        .from('knowledge_repository')
        .select('id')
        .eq('title', articlePayload.title);

      if (existing && existing.length > 0) {
        console.log(`Skipping duplicate: "${articlePayload.title}"`);
        continue;
      }

      const { error } = await supabase
        .from('knowledge_repository')
        .insert([articlePayload]);

      if (error) {
        console.error('Error inserting article:', error.message);
      } else {
        console.log(`Successfully added: "${articlePayload.title}"`);
      }
    }
  } catch (err) {
    console.error('Pipeline failed:', err);
  }
}

fetchAndSaveNews();
