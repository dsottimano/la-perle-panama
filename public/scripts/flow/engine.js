import { getNode, resolveNext } from "./graph.js";
import { buildProfile, summarizeProfile, describeProfile, collectFacets, matchesCondition, profileToCSV } from "./schema.js";
import { mountSwipeDeck } from "./swipe.js";

const flow = await fetch("/scripts/flow/flow.json").then(r => { if(!r.ok) throw new Error("Quiz unavailable"); return r.json(); });
// Current published inventory is rendered by the listing template at build time.
const listingsData = [...document.querySelectorAll('[data-listing]')].map(el => ({url:el.dataset.url,title:el.dataset.title,image:el.dataset.image,listingType:el.dataset.type,listingStatus:el.dataset.status,price:Number(el.dataset.price),bedrooms:Number(el.dataset.beds),propertyType:el.dataset.propertyType,region:el.dataset.region,flowTags:[...el.querySelectorAll('[data-tag]')].flatMap(t=>t.textContent.trim().split(/\s+/))}));
const root = document.getElementById("qroot");
const LOCALE = "en";
const state = { answers: {}, swipes: [], matches: [] };

const t = (obj, key) => (LOCALE === "en" ? (obj[`${key}_en`] ?? obj[key]) : obj[key]) ?? "";

// HTML-escape interpolated values. Listing data is editor-authored (CMS), so
// harden against a `"`/`<`/`')` in a title or image breaking out of the
// attribute / url() context when rendered via innerHTML.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Representative path length for the progress bar: walk the graph from the start
// taking the first edge at each node. Branches (gateway, city/coast) are all the
// same length, so this matches whatever path the user actually takes.
function pathLength() {
  let id = flow.startNode, n = 0, guard = 0;
  while (id && guard++ < 100) {
    const node = getNode(flow, id);
    if (!node) break;
    if (!["info", "reveal"].includes(node.type)) n += 1;
    if (node.type === "reveal") break;
    const edge = (flow.edges || []).find((e) => e.source === id);
    id = edge ? edge.target : null;
  }
  return n || 1;
}
const total = pathLength();
new MutationObserver(()=>{const h=root.querySelector(".qtitle");if(h){h.tabIndex=-1;h.focus({preventScroll:true})}}).observe(root,{childList:true});
let answered = 0;

const STR = {
  es: { continue: "Continuar", err: "Ingrese su nombre y un email válido.", see_all: "Ver propiedades",
    contact_soon: "Un asesor le contactará en persona muy pronto.", your_criteria: "Sus criterios",
    driver: "Su motor", read: "Su perfil", features: "Características ML (CSV)", download_csv: "Descargar CSV" },
  en: { continue: "Continue", err: "Please enter your name and a valid email.", see_all: "View properties",
    contact_soon: "An advisor will contact you in person very soon.", your_criteria: "Your criteria",
    driver: "Your driver", read: "Your read", features: "ML features (CSV)", download_csv: "Download CSV" },
}[LOCALE];

// ── client-side property matching for the agency email (filter on hard facets).
// Axis-based ranking waits until listings are tagged on the 4 axes; for now this
// just narrows the inventory so the lead email carries a few relevant options.
function buildQueryPlan(profile) {
  const listingType = profile.intent === "rent_test" ? "rent" : "sale";
  const budget = Number(profile.budget);
  const beds = Number(profile.bedroomsMin);
  return {
    listingType,
    maxPrice: budget > 0 ? budget : undefined,
    minBeds: beds > 0 ? beds : undefined,
    region: profile.region ?? null, propertyType:profile.propertyType, tags: [profile.region === "beach" ? "coastal" : profile.region, profile.cityScene, profile.coastLife].filter(Boolean),
  };
}

function rankListings(listings, plan, take = 3) {
 return listings.filter(l=>l.listingStatus==='active' && l.listingType===plan.listingType && l.price>0 && (!plan.maxPrice || l.price<=plan.maxPrice) && (!plan.minBeds || l.bedrooms>=plan.minBeds) && (!plan.propertyType || plan.propertyType==='either' || (plan.propertyType==='house'?['house','villa']:['apartment','loft','penthouse']).includes(l.propertyType.toLowerCase())))
 .map(l=>({l,score:(l.region===plan.region?3:0)+(plan.tags||[]).filter(t=>l.flowTags.includes(t)).length})).sort((a,b)=>b.score-a.score).slice(0,take).map(x=>x.l);
}

function bgStyle(image) {
  return `background-image:linear-gradient(180deg,rgba(8,20,28,.2),rgba(8,20,28,.55) 55%,rgba(8,20,28,.92)),url('${image || ""}')`;
}

function shell(node) {
  const pct = Math.min(100, Math.round((answered / total) * 100));
  return `
    <div class="qcard">
      <div class="qcard__bg" style="${bgStyle(node.image)}"></div>
      <div class="qtop"><span>PANAMÁ</span><span>${String(answered + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></div>
      <div class="qprog"><div class="qprog__fill" style="width:${pct}%"></div></div>
      <div class="qbody">
        <div class="qkicker">${t(node, "kicker")}</div>
        <h2 class="qtitle">${t(node, "prompt")}</h2>
        <div id="q-controls"></div>
      </div>
    </div>`;
}

function advance(node, answer) {
  if (!["info"].includes(node.type)) answered += 1;
  const nextId = resolveNext(flow, node.id, answer);
  if (nextId) render(nextId);
}

function render(nodeId) {
  const node = getNode(flow, nodeId);
  if (!node) return;
  if (node.type === "info") return renderInfo(node);
  if (node.type === "capture") return advance(node, {});
  if (node.type === "reveal") return renderReveal(node);
  if (node.type === "swipe") return renderSwipe(node);
  root.innerHTML = shell(node);
  const controls = root.querySelector("#q-controls");
  if (node.type === "single") renderSingle(node, controls);
  else if (node.type === "multi") renderMulti(node, controls);
  else if (node.type === "range") renderRange(node, controls);
  
}

function renderInfo(node) {
  root.innerHTML = `
    <div class="qcard">
      <div class="qcard__bg" style="${bgStyle(node.image)}"></div>
      <div class="qbody" style="text-align:center;margin-top:auto;margin-bottom:auto">
        <div class="qkicker">${t(node, "kicker")}</div>
        <h2 class="qtitle" style="font-size:2.4rem">${t(node, "prompt")}</h2>
        <p style="font-weight:300;opacity:.85;margin-bottom:1.3rem">${t(node, "sub")}</p>
        <button class="qcta" id="q-info-next">${t(node, "cta") || STR.continue} ›</button>
      </div>
    </div>`;
  root.querySelector("#q-info-next").onclick = () => advance(node, {});
}

function renderSingle(node, controls) {
  node.options.forEach((opt) => {
    const el = document.createElement("button");
    el.className = "opt";
    el.innerHTML = `${t(opt, "label")} <span class="opt__dia">◊</span>`;
    el.onclick = () => {
      state.answers[node.id] = { optionIds: [opt.id], value: opt.value };
      advance(node, { optionId: opt.id });
    };
    controls.appendChild(el);
  });
}

function renderMulti(node, controls) {
  const chosen = new Set();
  node.options.forEach((opt) => {
    const el = document.createElement("button");
    el.className = "opt";
    el.innerHTML = `${t(opt, "label")} <span class="opt__dia">◊</span>`;
    el.onclick = () => {
      if (chosen.has(opt.id)) { chosen.delete(opt.id); el.classList.remove("is-on"); el.setAttribute("aria-pressed","false"); }
      else { chosen.add(opt.id); el.classList.add("is-on"); el.setAttribute("aria-pressed","true"); }
    };
    controls.appendChild(el);
  });
  const cta = document.createElement("button");
  cta.className = "qcta";
  cta.textContent = STR.continue;
  cta.onclick = () => {
    state.answers[node.id] = { optionIds: [...chosen] };
    advance(node, {});
  };
  controls.appendChild(cta);
}

function renderRange(node, controls) {
  const suffix = t(node, "suffix");
  const fmt = (v) => `${node.prefix || ""}${Number(v).toLocaleString()}${suffix ? " " + suffix : ""}`;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="qrange-val" id="q-rv">${fmt(node.default)}</div>
    <input class="qrange" aria-label="${esc(t(node, "prompt"))}" type="range" min="${node.min}" max="${node.max}" step="${node.step}" value="${node.default}">`;
  const input = wrap.querySelector("input");
  const out = wrap.querySelector("#q-rv");
  input.oninput = () => { out.textContent = fmt(input.value); };
  const cta = document.createElement("button");
  cta.className = "qcta";
  cta.textContent = STR.continue;
  cta.onclick = () => {
    state.answers[node.id] = { value: Number(input.value) };
    advance(node, {});
  };
  controls.appendChild(wrap);
  controls.appendChild(cta);
}

function renderSwipe(node) {
  const pct = Math.min(100, Math.round((answered / total) * 100));
  root.innerHTML = `
    <div class="qcard">
      <div class="qtop"><span>PANAMÁ</span><span>${String(answered + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></div>
      <div class="qprog"><div class="qprog__fill" style="width:${pct}%"></div></div>
      <div class="qkicker" style="margin-top:.9rem">${t(node, "kicker")}</div>
      <p style="font-weight:300;opacity:.7;font-size:.85rem;margin:.3rem 0 0">${t(node, "prompt")}</p>
      <div class="swipe-host" id="q-swipe-host"></div>
    </div>`;
  const host = root.querySelector("#q-swipe-host");
  // Only show cards relevant to the choices made so far (e.g. no beach cards for
  // a city seeker) — keeps the swipe coherent with prior decisions.
  const facets = collectFacets(flow, state);
  const cards = (flow.swipeDeck[node.deck] || [])
    .filter((c) => matchesCondition(c.showIf, facets))
    .map((c) => ({ ...c, label: t(c, "label") }));
  const deck = mountSwipeDeck(host, cards, (results) => {
    state.swipes = results;
    advance(node, {});
  });
  const actions=document.createElement("div");actions.className="swipe-actions";actions.innerHTML='<button class="qcta" type="button">Pass</button><button class="qcta" type="button">Love</button>';root.querySelector(".qcard").append(actions);actions.children[0].onclick=()=>deck.pass();actions.children[1].onclick=()=>deck.like();
}

function renderReveal(node) {
 const built=buildProfile(flow,state);state.profile=built.profile;state.axes=built.axes;
 state.summary=summarizeProfile(built.profile,LOCALE);
 state.matches=rankListings(listingsData,buildQueryPlan(built.profile));
 const recap=state.summary.lines.map(l=>`<div class="recap-row"><span>${esc(l.label)}</span><strong>${esc(l.value)}</strong></div>`).join('');
 const cards=state.matches.map(l=>`<a class="match-card" href="${esc(l.url)}"><img src="${esc(l.image)}" alt="" width="120" height="90" loading="lazy"><div><strong>${esc(l.title)}</strong><span>USD ${l.price.toLocaleString('en-US')}${l.listingType==='rent'?' / month':''}</span></div></a>`).join('');
 const message='Hello Marine, I completed Find your place. '+state.summary.text;
 root.innerHTML=`<div class="qcard"><div class="qbody"><p class="qkicker">Your next chapter</p><h2 class="qtitle">${cards?'Places to explore.':'Let’s find your place together.'}</h2><p>${cards?'These active listings fit your budget, property type and bedroom choices, ranked by lifestyle tags. Marine can help confirm the finer details.':'No active listings fit your budget, property type and bedroom choices today. Marine can help you explore the options.'}</p><div class="match-grid">${cards}</div><h3>Your criteria</h3>${recap}<p>Outdoor space, building age, hospital access and floor preferences need personal confirmation. Your answers have not been sent.</p><a class="qcta" href="https://wa.me/50763070790?text=${encodeURIComponent(message)}">Share your criteria on WhatsApp ↗</a><a class="qcta" href="/contact/">Contact Marine ↗</a><a class="qcta" href="/listings/">Browse all listings</a><button class="qcta" id="q-restart">Start again</button></div></div>`;
 root.querySelector('#q-restart').onclick=()=>{state.answers={};state.swipes=[];answered=0;render(flow.startNode)};
}

const begin = document.getElementById("q-begin");
if (begin) begin.onclick = () => advance(getNode(flow, flow.startNode), {});
