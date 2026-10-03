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
fj|Fidji|Suva|3`;

const WORDS = ["LUNE","CIEL","ROSE","PAIN","LAIT","TRAIN","TABLE","PLAGE","SABLE","FLEUR","NUAGE","LIVRE","ROUTE","VOILE","CHIEN","POMME","FORET",
  "JARDIN","MAISON","BATEAU","ORANGE","CHEVAL","SOURIS","DRAGON","MIROIR","VOYAGE",
  "MUSIQUE","FROMAGE","CHAPEAU","BALEINE","GUITARE","FENETRE","CUISINE","VOITURE",
  "MONTAGNE","CHOCOLAT","PAPILLON","ELEPHANT","CROISSANT","DINOSAURE","TELEPHONE","PARAPLUIE","ESCARGOT","PARACHUTE","TOURNESOL",
  "ORDINATEUR","CHAMPIGNON","HIRONDELLE","ASTRONAUTE","CHAMPIONNAT","BIBLIOTHEQUE","PAMPLEMOUSSE","REFRIGERATEUR"];

export const LOCAL_THEMES = ["Drapeaux", "Capitales", "Calcul mental", "Suites logiques", "Anagrammes"];

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
function numOptions(a) {
  const s = new Set([a]);
  while (s.size < 4) { const v = a + r(21) - 10; if (v >= 0 && v !== a) s.add(v); }
  return [...s].map(String);
}

function flag(d) {
  const c = pick(poolFor(d, "name").filter((x) => x.iso !== "td")); // le Tchad ressemble trop à la Roumanie
  return { t: "Drapeaux", d, q: "Quel est ce drapeau ?", a: c.name, o: [c.name, ...wrong(c, d, "name")], img: `https://flagcdn.com/w320/${c.iso}.png`, key: `~flag:${c.iso}` };
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
function suite(d) {
  const kind = d <= 1 ? 0 : d === 2 ? r(2) : d === 3 ? 1 + r(3) : 2 + r(3);
  let t = [];
  if (kind === 0) { const s = 1 + r(9), k = 2 + r(6); for (let i = 0; i < 6; i++) t.push(s + k * i); }
  else if (kind === 1) { const s = 1 + r(3), k = 2 + r(2); for (let i = 0; i < 6; i++) t.push(s * k ** i); }
  else if (kind === 2) { const s = 1 + r(5); for (let i = 0; i < 6; i++) t.push((s + i) ** 2); }
  else if (kind === 3) { let x = 1 + r(3), y = 2 + r(4); t = [x, y]; for (let i = 0; i < 4; i++) t.push(t[t.length - 1] + t[t.length - 2]); }
  else { let x = 1 + r(9); const a = 2 + r(4), b = 6 + r(5); t = [x]; for (let i = 0; i < 5; i++) t.push(t[i] + (i % 2 ? b : a)); }
  const a = t.pop();
  return { t: "Suites logiques", d, q: `Complétez la suite : ${t.join(", ")}, ?`, a: String(a), o: numOptions(a), key: `~seq:${t.join(",")}` };
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

export function makeLocal(theme, d = 1) {
  const f = { Drapeaux: flag, Capitales: capital, "Calcul mental": calc, "Suites logiques": suite, Anagrammes: anagramme }[theme];
  return f ? f(Math.min(5, Math.max(1, d))) : null;
}
