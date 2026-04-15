const BRANDS = ["Velo", "Zyn", "On!", "Rogue", "ALP"];

function sanitize(str) {
  return (str || "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function buildPrompt(posts) {
  const lines = posts.slice(0, 50).map((p, i) => {
    const title = sanitize(p.title);
    const body  = sanitize(p.selftext || "");
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { posts } = req.body;
    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "No posts provided" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPrompt(posts) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(502).json({ error: "Claude API error", detail: err.slice(0, 300) });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData?.content?.find(b => b.type === "text")?.text ?? "";
    if (!rawText) return res.status(502).json({ error: "Empty Claude response" });

    // Parse JSON from Claude
    let s = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a === -1 || b === -1) {
      return res.status(502).json({ error: "No JSON in Claude response", raw: rawText.slice(0, 300) });
    }
    s = s.slice(a, b + 1);
    let newsletter;
    try { newsletter = JSON.parse(s); }
    catch (_) {
      s = s.replace(/,(\s*[}\]])/g, "$1");
      newsletter = JSON.parse(s);
    }

    // Tag posts with brands
    const taggedPosts = posts.map(p => {
      const text = (p.title + " " + (p.selftext || "")).toLowerCase();
      const brands = BRANDS.filter(b => {
        if (b === "On!") return text.includes("on!") || /\bon\s+pouch/.test(text);
        return text.includes(b.toLowerCase());
      });
      return { id: p.id, title: p.title, score: p.score, author: p.author, permalink: p.permalink, brands };
    }).filter(p => p.brands.length > 0);

    return res.status(200).json({ newsletter, postCount: posts.length, taggedPosts });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
