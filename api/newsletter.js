export const config = { runtime: "nodejs" };

const BRANDS = ["Velo", "Zyn", "On!", "Rogue", "ALP"];

function sanitize(str) {
  return (str || "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function fetchReddit() {
  const urls = [
    "https://www.reddit.com/r/NicotinePouch/new.json?limit=100",
    "https://www.reddit.com/r/NicotinePouch/hot.json?limit=50",
  ];
  const all = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
       headers: {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
},
      if (!r.ok) continue;
      const j = await r.json();
      for (const c of (j?.data?.children || [])) all.push(c.data);
    } catch (_) {}
  }
  const seen = new Set();
  return all.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function buildPrompt(posts) {
  const lines = posts.slice(0, 50).map((p, i) => {
    const title = sanitize(p.title);
    const body  = sanitize(p.selftext);
    const score = Number(p.score) || 0;
    return `${i + 1}. [${score}pts] ${title}${body ? " - " + body : ""}`;
  }).join("\n");

  return [
    "You are a nicotine pouch industry analyst reviewing Reddit posts from r/NicotinePouch.",
    "",
    `POSTS (${posts.length} total):`,
    lines || "No posts available.",
    "",
    "Write a brand intelligence brief as a JSON object.",
    "Cover these brands (only if mentioned in posts): Velo, Zyn, On!, Rogue, ALP",
    "For each brand include: headline, 2-4 bullet observations, sentiment (POSITIVE/MIXED/NEGATIVE), sentimentNote.",
    "Also include 3-5 cross-brand themes.",
    "",
    "Return ONLY valid JSON. No markdown. No explanation. Start with { end with }",
    "",
    'Schema: {"date":"string","brands":[{"name":"string","headline":"string","bullets":["string"],"sentiment":"POSITIVE or MIXED or NEGATIVE","sentimentNote":"string"}],"themes":["string"]}',
  ].join("\n");
}

export default async function handler(req) {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    // 1. Fetch Reddit
    const posts = await fetchReddit();
    if (posts.length === 0) {
      return new Response(JSON.stringify({ error: "Could not fetch Reddit posts" }), { status: 502, headers });
    }

    // 2. Call Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), { status: 500, headers });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPrompt(posts) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return new Response(JSON.stringify({ error: "Claude API error", detail: err.slice(0, 300) }), { status: 502, headers });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData?.content?.find(b => b.type === "text")?.text ?? "";
    if (!rawText) {
      return new Response(JSON.stringify({ error: "Empty Claude response" }), { status: 502, headers });
    }

    // 3. Parse JSON
    let s = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a === -1 || b === -1) {
      return new Response(JSON.stringify({ error: "No JSON in Claude response", raw: rawText.slice(0, 500) }), { status: 502, headers });
    }
    s = s.slice(a, b + 1);
    let newsletter;
    try { newsletter = JSON.parse(s); }
    catch (_) {
      s = s.replace(/,(\s*[}\]])/g, "$1");
      newsletter = JSON.parse(s);
    }

    // 4. Attach source post metadata
    const taggedPosts = posts.map(p => {
      const text = (p.title + " " + (p.selftext || "")).toLowerCase();
      const brands = BRANDS.filter(b => {
        if (b === "On!") return text.includes("on!") || /\bon\s+pouch/.test(text);
        return text.includes(b.toLowerCase());
      });
      return {
        id: p.id,
        title: p.title,
        score: p.score,
        author: p.author,
        permalink: p.permalink,
        brands,
      };
    }).filter(p => p.brands.length > 0);

    return new Response(JSON.stringify({
      newsletter,
      postCount: posts.length,
      taggedPosts,
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
