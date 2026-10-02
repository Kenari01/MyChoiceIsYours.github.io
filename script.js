const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const STORAGE = {
  choices: "mciy-v3-choices",
  decisions: "mciy-v3-decisions",
  favorites: "mciy-v3-favorites",
  lists: "mciy-v3-lists",
  theme: "mciy-v3-theme",
  sound: "mciy-v3-sound"
};

const presets = {
  food: ["Pizza", "Burger", "Sushi", "Tacos", "Pâtes", "Kebab"],
  movies: ["Film d'action", "Comédie", "Horreur", "Science-fiction", "Animation", "Documentaire"],
  travel: ["Paris", "Londres", "Barcelone", "Rome", "Lisbonne", "Amsterdam"],
  games: ["Minecraft", "Fortnite", "GTA", "Mario Kart", "Rocket League", "FIFA"],
  weekend: ["Sortir", "Netflix", "Sport", "Gaming", "Restaurant", "Rester tranquille"],
  work: ["Commencer le projet", "Répondre aux mails", "Faire une pause", "Organiser mes tâches", "Appeler un client", "Planifier demain"]
};

const modeInfo = {
  quick: ["MODE RAPIDE", "Choisis pour moi", "🎯"],
  wheel: ["MODE ROUE", "Fais tourner la roue", "🎡"],
  tournament: ["MODE TOURNOI", "Le dernier survivra", "🏆"],
  elimination: ["MODE ÉLIMINATION", "Une option va disparaître", "⚔️"],
  chaos: ["MODE CHAOS", "Aucune logique. Aucun regret.", "💀"],
  smart: ["MODE INTELLIGENT", "Compare tes priorités", "🧠"]
};

let choices = load(STORAGE.choices, []);
let decisions = load(STORAGE.decisions, []);
let favorites = load(STORAGE.favorites, []);
let lists = load(STORAGE.lists, []);
let currentMode = "quick";
let tournamentPool = [];
let tournamentRound = 0;
let eliminationPool = [];
let soundOn = localStorage.getItem(STORAGE.sound) !== "false";
let wheelRotation = 0;
let lastResult = null;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function beep(type="click") {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const notes = { click: 440, win: 660, chaos: 180, tick: 330 };
    osc.frequency.value = notes[type] || 440;
    osc.type = type === "chaos" ? "sawtooth" : "sine";
    gain.gain.setValueAtTime(.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + (type === "win" ? .35 : .09));
    osc.start(); osc.stop(ctx.currentTime + (type === "win" ? .35 : .09));
  } catch {}
}

function renderStats() {
  $("#statDecisions").textContent = decisions.length;
  $("#statChoices").textContent = choices.length;
  $("#statFavorites").textContent = favorites.length;
  $("#statLists").textContent = lists.length;
  $("#choiceCounter").textContent = `${choices.length} option${choices.length > 1 ? "s" : ""}`;
  $("#decideBtn").disabled = choices.length < 2;
}

function renderChoices(highlightIndex=-1) {
  const box = $("#choiceList");
  if (!choices.length) {
    box.className = "choice-list empty";
    box.innerHTML = `<div class="empty-state"><div>✦</div><strong>Tes options apparaîtront ici</strong><span>Ajoute 2 options ou utilise une liste rapide.</span></div>`;
    renderStats();
    return;
  }
  box.className = "choice-list";
  box.innerHTML = choices.map((choice, i) => `
    <div class="choice-item ${i === highlightIndex ? "active-choice" : ""}" data-index="${i}">
      <span class="choice-name">${escapeHtml(choice)}</span>
      <span class="choice-tools">
        <button title="Favori" data-fav="${i}">${favorites.includes(choice) ? "★" : "☆"}</button>
        <button title="Supprimer" data-remove="${i}">×</button>
      </span>
    </div>
  `).join("");
  renderStats();
}

function addChoice(value) {
  const clean = value.trim();
  if (!clean) return;
  if (choices.some(c => c.toLowerCase() === clean.toLowerCase())) {
    toast("Cette option existe déjà.");
    return;
  }
  choices.push(clean);
  save(STORAGE.choices, choices);
  renderChoices();
  $("#choiceInput").value = "";
  $("#choiceInput").focus();
  beep();
}

function removeChoice(index) {
  choices.splice(index, 1);
  save(STORAGE.choices, choices);
  renderChoices();
}

function loadPreset(key) {
  choices = [...presets[key]];
  save(STORAGE.choices, choices);
  resetDecisionUI();
  renderChoices();
  toast("Liste chargée ✨");
  beep();
}

function selectMode(mode) {
  currentMode = mode;
  $$(".mode-choice").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  const [eyebrow, title, icon] = modeInfo[mode];
  $("#modeEyebrow").textContent = eyebrow;
  $("#modeTitle").textContent = title;
  $("#decideIcon").textContent = icon;
  $("#decideText").textContent = mode === "wheel" ? "FAIRE TOURNER" : mode === "tournament" ? "LANCER LE TOURNOI" : mode === "elimination" ? "COMMENCER" : mode === "chaos" ? "LIBÉRER LE CHAOS" : mode === "smart" ? "CALCULER MON CHOIX" : "CHOISIR POUR MOI";
  $("#wheelArea").classList.toggle("hidden", mode !== "wheel");
  $("#tournamentArea").classList.toggle("hidden", mode !== "tournament");
  $("#smartPanel").classList.toggle("hidden", mode !== "smart");
  if (mode === "tournament") startTournament();
  if (mode === "elimination") eliminationPool = [...choices];
  resetDecisionUI(false);
}

function resetDecisionUI(clearMatch=true) {
  $("#resultBox").classList.add("hidden");
  $("#rerollBtn").classList.add("hidden");
  $$(".choice-item").forEach(x => x.classList.remove("active-choice","winner"));
  if (clearMatch && currentMode === "tournament") startTournament();
  if (currentMode === "elimination") eliminationPool = [...choices];
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function recordDecision(result, mode=currentMode) {
  lastResult = result;
  decisions.unshift({
    result,
    mode,
    choices: [...choices],
    date: new Date().toISOString()
  });
  decisions = decisions.slice(0, 50);
  save(STORAGE.decisions, decisions);
  renderHistory();
  renderStats();
}

function showResult(result, subtext="C'est ton choix. Maintenant, assume. 😎") {
  $("#resultText").textContent = result;
  $("#resultSubtext").textContent = subtext;
  $("#resultBox").classList.remove("hidden");
  $("#rerollBtn").classList.remove("hidden");
  beep("win");
  confetti();
}

async function quickDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  $("#resultBox").classList.add("hidden");
  const total = 11;
  for (let n = 0; n < total; n++) {
    const idx = randomIndex(choices.length);
    renderChoices(idx);
    beep("tick");
    await wait(70 + n * 16);
  }
  const result = choices[randomIndex(choices.length)];
  renderChoices(choices.indexOf(result));
  $(`.choice-item[data-index="${choices.indexOf(result)}"]`)?.classList.add("winner");
  recordDecision(result);
  showResult(result);
}

function wheelColors() {
  const colors = ["#7c3aed","#06b6d4","#ec4899","#f59e0b","#22c55e","#8b5cf6","#14b8a6","#f43f5e"];
  return colors;
}
function updateWheel() {
  const wheel = $("#wheel");
  const n = Math.max(choices.length, 2);
  const step = 360 / n;
  const colors = wheelColors();
  let gradient = [];
  for (let i=0;i<n;i++) {
    gradient.push(`${colors[i % colors.length]} ${i*step}deg ${(i+1)*step}deg`);
  }
  wheel.style.background = `conic-gradient(${gradient.join(",")})`;
}
async function wheelDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  updateWheel();
  const winner = randomIndex(choices.length);
  const step = 360 / choices.length;
  const target = 360 - (winner * step + step/2);
  wheelRotation += 1440 + ((target - (wheelRotation % 360) + 360) % 360);
  $("#wheel").style.transform = `rotate(${wheelRotation}deg)`;
  beep("tick");
  await wait(4100);
  const result = choices[winner];
  recordDecision(result);
  showResult(result, "La roue a parlé. Tu peux maintenant arrêter de réfléchir. 🎡");
}

function startTournament() {
  tournamentPool = [...choices].sort(() => Math.random() - .5);
  tournamentRound = 1;
  renderMatch();
}
function renderMatch() {
  const area = $("#matchChoices");
  if (tournamentPool.length <= 1) {
    if (tournamentPool[0]) finishMode(tournamentPool[0], "🏆 Champion du tournoi. Aucun appel possible.");
    area.innerHTML = "";
    return;
  }
  const a = tournamentPool[0], b = tournamentPool[1];
  $("#tournamentRound").textContent = `Round ${tournamentRound} • ${tournamentPool.length} restantes`;
  area.innerHTML = `<button data-match="0">${escapeHtml(a)}</button><button data-match="1">${escapeHtml(b)}</button>`;
}
function tournamentPick(index) {
  const winner = tournamentPool[index];
  tournamentPool.splice(0, 2, winner);
  tournamentRound++;
  beep();
  renderMatch();
}
function tournamentDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  startTournament();
  $("#tournamentArea").scrollIntoView({behavior:"smooth", block:"center"});
  toast("Choisis le gagnant de chaque duel.");
}

async function eliminationDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  eliminationPool = [...choices];
  while (eliminationPool.length > 1) {
    const idx = randomIndex(eliminationPool.length);
    const eliminated = eliminationPool.splice(idx,1)[0];
    toast(`💀 Éliminé : ${eliminated}`);
    beep("chaos");
    renderChoices(choices.indexOf(eliminationPool[0]));
    await wait(650);
  }
  const result = eliminationPool[0];
  recordDecision(result);
  showResult(result, "Tous les autres ont été éliminés. Il ne reste que lui.");
}

async function chaosDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  const chaosTexts = ["L'univers a choisi.", "Pile ou face cosmique.", "Aucune explication.", "Le destin a frappé.", "C'était écrit."];
  for (let i=0;i<15;i++) {
    renderChoices(randomIndex(choices.length));
    beep("chaos");
    await wait(45 + i*20);
  }
  const result = Math.random() > .5 ? choices[randomIndex(choices.length)] : choices[randomIndex(choices.length)];
  recordDecision(result);
  showResult(result, `${chaosTexts[randomIndex(chaosTexts.length)]} 💀`);
}

function smartDecision() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options.");
  const weights = {};
  $$(".criteria-grid input").forEach(input => weights[input.dataset.criterion] = Number(input.value));
  // Client-side decision model: each option gets reproducible random scores for the current session.
  const scores = choices.map((choice, i) => {
    const seed = hashString(choice);
    const values = {
      budget: 4 + ((seed + i*3) % 7),
      envie: 4 + ((seed*3 + i) % 7),
      facilite: 4 + ((seed*5 + i*2) % 7),
      nouveaute: 4 + ((seed*7 + i*4) % 7)
    };
    const total = Object.entries(weights).reduce((sum,[key,w]) => sum + values[key] * w, 0);
    return {choice, total};
  }).sort((a,b) => b.total-a.total);
  const winner = scores[0].choice;
  recordDecision(winner, "smart");
  showResult(winner, `Score de compatibilité : ${Math.round(scores[0].total)}. Le mode intelligent tranche selon tes priorités.`);
}

function hashString(str) {
  let h = 0;
  for (let i=0;i<str.length;i++) h = Math.imul(31,h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function finishMode(result, subtext) {
  recordDecision(result);
  showResult(result, subtext);
}

function decide() {
  switch(currentMode) {
    case "wheel": return wheelDecision();
    case "tournament": return tournamentDecision();
    case "elimination": return eliminationDecision();
    case "chaos": return chaosDecision();
    case "smart": return smartDecision();
    default: return quickDecision();
  }
}

function renderHistory() {
  const box = $("#historyList");
  if (!decisions.length) {
    box.innerHTML = `<div class="no-data">Aucune décision pour le moment. Ton premier choix t'attend. ✦</div>`;
    return;
  }
  const icons = {quick:"🎯",wheel:"🎡",tournament:"🏆",elimination:"⚔️",chaos:"💀",smart:"🧠"};
  box.innerHTML = decisions.slice(0,12).map(d => {
    const date = new Date(d.date);
    return `<div class="history-item"><div class="history-icon">${icons[d.mode] || "✦"}</div><div><strong>${escapeHtml(d.result)}</strong><span>${escapeHtml((modeInfo[d.mode] || ["MODE"])[0] || d.mode)} • ${d.choices.length} options</span></div><time>${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</time></div>`;
  }).join("");
}

function renderLists() {
  const box = $("#savedLists");
  if (!lists.length) {
    box.innerHTML = `<div class="no-data">Aucune liste sauvegardée. Crée une liste puis clique sur « Enregistrer la liste ».</div>`;
    return;
  }
  box.innerHTML = lists.map((list,i) => `
    <article class="saved-list">
      <h4>${escapeHtml(list.name)}</h4>
      <p>${list.items.map(escapeHtml).join(" • ")}</p>
      <div class="list-actions">
        <button data-load-list="${i}">Charger</button>
        <button data-delete-list="${i}">Supprimer</button>
      </div>
    </article>
  `).join("");
}

function saveCurrentList() {
  if (choices.length < 2) return toast("Ajoute au moins 2 options avant d'enregistrer.");
  const name = prompt("Nom de ta liste :", "Ma liste");
  if (!name?.trim()) return;
  lists.unshift({name:name.trim(), items:[...choices]});
  lists = lists.slice(0,20);
  save(STORAGE.lists, lists);
  renderLists(); renderStats();
  toast("Liste enregistrée ⭐");
}

function makeShareUrl() {
  const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({choices})))));
  return `${location.origin}${location.pathname}#choices=${payload}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Lien copié 🔗"); }
  catch { prompt("Copie ce lien :", text); }
}

function confetti() {
  const box = $("#confetti");
  box.innerHTML = "";
  for (let i=0;i<55;i++) {
    const el = document.createElement("i");
    el.style.left = `${Math.random()*100}%`;
    el.style.setProperty("--x", `${(Math.random()-.5)*180}px`);
    el.style.animationDelay = `${Math.random()*.35}s`;
    el.style.background = ["#7c3aed","#06b6d4","#ec4899","#22c55e","#f59e0b"][i%5];
    box.appendChild(el);
  }
  setTimeout(() => box.innerHTML="", 2200);
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function importFromHash() {
  const raw = location.hash.match(/#choices=([^&]+)/)?.[1];
  if (!raw) return;
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw)))));
    if (Array.isArray(decoded.choices) && decoded.choices.length) {
      choices = decoded.choices.slice(0,30);
      save(STORAGE.choices, choices);
      toast("Liste reçue depuis un lien 🔗");
    }
  } catch {}
}

$("#addChoice").addEventListener("click", () => addChoice($("#choiceInput").value));
$("#choiceInput").addEventListener("keydown", e => { if (e.key === "Enter") addChoice(e.target.value); });
$("#choiceList").addEventListener("click", e => {
  const fav = e.target.closest("[data-fav]");
  const rem = e.target.closest("[data-remove]");
  if (fav) {
    const value = choices[Number(fav.dataset.fav)];
    favorites = favorites.includes(value) ? favorites.filter(x => x !== value) : [...favorites, value];
    save(STORAGE.favorites, favorites); renderChoices(); renderStats(); beep();
  }
  if (rem) removeChoice(Number(rem.dataset.remove));
});
$$(".preset-grid button").forEach(btn => btn.addEventListener("click", () => loadPreset(btn.dataset.preset)));
$("#randomPreset").addEventListener("click", () => loadPreset(Object.keys(presets)[randomIndex(Object.keys(presets).length)]));
$("#clearChoices").addEventListener("click", () => {
  if (!choices.length) return;
  choices = []; save(STORAGE.choices, choices); resetDecisionUI(); renderChoices(); toast("Options effacées.");
});
$$(".mode-choice").forEach(btn => btn.addEventListener("click", () => selectMode(btn.dataset.mode)));
$$(".feature-card").forEach(card => card.addEventListener("click", () => {
  selectMode(card.dataset.selectMode);
  $("#app").scrollIntoView({behavior:"smooth"});
}));
$("#decideBtn").addEventListener("click", decide);
$("#rerollBtn").addEventListener("click", () => { $("#resultBox").classList.add("hidden"); decide(); });
$("#rejectResult").addEventListener("click", () => { $("#resultBox").classList.add("hidden"); decide(); });
$("#acceptResult").addEventListener("click", () => { toast("Décision assumée. 😎"); beep("win"); $("#resultBox").classList.add("hidden"); });
$("#shareResult").addEventListener("click", () => copyText(`${lastResult || "Ma décision"} — décidé avec My Choice Is Yours ${location.href}`));
$("#shareBtn").addEventListener("click", () => copyText(makeShareUrl()));
$("#copyDecisionLink").addEventListener("click", () => copyText(makeShareUrl()));
$("#saveListBtn").addEventListener("click", saveCurrentList);
$("#savedLists").addEventListener("click", e => {
  const loadBtn = e.target.closest("[data-load-list]");
  const deleteBtn = e.target.closest("[data-delete-list]");
  if (loadBtn) {
    const list = lists[Number(loadBtn.dataset.loadList)];
    choices = [...list.items]; save(STORAGE.choices, choices); renderChoices(); toast(`Liste « ${list.name} » chargée.`);
    $("#app").scrollIntoView({behavior:"smooth"});
  }
  if (deleteBtn) {
    lists.splice(Number(deleteBtn.dataset.deleteList),1); save(STORAGE.lists, lists); renderLists(); renderStats();
  }
});
$("#clearHistory").addEventListener("click", () => {
  if (!decisions.length) return;
  if (confirm("Effacer tout l'historique ?")) { decisions=[]; save(STORAGE.decisions, decisions); renderHistory(); renderStats(); toast("Historique effacé."); }
});
$("#soundBtn").addEventListener("click", () => {
  soundOn = !soundOn; localStorage.setItem(STORAGE.sound, soundOn); $("#soundBtn").textContent = soundOn ? "🔊" : "🔇"; toast(soundOn ? "Sons activés." : "Sons désactivés.");
});
$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
  localStorage.setItem(STORAGE.theme, document.body.classList.contains("light") ? "light" : "dark");
});
$("#surpriseHero").addEventListener("click", () => {
  const keys = Object.keys(presets);
  loadPreset(keys[randomIndex(keys.length)]);
  selectMode(["quick","wheel","chaos"][randomIndex(3)]);
  $("#app").scrollIntoView({behavior:"smooth"});
});
$("#matchChoices").addEventListener("click", e => {
  const btn = e.target.closest("[data-match]");
  if (btn) tournamentPick(Number(btn.dataset.match));
});
$$(".criteria-grid input").forEach(input => input.addEventListener("input", e => e.target.nextElementSibling.value = e.target.value));

if (localStorage.getItem(STORAGE.theme) === "light") document.body.classList.add("light");
$("#soundBtn").textContent = soundOn ? "🔊" : "🔇";

importFromHash();
renderChoices();
renderHistory();
renderLists();
renderStats();
updateWheel();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
