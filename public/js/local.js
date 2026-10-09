// Questions fabriquées sans IA : toujours exactes, aucun token consommé.
// Ce fichier est partagé par le navigateur et par le serveur (salles en ligne).

const RAW = `fr|France|Paris|1
de|Allemagne|Berlin|1
es|Espagne|Madrid|1
it|Italie|Rome|1
gb|Royaume-Uni|Londres|1
pt|Portugal|Lisbonne|1
be|Belgique|Bruxelles|1
ch|Suisse|Berne|1
nl|Pays-Bas|Amsterdam|1
us|États-Unis|Washington|1
ca|Canada|Ottawa|1
mx|Mexique|Mexico|1
br|Brésil|Brasilia|1
ar|Argentine|Buenos Aires|1
jp|Japon|Tokyo|1
cn|Chine|Pékin|1
in|Inde|New Delhi|1
ru|Russie|Moscou|1
au|Australie|Canberra|1
eg|Égypte|Le Caire|1
ma|Maroc|Rabat|1
dz|Algérie|Alger|1
tn|Tunisie|Tunis|1
za|Afrique du Sud|-|1
gr|Grèce|Athènes|1
tr|Turquie|Ankara|1
se|Suède|Stockholm|1
no|Norvège|Oslo|1
dk|Danemark|Copenhague|1
fi|Finlande|Helsinki|1
pl|Pologne|Varsovie|1
at|Autriche|Vienne|1
ie|Irlande|Dublin|1
kr|Corée du Sud|Séoul|1
sa|Arabie saoudite|Riyad|1
cz|Tchéquie|Prague|2
hu|Hongrie|Budapest|2
ro|Roumanie|Bucarest|2
bg|Bulgarie|Sofia|2
hr|Croatie|Zagreb|2
rs|Serbie|Belgrade|2
ua|Ukraine|Kiev|2
is|Islande|Reykjavik|2
lu|Luxembourg|Luxembourg|2
cl|Chili|Santiago|2
pe|Pérou|Lima|2
co|Colombie|Bogota|2
ve|Venezuela|Caracas|2
cu|Cuba|La Havane|2
ng|Nigeria|Abuja|2
et|Éthiopie|Addis-Abeba|2
ke|Kenya|Nairobi|2
sn|Sénégal|Dakar|2
ci|Côte d'Ivoire|-|2
cm|Cameroun|Yaoundé|2
cd|RD Congo|Kinshasa|2
ml|Mali|Bamako|2
mg|Madagascar|Antananarivo|2
th|Thaïlande|Bangkok|2
vn|Vietnam|Hanoï|2
id|Indonésie|Jakarta|2
ph|Philippines|Manille|2
my|Malaisie|Kuala Lumpur|2
sg|Singapour|Singapour|2
pk|Pakistan|Islamabad|2
bd|Bangladesh|Dacca|2
ir|Iran|Téhéran|2
iq|Irak|Bagdad|2
lb|Liban|Beyrouth|2
jo|Jordanie|Amman|2
ae|Émirats arabes unis|Abou Dabi|2
qa|Qatar|Doha|2
nz|Nouvelle-Zélande|Wellington|2
ee|Estonie|Tallinn|3
lv|Lettonie|Riga|3
lt|Lituanie|Vilnius|3
sk|Slovaquie|Bratislava|3
si|Slovénie|Ljubljana|3
al|Albanie|Tirana|3
mk|Macédoine du Nord|Skopje|3
ba|Bosnie-Herzégovine|Sarajevo|3
me|Monténégro|Podgorica|3
md|Moldavie|Chisinau|3
by|Biélorussie|Minsk|3
ge|Géorgie|Tbilissi|3
am|Arménie|Erevan|3
az|Azerbaïdjan|Bakou|3
kz|Kazakhstan|Astana|3
uz|Ouzbékistan|Tachkent|3
mn|Mongolie|Oulan-Bator|3
np|Népal|Katmandou|3
lk|Sri Lanka|-|3
kh|Cambodge|Phnom Penh|3
la|Laos|Vientiane|3
mm|Birmanie|Naypyidaw|3
af|Afghanistan|Kaboul|3
ao|Angola|Luanda|3
mz|Mozambique|Maputo|3
tz|Tanzanie|-|3
ug|Ouganda|Kampala|3
gh|Ghana|Accra|3
ly|Libye|Tripoli|3
sd|Soudan|Khartoum|3
so|Somalie|Mogadiscio|3
zw|Zimbabwe|Harare|3
zm|Zambie|Lusaka|3
bj|Bénin|-|3
bf|Burkina Faso|Ouagadougou|3
ne|Niger|Niamey|3
td|Tchad|N'Djamena|3
ga|Gabon|Libreville|3
cg|Congo|Brazzaville|3
mr|Mauritanie|Nouakchott|3
ec|Équateur|Quito|3
uy|Uruguay|Montevideo|3
py|Paraguay|Asunción|3
pa|Panama|Panama|3
cr|Costa Rica|San José|3
jm|Jamaïque|Kingston|3
ht|Haïti|Port-au-Prince|3
do|République dominicaine|Saint-Domingue|3
fj|Fidji|Suva|3
mc|Monaco|-|3
gn|Guinée|Conakry|3
bo|Bolivie|-|3
kw|Koweït|-|3
lr|Libéria|Monrovia|3
ni|Nicaragua|Managua|3
hn|Honduras|Tegucigalpa|3`;

const WORDS = ["LUNE","CIEL","ROSE","PAIN","LAIT","TRAIN","TABLE","PLAGE","SABLE","FLEUR","NUAGE","LIVRE","ROUTE","VOILE","CHIEN","POMME","FORET",
  "JARDIN","MAISON","BATEAU","ORANGE","CHEVAL","SOURIS","DRAGON","MIROIR","VOYAGE",
  "MUSIQUE","FROMAGE","CHAPEAU","BALEINE","GUITARE","FENETRE","CUISINE","VOITURE",
  "MONTAGNE","CHOCOLAT","PAPILLON","ELEPHANT","CROISSANT","DINOSAURE","TELEPHONE","PARAPLUIE","ESCARGOT","PARACHUTE","TOURNESOL",
  "ORDINATEUR","CHAMPIGNON","HIRONDELLE","ASTRONAUTE","CHAMPIONNAT","BIBLIOTHEQUE","PAMPLEMOUSSE","REFRIGERATEUR"];

export const LOCAL_THEMES = ["Drapeaux", "Capitales", "Calcul mental", "Suites logiques", "Anagrammes",
  "Vrai ou faux", "L'intrus", "Plus ou moins", "Devinettes emojis", "Proverbes", "Logique"];

const r = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[r(a.length)];
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const COUNTRIES = RAW.split("\n").map((l) => { const [iso, name, cap, tier] = l.split("|"); return { iso, name, cap: cap === "-" ? null : cap, tier: +tier }; });
const maxTier = (d) => Math.min(3, Math.ceil(d * 0.8));

function poolFor(d, field) {
  let p = COUNTRIES.filter((c) => c.tier <= maxTier(d) && c[field]);
  if (d >= 4) p = p.filter((c) => c.tier >= 2);
  return p;
}
function wrong(c, d, field) {
  const all = COUNTRIES.filter((x) => x.tier <= Math.max(maxTier(d), 2) && x[field] && x[field] !== c[field]);
  return [...new Set(shuffle(all).map((x) => x[field]))].slice(0, 3);
}
// 3 mauvaises réponses proches de la bonne ; l'écart grandit avec la taille du nombre
function numOptions(a, extra = []) {
  const s = new Set([a]);
  extra.filter((v) => Number.isInteger(v) && v >= 0 && v !== a).slice(0, 2).forEach((v) => s.add(v));
  const spread = Math.max(10, Math.round(Math.abs(a) * 0.15));
  while (s.size < 4) { const v = a + r(2 * spread + 1) - spread; if (v >= 0 && v !== a) s.add(v); }
  return shuffle([...s]).map(String);
}

/* ---------- Drapeaux ---------- */
// drapeaux qui se ressemblent : proposés ensemble à partir du niveau 2
const LOOKALIKE = [
  ["ro", "td", "md", "be"], ["id", "mc", "pl", "sg"], ["ie", "ci", "it", "ng"], ["nl", "lu", "fr", "ru"],
  ["ru", "sk", "si", "rs"], ["hr", "rs", "sk", "py"], ["au", "nz", "fj", "gb"], ["se", "fi", "no", "dk", "is"],
  ["co", "ec", "ve"], ["ml", "sn", "gn", "cm"], ["gh", "bo", "et", "lt"], ["de", "be", "ug"],
  ["jo", "sd", "ae", "kw"], ["ar", "uy", "ni", "hn"], ["us", "lr", "my"], ["cn", "vn"], ["tr", "tn"],
  ["in", "ne", "ci"], ["hu", "it", "bg", "ir"], ["at", "lv", "pe", "ca"], ["ch", "dk"], ["jp", "bd", "kr"],
  ["gr", "uy"], ["cd", "cg", "tz"], ["sa", "pk", "dz", "mr"], ["cz", "ph"]
];
const byIso = Object.fromEntries(COUNTRIES.map((c) => [c.iso, c]));
const lookalikes = (iso) => [...new Set(LOOKALIKE.filter((g) => g.includes(iso)).flat())].filter((x) => x !== iso && byIso[x]);

function flag(d) {
  let c;
  if (d >= 2 && r(10) < 7) {
    const pool = poolFor(d, "name").filter((x) => lookalikes(x.iso).length);
    if (pool.length) c = pick(pool);
  }
  if (!c) c = pick(poolFor(d, "name").filter((x) => d >= 2 || x.iso !== "td")); // au niveau 1, pas de piège Tchad / Roumanie
  let o = [c.name];
  if (d >= 2) o.push(...shuffle(lookalikes(c.iso)).slice(0, 3).map((x) => byIso[x].name));
  for (const w of wrong(c, d, "name")) if (o.length < 4 && !o.includes(w)) o.push(w);
  return { t: "Drapeaux", d, q: "Quel est ce drapeau ?", a: c.name, o, img: `https://flagcdn.com/w320/${c.iso}.png`, key: `~flag:${c.iso}` };
}
function capital(d) {
  const c = pick(poolFor(d, "cap"));
  if (c.cap !== c.name && r(2)) return { t: "Capitales", d, q: `${c.cap} est la capitale de quel pays ?`, a: c.name, o: [c.name, ...wrong(c, d, "name")], key: `~cap:${c.iso}:r` };
  return { t: "Capitales", d, q: `${c.name} : quelle est sa capitale ?`, a: c.cap, o: [c.cap, ...wrong(c, d, "cap")], key: `~cap:${c.iso}` };
}
function calc(d) {
  let q, a;
  if (d <= 1) { const x = 1 + r(30), y = 1 + r(30); if (r(2)) { q = `${x} + ${y}`; a = x + y; } else { q = `${Math.max(x, y)} − ${Math.min(x, y)}`; a = Math.abs(x - y); } }
  else if (d === 2) { const x = 2 + r(11), y = 2 + r(11); q = `${x} × ${y}`; a = x * y; }
  else if (d === 3) { const x = 2 + r(9), y = 2 + r(9), z = 1 + r(30); q = `${x} × ${y} + ${z}`; a = x * y + z; }
  else if (d === 4) {
    if (r(2)) { const x = 11 + r(19), y = 3 + r(7); q = `${x} × ${y}`; a = x * y; }
    else { const p = pick([10, 20, 25, 50, 75]), n = 40 * (1 + r(15)); q = `${p} % de ${n}`; a = (n * p) / 100; }
  } else { const x = 12 + r(18), y = 12 + r(18); q = `${x} × ${y}`; a = x * y; }
  return { t: "Calcul mental", d, q: `${q} = ?`, a: String(a), o: numOptions(a), key: `~calc:${q}` };
}

/* ---------- Suites logiques : beaucoup de familles différentes ---------- */
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
const SEQS = [
  // [niveau min, niveau max, nom, fabrique → termes]
  [1, 2, "plus", () => { const s = 1 + r(20), k = 2 + r(8); return [0, 1, 2, 3, 4, 5].map((i) => s + k * i); }],
  [1, 3, "moins", () => { const k = 2 + r(8), s = k * 6 + r(40); return [0, 1, 2, 3, 4, 5].map((i) => s - k * i); }],
  [1, 2, "dizaines", () => { const k = pick([5, 10, 25, 50]), s = k * r(6); return [0, 1, 2, 3, 4, 5].map((i) => s + k * i); }],
  [2, 3, "double", () => { const s = 1 + r(5), k = pick([2, 2, 3]); return [0, 1, 2, 3, 4, 5].map((i) => s * k ** i); }],
  [2, 3, "moitié", () => { const e = pick([1, 3, 5, 7]); return [5, 4, 3, 2, 1, 0].map((i) => e * 2 ** i); }],
  [2, 4, "carrés", () => { const s = 1 + r(6); return [0, 1, 2, 3, 4, 5].map((i) => (s + i) ** 2); }],
  [2, 3, "impairs", () => { const s = 2 * r(10) + 1; return [0, 1, 2, 3, 4, 5].map((i) => s + 2 * i); }],
  [2, 4, "alternée", () => { const s = 1 + r(9), a = 1 + r(5), b = 4 + r(6); const t = [s]; for (let i = 0; i < 6; i++) t.push(t[i] + (i % 2 ? b : a)); return t; }],
  [3, 4, "écarts croissants", () => { const s = 1 + r(10), k = 1 + r(3); const t = [s]; for (let i = 0; i < 5; i++) t.push(t[i] + k * (i + 1)); return t; }],
  [3, 5, "Fibonacci", () => { const t = [1 + r(4), 2 + r(5)]; for (let i = 0; i < 4; i++) t.push(t[i] + t[i + 1]); return t; }],
  [3, 4, "triangulaires", () => { const s = 1 + r(4); return [0, 1, 2, 3, 4, 5].map((i) => ((s + i) * (s + i + 1)) / 2); }],
  [3, 5, "premiers", () => { const s = r(PRIMES.length - 6); return PRIMES.slice(s, s + 6); }],
  [3, 5, "double plus un", () => { const c = pick([1, 2, 3]); const t = [1 + r(4)]; for (let i = 0; i < 5; i++) t.push(t[i] * 2 + c); return t; }],
  [3, 5, "deux suites mêlées", () => { const a = 1 + r(9), k = 2 + r(4), b = 20 + r(30), m = 1 + r(3); const t = []; for (let i = 0; i < 7; i++) t.push(i % 2 ? b - m * ((i - 1) / 2) : a + k * (i / 2)); return t; }],
  [4, 5, "×2 puis +", () => { const c = 1 + r(5); const t = [1 + r(5)]; for (let i = 0; i < 6; i++) t.push(i % 2 ? t[i] + c : t[i] * 2); return t; }],
  [4, 5, "écarts doublés", () => { const s = 1 + r(10), k = 1 + r(2); const t = [s]; for (let i = 0; i < 5; i++) t.push(t[i] + k * 2 ** i); return t; }],
  [4, 5, "cubes", () => { const s = 1 + r(3); return [0, 1, 2, 3, 4, 5].map((i) => (s + i) ** 3); }],
  [4, 5, "n × (n+1)", () => { const s = 1 + r(5); return [0, 1, 2, 3, 4, 5].map((i) => (s + i) * (s + i + 1)); }],
  [4, 5, "carrés + 1", () => { const s = 1 + r(6), c = pick([1, -1, 2]); return [0, 1, 2, 3, 4, 5].map((i) => (s + i) ** 2 + c); }],
  [5, 5, "somme des trois", () => { const t = [1, 1 + r(2), 2 + r(2)]; for (let i = 0; i < 4; i++) t.push(t[i] + t[i + 1] + t[i + 2]); return t; }],
  [5, 5, "factorielles", () => [1, 2, 6, 24, 120, 720]],
  [5, 5, "puissances moins un", () => { const b = pick([2, 3]); return [1, 2, 3, 4, 5, 6].map((i) => b ** i - 1); }]
];
function suite(d) {
  const kind = pick(SEQS.filter((x) => d >= x[0] && d <= x[1]));
  const t = kind[3]();
  const a = t.pop();
  const n = t.length, last = t[n - 1], diff = last - t[n - 2];
  // pièges : continuer comme une suite « + même écart », ou se tromper d'un cran
  const traps = [last + diff, a + (diff || 1), a - (diff || 1), last + (t[n - 2] - t[n - 3])];
  return { t: "Suites logiques", d, q: `Complétez la suite : ${t.join(", ")}, ?`, a: String(a), o: numOptions(a, shuffle(traps.filter((v) => v !== last))), key: `~seq:${t.join(",")}` };
}
function anagramme(d) {
  let pool = WORDS.filter((w) => (d <= 1 ? w.length <= 5 : d === 2 ? w.length === 6 : d === 3 ? w.length === 7 : d === 4 ? w.length >= 8 && w.length <= 9 : w.length >= 10));
  if (pool.length < 4) pool = WORDS;
  const w = pick(pool);
  let s = w;
  for (let i = 0; i < 10 && s === w; i++) s = shuffle(w.split("")).join("");
  const near = WORDS.filter((x) => x !== w).map((x) => [Math.abs(x.length - w.length) + Math.random() * 0.5, x]).sort((p, q) => p[0] - q[0]).slice(0, 3).map((x) => x[1]); // les mots de longueur la plus proche
  return { t: "Anagrammes", d, q: `Remettez les lettres dans l'ordre : ${s.split("").join(" ")}`, a: w, o: [w, ...near], key: `~ana:${w}` };
}

/* ---------- Vrai ou faux ---------- */
// texte | V ou F | niveau (1 facile → 3 difficile)
const VF = `Le Soleil est une étoile.|V|1
La baleine est un poisson.|F|1
L'eau bout à 100 °C au niveau de la mer.|V|1
Une araignée a 6 pattes.|F|1
La Lune tourne autour de la Terre.|V|1
L'océan Pacifique est le plus grand océan du monde.|V|1
La Loire traverse Paris.|F|1
Un triangle a 4 côtés.|F|1
Le panda géant se nourrit surtout de bambou.|V|1
La tour Eiffel se trouve à Lyon.|F|1
Les chauves-souris sont des mammifères.|V|1
Le dauphin respire avec des branchies.|F|1
Une année bissextile compte 366 jours.|V|1
Le cœur humain a 4 cavités.|V|1
Le français est la langue officielle du Brésil.|F|1
Les manchots vivent au pôle Nord.|F|1
Mars est surnommée la planète rouge.|V|1
Un hexagone a 6 côtés.|V|1
Le requin est un mammifère.|F|1
Les autruches peuvent voler.|F|1
Le mont Blanc est le plus haut sommet des Alpes.|V|2
Mercure est la planète la plus proche du Soleil.|V|2
Le diamant est composé de carbone.|V|2
Napoléon Bonaparte est né en Corse.|V|2
La Grande Muraille de Chine est visible à l'œil nu depuis la Lune.|F|2
Le squelette d'un adulte compte 206 os.|V|2
Le Nil se jette dans la mer Rouge.|F|2
Le symbole chimique de l'or est Au.|V|2
La Joconde est exposée au musée du Louvre.|V|2
Le français est une langue officielle du Canada.|V|2
La Révolution française a commencé en 1789.|V|2
Au sens botanique, la tomate est un fruit.|V|2
Jupiter est la plus grande planète du système solaire.|V|2
L'Everest se trouve dans la cordillère des Andes.|F|2
Le koala est un ours.|F|2
La Seine se jette dans la Manche.|V|2
Le son voyage plus vite que la lumière.|F|2
La pieuvre possède trois cœurs.|V|2
La Loire est le plus long fleuve de France.|V|2
Le Portugal a une frontière avec la France.|F|2
Vénus tourne sur elle-même dans le sens inverse de la plupart des planètes.|V|3
Buzz Aldrin est le premier homme à avoir marché sur la Lune.|F|3
L'hydrogène est l'élément le plus abondant de l'Univers.|V|3
Le mot « robot » vient du tchèque.|V|3
La Première Guerre mondiale s'est terminée en 1918.|V|3
Le Sahara est le plus grand désert du monde, déserts froids compris.|F|3
Les flamants roses doivent leur couleur à leur alimentation.|V|3
Le Brésil a remporté 5 Coupes du monde de football.|V|3
Le titane est plus dense que le plomb.|F|3
La Turquie s'étend sur deux continents.|V|3
Shakespeare a écrit « Don Quichotte ».|F|3
La lumière parcourt environ 300 000 km par seconde.|V|3
L'ADN a une structure en double hélice.|V|3
Une année-lumière est une unité de temps.|F|3
Le mercure est un métal liquide à température ambiante.|V|3
La Joconde a été peinte par Michel-Ange.|F|3
Le mur de Berlin est tombé en 1989.|V|3
Le Danube traverse quatre capitales européennes.|V|3
L'Australie est plus grande que le Brésil.|F|3
Le cerveau humain a besoin d'oxygène en permanence.|V|1`.split("\n").map((l) => { const [q, v, n] = l.split("|"); return { q, v: v === "V", n: +n }; });

function vraiFaux(d) {
  const top = d <= 1 ? 1 : d <= 3 ? 2 : 3;
  const low = d >= 4 ? 2 : 1;
  if (r(10) < 3) { // une capitale, vraie ou fausse : variété infinie
    const c = pick(poolFor(d, "cap").filter((x) => x.cap !== x.name));
    const ok = r(2) === 1;
    const cap = ok ? c.cap : pick(COUNTRIES.filter((x) => x.cap && x.cap !== c.cap && x.tier <= Math.max(c.tier, 2))).cap;
    return { t: "Vrai ou faux", d, q: `Vrai ou faux ?\n${c.name} : sa capitale est ${cap}.`, a: ok ? "Vrai" : "Faux", o: ["Vrai", "Faux"], key: `~vf:${cap}:${c.iso}` };
  }
  const s = pick(VF.filter((x) => x.n >= low && x.n <= top));
  return { t: "Vrai ou faux", d, q: `Vrai ou faux ?\n${s.q}`, a: s.v ? "Vrai" : "Faux", o: ["Vrai", "Faux"], key: `~vf:${s.q.slice(0, 40)}` };
}

/* ---------- L'intrus ---------- */
// Dans une même famille, les catégories ne se chevauchent jamais. « * » = élément piège (niveau 3 et plus).
// « ! » devant le nom = catégorie utilisée seulement comme intrus.
const FAMILIES = {
  nourriture: { fruits: "Pomme,Banane,Cerise,Fraise,Kiwi,Mangue,Ananas,Poire,Abricot,Raisin", légumes: "Carotte,Poireau,Navet,Épinard,Brocoli,Radis,Céleri,Chou,Laitue,*Artichaut" },
  animaux: {
    mammifères: "Chien,Chat,Lion,Cheval,Vache,Lapin,Tigre,Ours,*Dauphin,*Baleine,*Chauve-souris,*Ornithorynque",
    oiseaux: "Aigle,Moineau,Pigeon,Hibou,Perroquet,Corbeau,*Manchot,*Autruche",
    poissons: "Saumon,Thon,Truite,Sardine,Carpe,*Requin,*Hippocampe,*Raie",
    reptiles: "Serpent,Lézard,Crocodile,Iguane,*Tortue,*Caméléon",
    insectes: "Fourmi,Abeille,Mouche,Moustique,Coccinelle,*Libellule,*Sauterelle"
  },
  astres: { planètes: "Mercure,Vénus,Mars,Jupiter,Saturne,Uranus,Neptune", "!autres": "Lune,Soleil,*Pluton,*Titan" },
  instruments: { cordes: "Guitare,Violon,Harpe,Violoncelle,Contrebasse,*Banjo", vent: "Flûte,Trompette,Clarinette,Saxophone,*Hautbois,*Cor", percussions: "Batterie,Tambour,Xylophone,Cymbales,*Djembé,*Maracas" },
  pays: {
    Europe: "France,Espagne,Italie,Allemagne,Suède,Pologne,Portugal,*Estonie,*Slovénie",
    Afrique: "Maroc,Sénégal,Kenya,Nigeria,Ghana,*Gabon,*Ouganda",
    Asie: "Japon,Chine,Inde,Thaïlande,Vietnam,*Mongolie,*Laos",
    Amérique: "Brésil,Argentine,Pérou,Chili,Mexique,Canada,*Uruguay,*Équateur"
  },
  artistes: {
    peintres: "Picasso,Monet,Van Gogh,Renoir,Cézanne,Matisse,*Gauguin,*Degas",
    compositeurs: "Mozart,Beethoven,Bach,Chopin,Vivaldi,*Debussy,*Ravel",
    écrivains: "Victor Hugo,Molière,Zola,Balzac,Voltaire,Flaubert,*Maupassant,*Stendhal"
  },
  sports: { collectifs: "Football,Basket,Handball,Rugby,Volley,*Water-polo", individuels: "Judo,Golf,Boxe,Ski alpin,Saut en hauteur,*Escrime,*Lancer du poids" },
  chimie: { métaux: "Fer,Cuivre,Or,Zinc,Aluminium,Plomb,*Nickel,*Titane", gaz: "Oxygène,Azote,Hélium,Néon,Hydrogène,*Argon,*Radon" },
  corps: { organes: "Cœur,Foie,Poumon,Rein,Estomac,*Rate,*Pancréas", os: "Fémur,Tibia,Humérus,Radius,Crâne,*Péroné,*Omoplate" },
  géométrie: { "formes planes": "Carré,Triangle,Cercle,Losange,Rectangle,*Trapèze", solides: "Cube,Sphère,Cylindre,Pyramide,Cône,*Prisme" },
  mois: { "mois de 31 jours": "Janvier,Mars,Mai,Juillet,Août,Octobre,Décembre", "mois de 30 jours": "Avril,Juin,Septembre,Novembre" },
  nombres: { "nombres premiers": "2,3,5,7,11,13,17,19,23,29,31,37", "impairs non premiers": "9,15,21,25,27,33,35,39,49,51" }
};
const HARD_FAMILIES = ["mois", "nombres"]; // seulement à partir du niveau 3
const CATS = Object.entries(FAMILIES).flatMap(([fam, cats]) => Object.entries(cats).map(([name, list]) => ({
  fam, only: name.startsWith("!"), items: list.split(",").map((x) => ({ x: x.replace("*", ""), hard: x.startsWith("*") }))
})));

function intrus(d) {
  for (let tries = 0; tries < 20; tries++) {
    const groups = CATS.filter((c) => !c.only && (d >= 3 || !HARD_FAMILIES.includes(c.fam)));
    const g = pick(groups);
    const members = shuffle(g.items.filter((x) => !x.hard || d >= 3)).slice(0, 3);
    if (d >= 4 && g.items.some((x) => x.hard) && !members.some((x) => x.hard)) members[0] = pick(g.items.filter((x) => x.hard));
    const same = d >= 3 || (d === 2 && r(2));
    const others = CATS.filter((c) => c !== g && (same ? c.fam === g.fam : c.fam !== g.fam && !HARD_FAMILIES.includes(c.fam)));
    if (!others.length) continue;
    const pool = pick(others).items.filter((x) => !x.hard || d >= 3);
    const odd = pick(pool).x;
    const names = members.map((m) => m.x);
    if (names.includes(odd) || g.items.some((m) => m.x === odd) || new Set(names).size < 3) continue;
    return { t: "L'intrus", d, q: "Trouvez l'intrus :", a: odd, o: [odd, ...names], key: `~intrus:${[...names].sort().join(",")}|${odd}` };
  }
  return vraiFaux(d);
}

/* ---------- Plus ou moins ---------- */
// population en millions d'habitants (estimations 2024) et superficie en milliers de km²
const POP = { "Inde": 1450, "Chine": 1410, "États-Unis": 340, "Indonésie": 283, "Pakistan": 251, "Nigeria": 233, "Brésil": 212, "Bangladesh": 174,
  "Russie": 144, "Éthiopie": 132, "Mexique": 131, "Japon": 124, "Égypte": 116, "Philippines": 116, "RD Congo": 109, "Vietnam": 101, "Iran": 91,
  "Turquie": 87, "Allemagne": 84, "Thaïlande": 72, "Royaume-Uni": 69, "France": 68, "Afrique du Sud": 64, "Italie": 59, "Kenya": 56, "Colombie": 53,
  "Corée du Sud": 52, "Espagne": 48, "Algérie": 47, "Argentine": 45, "Irak": 46, "Canada": 41, "Pologne": 38, "Maroc": 38, "Arabie saoudite": 34,
  "Pérou": 34, "Malaisie": 35, "Ghana": 34, "Népal": 30, "Australie": 27, "Chili": 20, "Roumanie": 19, "Pays-Bas": 18, "Sénégal": 18, "Cambodge": 17,
  "Belgique": 11.8, "Tunisie": 12, "Cuba": 11, "Grèce": 10.4, "Portugal": 10.6, "Suède": 10.6, "Hongrie": 9.6, "Autriche": 9.1, "Suisse": 8.9,
  "Bulgarie": 6.4, "Danemark": 6, "Finlande": 5.6, "Norvège": 5.5, "Irlande": 5.3, "Nouvelle-Zélande": 5.2, "Croatie": 3.9, "Lituanie": 2.9,
  "Slovénie": 2.1, "Lettonie": 1.9, "Estonie": 1.4, "Luxembourg": 0.67, "Islande": 0.39 };
const AREA = { "Russie": 17100, "Canada": 9980, "Brésil": 8510, "Australie": 7690, "Inde": 3290, "Argentine": 2780, "Kazakhstan": 2720, "Algérie": 2380,
  "RD Congo": 2340, "Arabie saoudite": 2150, "Mexique": 1960, "Indonésie": 1900, "Libye": 1760, "Iran": 1650, "Mongolie": 1560, "Pérou": 1290,
  "Tchad": 1280, "Niger": 1270, "Angola": 1250, "Mali": 1240, "Afrique du Sud": 1220, "Colombie": 1140, "Éthiopie": 1100, "Égypte": 1000,
  "Nigeria": 920, "Venezuela": 920, "Turquie": 780, "Chili": 760, "Madagascar": 590, "Kenya": 580, "Thaïlande": 513, "Espagne": 506, "Suède": 450,
  "Japon": 378, "Allemagne": 357, "Pologne": 313, "Italie": 301, "Équateur": 256, "Royaume-Uni": 243, "Roumanie": 238, "Nouvelle-Zélande": 268,
  "Uruguay": 176, "Tunisie": 164, "Grèce": 132, "Cuba": 110, "Islande": 103, "Portugal": 92, "Autriche": 84, "Irlande": 70, "Danemark": 43,
  "Belgique": 30.5, "Luxembourg": 2.6 };
// écart entre la bonne réponse et les autres choix, selon le niveau : [minimum, maximum]
// (plus le niveau monte, plus les pays sont proches et donc durs à départager)
const GAP = [null, [3, 12], [1.8, 4], [1.4, 2.5], [1.25, 1.8], [1.15, 1.5]];

function plusMoins(d) {
  const usePop = r(10) < 6, data = usePop ? POP : AREA;
  const most = r(10) < 7; // « le plus » plus souvent que « le moins »
  const n = d <= 1 ? 2 : 4, [lo, hi] = GAP[d];
  const names = Object.keys(data);
  for (let tries = 0; tries < 80; tries++) {
    const win = pick(names), v = data[win];
    const ok = names.filter((x) => { const k = most ? v / data[x] : data[x] / v; return k >= lo && k <= hi; });
    if (ok.length < n - 1) continue;
    const rest = shuffle(ok).slice(0, n - 1);
    const what = usePop ? (most ? "le plus d'habitants" : "le moins d'habitants") : (most ? "la plus grande superficie" : "la plus petite superficie");
    return { t: "Plus ou moins", d, q: `Quel pays a ${what} ?`, a: win, o: [win, ...rest], key: `~pm:${usePop}:${most}:${[win, ...rest].sort().join(",")}` };
  }
  return { t: "Plus ou moins", d, q: "Quel pays a le plus d'habitants ?", a: "Inde", o: ["Inde", "Brésil", "Japon", "France"], key: "~pm:repli" };
}

/* ---------- Devinettes emojis ---------- */
const EMOJI = {
  film: [1, `🦁👑|Le Roi lion
❄️👸⛄|La Reine des neiges
🚢🧊💔|Titanic
🦈🌊🏊|Les Dents de la mer
🧙‍♂️💍🌋|Le Seigneur des anneaux
🐠🔍|Le Monde de Nemo
🦖🏝️|Jurassic Park
👽📞🏠|E.T.
🐀👨‍🍳|Ratatouille
🎈🏠👴|Là-haut
🤠🧸🚀|Toy Story
🍫🏭🎫|Charlie et la chocolaterie
⚡👓🧙|Harry Potter
🏴‍☠️💀🚢|Pirates des Caraïbes
🐼🥋|Kung Fu Panda
👻🚫|SOS Fantômes
⭐⚔️🤖|Star Wars
🧞🪔🐒|Aladdin
🚗⚡🏁|Cars
🤖🌱🌍|WALL-E
🌹👸👹|La Belle et la Bête
👠🕛🎃|Cendrillon
🍎👸💤|Blanche-Neige
🧜‍♀️🌊🦀|La Petite Sirène
🦍🏙️|King Kong
🐉🛡️🧒|Dragons`],
  pays: [1, `🍕🛵🏛️|Italie
🗼🥖🧀|France
🍣🗻🌸|Japon
🌮🌵🎺|Mexique
🦘🏄|Australie
🍁🏒|Canada
🐫🔺|Égypte
⚽🏖️💃|Brésil
🐼🧧🏯|Chine
🍺🥨🚗|Allemagne
🫖💂🌧️|Royaume-Uni
🧇🍫🍟|Belgique
🧀⌚🏔️|Suisse
🥘💃🐂|Espagne
🌷🚲🧀|Pays-Bas
🗽🍔🦅|États-Unis
🍛🐘🕌|Inde
🍵🧿🕌|Turquie`],
  expression: [3, `🐔🦷|Quand les poules auront des dents
🍰🍒|La cerise sur le gâteau
🐜🦵|Avoir des fourmis dans les jambes
👅🐱|Donner sa langue au chat
🐮🇪🇸🗣️|Parler français comme une vache espagnole
🥚🧺|Mettre tous ses œufs dans le même panier
🍐✂️|Couper la poire en deux
🌙🤞|Promettre la lune
🦆🥶|Un froid de canard
🕛🔍🕑|Chercher midi à quatorze heures
🥗🗣️|Raconter des salades
🐟💧😊|Être comme un poisson dans l'eau
🍌😁|Avoir la banane
🐔😱|Avoir la chair de poule
🔥🏞️🚫|Il n'y a pas le feu au lac
🐎💊|Un remède de cheval`]
};
const EMO = Object.entries(EMOJI).map(([k, [lvl, txt]]) => ({ k, lvl, items: txt.split("\n").map((l) => { const [e, a] = l.split("|"); return { e, a }; }) }));
const EMO_Q = { film: "Quel film se cache derrière ces emojis ?", pays: "Quel pays se cache derrière ces emojis ?", expression: "Quelle expression se cache derrière ces emojis ?" };

function emojis(d) {
  const cats = EMO.filter((c) => c.lvl <= d && (d < 4 || c.k !== "pays"));
  const c = pick(cats), it = pick(c.items);
  const o = [it.a, ...shuffle(c.items.filter((x) => x.a !== it.a)).slice(0, 3).map((x) => x.a)];
  return { t: "Devinettes emojis", d, q: `${EMO_Q[c.k]}\n${it.e}`, a: it.a, o, key: `~emo:${it.a}` };
}

/* ---------- Proverbes ---------- */
// début | bonne fin | 3 mauvaises fins | niveau
const PROV = `Petit à petit, l'oiseau fait son|nid|chemin,envol,repas|1
Qui vole un œuf vole un|bœuf|veau,cheval,mouton|1
L'habit ne fait pas le|moine|roi,prêtre,sage|1
Quand le chat n'est pas là, les souris|dansent|chantent,mangent,sortent|1
Après la pluie, le beau|temps|soleil,ciel,jour|1
Mieux vaut tard que|jamais|rien,tôt,demain|1
Loin des yeux, loin du|cœur|corps,monde,regard|1
L'union fait la|force|paix,loi,joie|1
Il n'y a pas de fumée sans|feu|flamme,braise,bois|1
Paris ne s'est pas fait en un|jour|an,mois,siècle|1
Pierre qui roule n'amasse pas|mousse|poussière,sable,terre|2
Rien ne sert de courir, il faut partir à|point|temps,l'heure,l'aube|2
Tout vient à point à qui sait|attendre|patienter,espérer,travailler|2
Les chiens aboient, la caravane|passe|avance,s'arrête,repart|2
Il ne faut pas mettre la charrue avant les|bœufs|chevaux,roues,champs|2
La nuit, tous les chats sont|gris|noirs,invisibles,sauvages|2
Qui sème le vent récolte la|tempête|pluie,foudre,colère|2
C'est en forgeant qu'on devient|forgeron|maître,artisan,fort|2
Une hirondelle ne fait pas le|printemps|été,nid,ciel|2
L'appétit vient en|mangeant|cuisinant,attendant,goûtant|2
Il faut battre le fer tant qu'il est|chaud|rouge,fondu,mou|2
Plus on est de fous, plus on|rit|s'amuse,chante,danse|2
Il ne faut pas vendre la peau de l'ours avant de l'avoir|tué|vu,chassé,attrapé|3
Chat échaudé craint l'eau|froide|chaude,bouillante,glacée|3
À cheval donné, on ne regarde pas les|dents|sabots,yeux,pattes|3
Les petits ruisseaux font les grandes|rivières|mers,eaux,fleuves|3
Qui se ressemble|s'assemble|s'aime,s'attire,s'entend|3
Qui va à la chasse perd sa|place|proie,chaise,route|3
La parole est d'argent, mais le silence est d'|or|diamant,platine,cristal|3
Comme on fait son lit, on se|couche|repose,lève,endort|3
Qui ne risque rien n'a|rien|tout,peur,honte|3
Les absents ont toujours|tort|raison,peur,froid|3
Bien mal acquis ne profite|jamais|toujours,rarement,guère|3
Ce sont les tonneaux vides qui font le plus de|bruit|vent,mal,poussière|3
Un tiens vaut mieux que deux tu l'|auras|as,aurais,avais|3
Il faut tourner sept fois sa langue dans sa bouche avant de|parler|manger,mentir,répondre|3`.split("\n").map((l) => { const [s, a, w, n] = l.split("|"); return { s, a, w: w.split(","), n: +n }; });

function proverbe(d) {
  const top = d <= 1 ? 1 : d <= 2 ? 2 : 3, low = d >= 4 ? 2 : 1;
  const p = pick(PROV.filter((x) => x.n >= low && x.n <= top));
  const glue = p.s.endsWith("'") ? "" : " ";
  return { t: "Proverbes", d, q: `Complétez le proverbe :\n« ${p.s}${glue}… »`, a: p.a, o: [p.a, ...p.w], key: `~prov:${p.s.slice(0, 30)}` };
}

/* ---------- Logique ---------- */
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const REL = { "-2": "avant-hier", "-1": "hier", "0": "aujourd'hui", "1": "demain", "2": "après-demain" };
const NAMES = ["Léa", "Tom", "Inès", "Hugo", "Sarah", "Noah", "Jade", "Adam", "Lina", "Enzo", "Chloé", "Yanis"];
const RIDDLES = `Un fermier a 17 moutons. Tous meurent sauf 9. Combien en reste-t-il ?|9|8;17;0|2
Combien de mois de l'année ont 28 jours ?|12|1;2;6|2
Dans une course, vous doublez le deuxième. À quelle place êtes-vous ?|Deuxième|Premier;Troisième;Dernier|2
Qu'est-ce qui est le plus lourd : un kilo de plumes ou un kilo de plomb ?|Les deux pèsent pareil|Le plomb;Les plumes;Ça dépend de l'air|1
Le père de Marie a cinq filles : Nana, Nene, Nini, Nono. Comment s'appelle la cinquième ?|Marie|Nunu;Nina;Nanou|2
Une batte et une balle coûtent 1,10 € au total. La batte coûte 1 € de plus que la balle. Combien coûte la balle ?|0,05 €|0,10 €;0,01 €;0,15 €|3
5 machines fabriquent 5 objets en 5 minutes. Combien de temps faut-il à 100 machines pour fabriquer 100 objets ?|5 minutes|100 minutes;20 minutes;1 minute|3
Un nénuphar double de taille chaque jour et couvre tout le lac en 48 jours. En combien de jours couvre-t-il la moitié du lac ?|47 jours|24 jours;46 jours;12 jours|3
Un escargot grimpe un mur de 10 m : 3 m le jour, il glisse de 2 m la nuit. En combien de jours atteint-il le sommet ?|8 jours|10 jours;9 jours;5 jours|4`.split("\n").map((l) => { const [q, a, w, n] = l.split("|"); return { q, a, w: w.split(";"), n: +n }; }); // « ; » car les prix contiennent des virgules
const que = (x) => (/^[AEIOUYÉÈÊÂÎ]/i.test(x) ? `qu'${x}` : `que ${x}`); // « qu'Adam », « que Tom »
const hm = (m) => { m = ((m % 1440) + 1440) % 1440; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

function logique(d) {
  const kinds = ["jours", "ordre", "heure"];
  if (d >= 2) kinds.push("âges", "énigme");
  if (d >= 3) kinds.push("poignées", "énigme");
  const k = pick(kinds);
  if (k === "jours") {
    const day = r(7);
    if (d >= 3 && r(2)) { // « dans N jours »
      const n = pick([3, 4, 5, 8, 10, 12, 15, 20]), a = DAYS[(day + n) % 7];
      return { t: "Logique", d, q: `Si aujourd'hui, c'est ${DAYS[day]}, quel jour serons-nous dans ${n} jours ?`, a, o: [a, ...shuffle(DAYS.filter((x) => x !== a)).slice(0, 3)], key: `~log:n:${day}:${n}` };
    }
    const offs = Object.keys(REL).map(Number), from = pick(offs), to = pick(offs.filter((x) => x !== from));
    const lead = from < 0 ? `Si ${REL[from]}, c'était ${DAYS[day]}` : from === 0 ? `Si aujourd'hui, c'est ${DAYS[day]}` : `Si ${REL[from]}, ce sera ${DAYS[day]}`;
    const q2 = to === 0 ? "quel jour sommes-nous aujourd'hui ?" : to < 0 ? `quel jour était-ce ${REL[to]} ?` : `quel jour sera-t-il ${REL[to]} ?`;
    const a = DAYS[(((day + to - from) % 7) + 7) % 7];
    return { t: "Logique", d, q: `${lead}, ${q2}`, a, o: [a, ...shuffle(DAYS.filter((x) => x !== a)).slice(0, 3)], key: `~log:j:${from}:${to}:${day}` };
  }
  if (k === "ordre") {
    const n = d >= 3 ? 4 : 3, who = shuffle(NAMES).slice(0, n); // who[0] est le plus rapide
    const facts = shuffle(who.slice(0, -1).map((x, i) => (r(2) ? `${x} court plus vite ${que(who[i + 1])}` : `${who[i + 1]} court moins vite ${que(x)}`)));
    const fast = r(2) === 1, a = fast ? who[0] : who[n - 1];
    return { t: "Logique", d, q: `${facts.join(". ")}. Qui court le ${fast ? "plus" : "moins"} vite ?`, a, o: who, key: `~log:o:${who.join(",")}:${fast}` };
  }
  if (k === "heure") {
    const start = (7 + r(15)) * 60 + 5 * r(12), dur = (d <= 1 ? 60 * (1 + r(3)) : 60 * r(4) + 5 * (1 + r(11)));
    const a = hm(start + dur), dh = Math.floor(dur / 60), dm = dur % 60;
    const durTxt = `${dh ? `${dh} h` : ""}${dh && dm ? " " : ""}${dm ? `${dm} min` : ""}`;
    const o = [a, hm(start + dur + 60), hm(start + dur - 15), hm(start + dur + 15)];
    return { t: "Logique", d, q: `Il est ${hm(start)}. Quelle heure sera-t-il dans ${durTxt} ?`, a, o, key: `~log:h:${start}:${dur}` };
  }
  if (k === "âges") {
    const [x, y] = shuffle(NAMES).slice(0, 2), t = 4 + r(12), gap = 2 + r(7), n = 2 + r(9), sum = 2 * t + gap + 2 * n;
    return { t: "Logique", d, q: `${x} a ${gap} ans de plus ${que(y)}. Dans ${n} ans, la somme de leurs âges sera ${sum} ans. Quel âge a ${y} aujourd'hui ?`, a: String(t), o: numOptions(t, [t + gap, t + n]), key: `~log:a:${t}:${gap}:${n}` };
  }
  if (k === "poignées") {
    const n = 4 + r(9), a = (n * (n - 1)) / 2;
    return { t: "Logique", d, q: `${n} personnes se serrent toutes la main, une seule fois chacune avec chaque autre. Combien de poignées de main en tout ?`, a: String(a), o: numOptions(a, [n * (n - 1), n * n, n]), key: `~log:p:${n}` };
  }
  const e = pick(RIDDLES.filter((x) => x.n <= Math.max(2, d)));
  return { t: "Logique", d, q: e.q, a: e.a, o: [e.a, ...e.w], key: `~log:e:${e.q.slice(0, 30)}` };
}

export function makeLocal(theme, d = 1) {
  const f = {
    Drapeaux: flag, Capitales: capital, "Calcul mental": calc, "Suites logiques": suite, Anagrammes: anagramme,
    "Vrai ou faux": vraiFaux, "L'intrus": intrus, "Plus ou moins": plusMoins, "Devinettes emojis": emojis, Proverbes: proverbe, Logique: logique
  }[theme];
  return f ? f(Math.min(5, Math.max(1, d))) : null;
}
