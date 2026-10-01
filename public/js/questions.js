export const THEMES = [
  "Art","Sport","Science","Histoire","Géographie","Cinéma","Musique","Animaux","Gastronomie",
  "Littérature","Jeux vidéo","Mythologie","Politique","Anatomie","Astronomie","Botanique","Mode",
  "Automobile","Informatique","Bricolage","Séries TV","Mangas","Célébrités","Langues",
  "Mathématiques","Chimie","Physique","Architecture","Dessins animés","Super-héros","Espace",
  "Océans","Inventions","Philosophie","Économie","Internet","Aéronautique","Magie","Transports","Société"
];

const MUSIC = "Musique rap US-FR, R&B, hits";

// Demande 10 questions au serveur (qui détient la clé API)
export async function fetchAI(themes, difficulty, count = 10, avoid = []) {
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes: themes.map((t) => (t === "Musique" ? MUSIC : t)), difficulty, count, avoid })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur serveur");
  const { questions } = await res.json();
  // remet le nom de thème d'origine (ex. « Musique ») sur chaque question
  return questions.map((x) => ({ ...x, t: themes.find((t) => String(x.t).toLowerCase().startsWith(t.toLowerCase())) || x.t }));
}
