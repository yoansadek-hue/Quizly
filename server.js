import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "10kb" }));
const ICONS = {
  180: "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",
  192: "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",
  512: "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",
};
app.get("/icons/icon-:n.png", (req, res) => {
  const b = ICONS[req.params.n];
  if (!b) return res.sendStatus(404);
  res.type("png").set("Cache-Control", "public, max-age=86400").send(Buffer.from(b, "base64"));
});

app.use(express.static("public"));

const KEY = process.env.AI_API_KEY;
const BASE = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.MODEL || "openai/gpt-oss-120b";
const hits = new Map(); // limite : 10 requêtes / minute / IP

const SYSTEM = `Tu génères des questions de quiz en français.
Réponds UNIQUEMENT par un tableau JSON, sans texte autour ni balises Markdown.
Chaque élément : {"t": thème, "d": difficulté 1-5, "q": question, "a": bonne réponse courte, "o": 4 propositions dont "a"}.
Les questions doivent être exactes, sans ambiguïté, avec une seule bonne réponse et des mauvaises réponses plausibles.
Pour tout thème contenant « Musique » : uniquement de la musique moderne (années 2000 à aujourd'hui) : rap US et FR, R&B, pop actuelle, afrobeats ; artistes, albums, titres, collaborations. Jamais de musique classique ni de variété ancienne.`;

app.post("/api/questions", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "AI_API_KEY manquante côté serveur" });

  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "Trop de requêtes, patientez." });
  hits.set(req.ip, [...recent, now]);

  const themes = (Array.isArray(req.body.themes) ? req.body.themes : []).slice(0, 15).map((t) => String(t).slice(0, 30));
  const diff = Math.min(Math.max(+req.body.difficulty || 1, 1), 5);
  const count = Math.min(Math.max(+req.body.count || 10, 1), 15);
  if (!themes.length) return res.status(400).json({ error: "Aucun thème" });

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Génère ${count} questions variées sur ces thèmes : ${themes.join(", ")}. Difficulté visée : ${diff}/5 (1 = très facile, 5 = expert).` }
        ]
      })
    });
    if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    const raw = JSON.parse(text.replace(/```json|```/g, "").trim());
    const list = Array.isArray(raw) ? raw : (Object.values(raw || {}).find(Array.isArray) || []);
    const questions = list
      .filter((x) => x && x.q && x.a && Array.isArray(x.o) && x.o.includes(x.a))
      .map((x) => ({
        t: String(x.t || themes[0]), d: Math.min(Math.max(+x.d || diff, 1), 5),
        q: String(x.q), a: String(x.a), o: x.o.slice(0, 4).map(String)
      }));
    if (!questions.length) throw new Error("Réponse vide");
    res.json({ questions });
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: "Génération impossible, questions locales utilisées." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Quizly sur http://localhost:${port}`));
