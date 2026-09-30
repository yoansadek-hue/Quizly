import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

const KEY = process.env.XAI_API_KEY;
const MODEL = process.env.MODEL || "grok-4.7";
const hits = new Map(); // limite : 10 requêtes / minute / IP

const SYSTEM = `Tu génères des questions de quiz en français.
Réponds UNIQUEMENT par un tableau JSON, sans texte autour ni balises Markdown.
Chaque élément : {"t": thème, "d": difficulté 1-5, "q": question, "a": bonne réponse courte, "o": 4 propositions dont "a"}.
Les questions doivent être exactes, sans ambiguïté, avec une seule bonne réponse et des mauvaises réponses plausibles.`;

app.post("/api/questions", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "XAI_API_KEY manquante côté serveur" });

  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "Trop de requêtes, patientez." });
  hits.set(req.ip, [...recent, now]);

  const themes = (Array.isArray(req.body.themes) ? req.body.themes : []).slice(0, 15).map((t) => String(t).slice(0, 30));
  const diff = Math.min(Math.max(+req.body.difficulty || 1, 1), 5);
  const count = Math.min(Math.max(+req.body.count || 10, 1), 15);
  if (!themes.length) return res.status(400).json({ error: "Aucun thème" });

  try {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
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
    if (!r.ok) throw new Error(`API ${r.status}`);
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
