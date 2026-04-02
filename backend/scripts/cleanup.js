const db = require('../database/db');
db.initDatabase();
const Anthropic = require('@anthropic-ai/sdk');

function strip(t) {
  return (t || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
}

async function run() {
  const aiConfig = db.getDb().prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
  if (!aiConfig) { console.log('No AI config'); return; }

  const nullItems = db.getDb().prepare('SELECT DISTINCT item_name, store FROM price_history WHERE generic_name IS NULL').all();
  console.log('Backfilling', nullItems.length, 'items...');

  if (nullItems.length === 0) { console.log('Nothing to backfill'); }
  else {
    const client = new Anthropic({ apiKey: aiConfig.api_key });
    const resp = await client.messages.create({
      model: aiConfig.model || 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: 'Extract brand and generic name for each grocery item. Return ONLY a JSON array, no other text.\n\nItems:\n' +
          nullItems.map(i => i.item_name + ' (' + i.store + ')').join('\n') +
          '\n\nFormat: [{"item_name": "original", "generic_name": "product without brand", "brand": "brand name or null"}]\nStore brands: Great Value=Walmart, Kirkland=Costco, Friendly Farms/Millville/Simply Nature/Happy Farms/Clancys=Aldi'
      }]
    });

    const text = strip(resp.content[0].text);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.log('No JSON found:', text.substring(0, 200)); }
    else {
      const backfills = JSON.parse(match[0]);
      console.log('Parsed', backfills.length, 'items');
      const update = db.getDb().prepare('UPDATE price_history SET generic_name = ?, brand = ? WHERE item_name = ? AND generic_name IS NULL');
      const updateLike = db.getDb().prepare('UPDATE price_history SET generic_name = ?, brand = ? WHERE item_name LIKE ? AND generic_name IS NULL');
      let updated = 0;
      for (const b of backfills) {
        if (b.item_name && b.generic_name) {
          // Strip store suffix AI might have added
          const cleanName = b.item_name.replace(/\s*\([^)]*\)\s*$/, '').trim();
          let r = update.run(b.generic_name, b.brand || null, cleanName);
          if (r.changes === 0) r = updateLike.run(b.generic_name, b.brand || null, '%' + cleanName + '%');
          updated += r.changes;
          if (r.changes > 0) console.log('  ', cleanName, '->', b.generic_name, '(' + (b.brand || 'no brand') + ')');
        }
      }
      console.log('Backfilled', updated, 'records');
    }
  }

  // Now merge
  const names = db.getDb().prepare('SELECT DISTINCT generic_name FROM price_history WHERE generic_name IS NOT NULL ORDER BY generic_name').all().map(r => r.generic_name);
  console.log('\nMerging across', names.length, 'distinct names...');

  const client2 = new Anthropic({ apiKey: aiConfig.api_key });
  const mResp = await client2.messages.create({
    model: aiConfig.model || 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: 'Find duplicates that are the SAME product. Return ONLY a JSON array.\n\nProduct names:\n' + names.join('\n') +
        '\n\nReturn: [{"keep": "best canonical name", "merge": ["duplicate1", "duplicate2"]}]\nRules: same product different wording = merge. Different sizes = keep separate. Different flavors = keep separate. If no duplicates, return []'
    }]
  });

  const mText = strip(mResp.content[0].text);
  const mMatch = mText.match(/\[[\s\S]*\]/);
  const merges = mMatch ? JSON.parse(mMatch[0]) : [];
  console.log('Found', merges.length, 'merge groups');

  const mu = db.getDb().prepare('UPDATE price_history SET generic_name = ? WHERE generic_name = ?');
  let totalMerged = 0;
  for (const m of merges) {
    for (const old of (m.merge || [])) {
      const r = mu.run(m.keep, old);
      totalMerged += r.changes;
      if (r.changes > 0) console.log('  Merged:', old, '->', m.keep, '(' + r.changes + ' records)');
    }
  }
  console.log('Total merged:', totalMerged);
  console.log('\nDone!');
}

run().catch(e => console.error('ERROR:', e.message));
