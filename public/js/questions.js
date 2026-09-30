export const THEMES = [
  "Art","Sport","Science","Histoire","Géographie","Cinéma","Musique","Animaux","Gastronomie",
  "Littérature","Jeux vidéo","Mythologie","Politique","Anatomie","Astronomie","Botanique","Mode",
  "Automobile","Informatique","Bricolage","Séries TV","Mangas","Célébrités","Langues",
  "Mathématiques","Chimie","Physique","Architecture","Dessins animés","Super-héros","Espace",
  "Océans","Inventions","Philosophie","Économie","Internet","Aéronautique","Magie","Transports","Société"
];

// Demande 10 questions au serveur (qui détient la clé API)
export async function fetchAI(themes, difficulty, count = 10) {
  const res = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes, difficulty, count })
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur serveur");
  const { questions } = await res.json();
  return questions;
}
