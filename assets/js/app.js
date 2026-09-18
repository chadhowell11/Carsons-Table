/* ============================ STATE ============================ */
const $ = s => document.querySelector(s);
const money = n => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
let TAB = "dinner", QUERY = "", FILTERS = new Set(), CART = [], MODE = "Pickup";
try { const s = localStorage.getItem("ct_cart"); if (s) CART = JSON.parse(s) || []; } catch(e){}
const save = () => { try { localStorage.setItem("ct_cart", JSON.stringify(CART)); } catch(e){} };

const DIETS = [
  {k:"v",   l:"Vegetarian"},
  {k:"nos", l:"Without shellfish"},
  {k:"hot", l:"Something spicy"},
  {k:"u20", l:"Under $20"}
];

/* ============================ MENU RENDER ============================ */
function buildTabs(){
  $("#tabs").innerHTML = Object.entries(MENUS).map(([k,m]) =>
    `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k===TAB}">${m.label}<span class="hrs">${m.hrs}</span></button>`).join("");
  $("#dietChips").innerHTML = DIETS.map(d =>
    `<button class="chip" data-diet="${d.k}" aria-pressed="false">${d.l}</button>`).join("");
}

function matches(it, isWine){
  const q = QUERY.trim().toLowerCase();
  if (q){
    const hay = [it.n, it.d, it.v, it.g, ...(it.o||[]).flatMap(g => g.c.map(c => c.l))].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (isWine) return !FILTERS.has("u20") || (it.gl || 99) < 20;
  for (const f of FILTERS){
    if (f==="v"   && !it.v) return false;
    if (f==="nos" && it.s)  return false;
    if (f==="hot" && !it.hot) return false;
    if (f==="u20" && !(it.p !== null && it.p < 20)) return false;
  }
  return true;
}

function tagsFor(it){
  const t = [];
  if (it.v) t.push(`<span class="tag">Vegetarian</span>`);
  if (it.hot) t.push(`<span class="tag">Spicy</span>`);
  if (it.s) t.push(`<span class="tag">Shellfish</span>`);
  if (it.o && it.o.length) t.push(`<span class="tag opt">Choices</span>`);
  return t.length ? `<div class="item-tags">${t.join("")}</div>` : "";
}

function renderMenu(){
  const menu = MENUS[TAB];
  const nav = [], out = [];
  let shown = 0;

  menu.courses.forEach(c => {
    const items = c.items.filter(it => matches(it, c.wine));
    if (!items.length) return;
    shown += items.length;
    nav.push(`<a href="#${c.id}" data-course="${c.id}">${c.name}</a>`);

    let body;
    if (c.wine){
      body = `<table class="winetable"><thead><tr><th>Selection</th><th>&frac12; gl</th><th>Glass</th><th>Bottle</th></tr></thead><tbody>` +
        items.map(w => {
          const cell = (amt, pour) => amt
            ? `<td><button class="pour" data-wine="${esc(w.n)}" data-pour="${pour}" data-amt="${amt}">${amt}</button></td>`
            : `<td><span class="w-dash">&mdash;</span></td>`;
          return `<tr><td><div class="w-n">${w.n}</div><div class="w-v"><span class="grape">${w.g}</span> &nbsp;${w.v}</div></td>` +
            cell(w.h,"half glass") + cell(w.gl,"glass") + cell(w.b,"bottle") + `</tr>`;
        }).join("") + `</tbody></table>`;
    } else {
      body = `<div class="items">` + items.map(it => {
        const idx = c.items.indexOf(it);
        const price = it.p === null ? `<span class="p mp">Bar price</span>` : `<span class="p">${money(it.p)}</span>`;
        const btn = it.p === null
          ? `<span class="add ask">Ask your server</span>`
          : `<button class="add" data-add="${c.id}:${idx}" aria-label="Add ${esc(it.n)} to your order"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>`;
        const th = it.img ? `<img class="item-thumb" src="${IMG[it.img+"_t"]}" alt="${esc(it.n)}" loading="lazy"
             role="button" tabindex="0" data-zoom="${it.img}" data-zn="${esc(it.n)}" data-zd="${esc(it.d||"")}">` : "";
        return `<div class="item">${th}<div class="item-main">
            <div class="item-title"><span class="n">${it.n}</span><i class="leader"></i>${price}</div>
            ${it.d ? `<p class="item-d">${it.d}</p>` : ""}${tagsFor(it)}
          </div>${btn}</div>`;
      }).join("") + `</div>`;
    }

    out.push(`<section class="course" id="${c.id}"><div class="course-h"><h3>${c.name}</h3></div>
      ${c.note ? `<p class="course-note">${c.note}</p>` : ""}${body}</section>`);
  });

  $("#coursenav").innerHTML = nav.join("");
  $("#courses").innerHTML = shown ? out.join("") :
    `<div class="empty"><b>Nothing on this menu matches</b>Try clearing a filter, or look on the ${TAB==="dinner"?"lunch":"dinner"} menu.</div>`;
  spy();
}
const esc = s => String(s).replace(/"/g,"&quot;");

/* ============================ ITEM MODAL ============================ */
let PEND = null;
function openItem(courseId, idx){
  const c = MENUS[TAB].courses.find(c => c.id === courseId);
  const it = c.items[idx];
  if (!it.o || !it.o.length){ addLine(it.n, it.p, [], 1); return; }
  PEND = {it, qty:1, sel:it.o.map(() => [])};
  const ph = $("#mPhoto");
  if (it.img){ ph.src = IMG[it.img]; ph.style.display = "block";
    ph.dataset.zoom = it.img; ph.dataset.zn = it.n; ph.dataset.zd = it.d || ""; } else { ph.removeAttribute("src"); ph.style.display = "none"; }
  $("#mTitle").textContent = it.n;
  $("#mDesc").textContent = it.d || "";
  $("#mQty").textContent = 1;
  drawOpts();
  $("#modal").classList.add("on"); $("#scrim").classList.add("on");
}
function drawOpts(){
  const {it, sel} = PEND;
  $("#mBody").innerHTML = it.o.map((g, gi) => {
    const rows = g.c.map((c, ci) => {
      const on = sel[gi].includes(ci);
      const extra = c.mp ? `<span class="op">market</span>` : (c.p ? `<span class="op">+${money(c.p)}</span>` : "");
      return `<label class="opt ${on?"sel":""}"><input type="${g.t==="one"?"radio":"checkbox"}" name="g${gi}" ${on?"checked":""} data-g="${gi}" data-c="${ci}"><span class="ol">${c.l}</span>${extra}</label>`;
    }).join("");
    return `<div class="grp"><div class="grp-h"><b>${g.g}</b><i>${g.t==="one"||g.req?"Required":"Optional"}</i></div>${rows}</div>`;
  }).join("");
  $("#mAdd").textContent = "Add to order · " + money(pendTotal());
}
function pendTotal(){
  const {it, sel, qty} = PEND;
  let t = it.p || 0;
  it.o.forEach((g, gi) => sel[gi].forEach(ci => { t += g.c[ci].p || 0; }));
  return t * qty;
}
function closeModal(){ $("#modal").classList.remove("on"); if(!$("#drawer").classList.contains("on")) $("#scrim").classList.remove("on"); PEND=null; }

/* ============================ CART ============================ */
function addLine(name, price, opts, qty, mp){
  const key = name + "|" + opts.join("|");
  const hit = CART.find(l => l.key === key);
  if (hit) hit.q += qty; else CART.push({key, n:name, p:price||0, o:opts, q:qty, mp:!!mp});
  save(); paintCart(); toast(`<b>${qty}&times;</b> ${name} added to your order`);
}
function paintCart(){
  const n = CART.reduce((a,l) => a + l.q, 0);
  $("#cartCount").textContent = n;
  $("#cartBtn").classList.toggle("has", n > 0);

  if (!CART.length){
    $("#cartBody").innerHTML = `<div class="cart-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 7h16l-1.4 12.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
      <b>Nothing here yet</b>Add a dish from the menu and it will show up here.</div>`;
    $("#cartFoot").innerHTML = `<button class="btn btn-line" id="keepBrowsing" style="width:100%;padding:14px">Browse the menu</button>`;
    $("#keepBrowsing").onclick = () => { closeDrawer(); $("#menu").scrollIntoView(); };
    return;
  }

  $("#cartBody").innerHTML = CART.map((l,i) => `<div class="line"><div class="line-m">
      <div class="line-n">${l.n}</div>
      ${l.o.length ? `<div class="line-o">${l.o.join(" &middot; ")}</div>` : ""}
      <div class="qty"><button data-q="${i}:-1" aria-label="One fewer">&minus;</button><span>${l.q}</span><button data-q="${i}:1" aria-label="One more">+</button></div>
      <button class="line-rm" data-rm="${i}">Remove</button>
    </div><div class="line-p">${l.mp ? "market" : money(l.p * l.q)}</div></div>`).join("");

  const sub = CART.reduce((a,l) => a + l.p * l.q, 0);
  const tax = sub * 0.0945;
  const anyMp = CART.some(l => l.mp) || CART.some(l => l.o.some(o => /market/i.test(o)));
  $("#cartFoot").innerHTML = `
    <div class="mode">
      <button data-mode="Pickup" aria-pressed="${MODE==="Pickup"}">Pickup</button>
      <button data-mode="Curbside" aria-pressed="${MODE==="Curbside"}">Curbside</button>
    </div>
    <div class="tot"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="tot"><span>Estimated tax</span><span>${money(tax)}</span></div>
    <div class="tot grand"><span>Total</span><span>${money(sub+tax)}</span></div>
    ${anyMp ? `<p class="mpnote">Market-price items are quoted by the kitchen and added when your order is confirmed.</p>` : ""}
    <button class="btn btn-solid" id="checkout">Checkout &mdash; ready in about 20 min</button>`;
}
function openDrawer(){ $("#drawer").classList.add("on"); $("#scrim").classList.add("on"); }
function closeDrawer(){ $("#drawer").classList.remove("on"); if(!$("#modal").classList.contains("on")) $("#scrim").classList.remove("on"); }

let tt;
function toast(html){
  const el = $("#toast"); el.innerHTML = html; el.classList.add("on");
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 2600);
}

/* ============================ RESERVATIONS ============================ */
const TIMES = ["4:45","5:00","5:15","5:30","6:00","6:15","6:45","7:15","7:30","8:00","8:15","8:45"];
const FULL = new Set(["5:30","6:15","8:15"]);
let SLOT = "7:15";
function buildSlots(){
  $("#slots").innerHTML = TIMES.map(t => {
    const full = FULL.has(t);
    return `<button class="slot ${full?"full":""}" data-slot="${t}" aria-pressed="${t===SLOT&&!full}" ${full?"disabled":""}>${t} PM</button>`;
  }).join("");
}
function prettyDate(v){
  if (!v) return "Tonight";
  const [y,m,d] = v.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US",{weekday:"long", month:"long", day:"numeric"});
}

/* ============================ SCROLLSPY + CLOCK ============================ */
let obs;
function spy(){
  if (obs) obs.disconnect();
  const links = [...document.querySelectorAll("#coursenav a")];
  if (!links.length) return;
  links[0].classList.add("on");
  obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting){
        links.forEach(a => a.classList.toggle("on", a.dataset.course === e.target.id));
      }
    });
  }, {rootMargin:"-100px 0px -70% 0px"});
  document.querySelectorAll(".course").forEach(c => obs.observe(c));
}

function clock(){
  const now = new Date(), day = now.getDay(), h = now.getHours() + now.getMinutes()/60;
  const late = (day===5 || day===6), closeH = late ? "10:00" : "9:00";
  let state = "Closed right now", until = "Opens Monday at 11:00 AM", wait = "No wait";
  if (day === 0){ state = "Closed Sundays"; until = "See you Monday at 11:00 AM"; }
  else if (h >= 11 && h < 14){ state = "Serving lunch"; until = "Lunch until 2:00 PM"; wait = "10–15 min"; }
  else if (h >= 14 && h < 16){ state = "Between services"; until = "Dinner begins at 4:00 PM"; wait = "No wait"; }
  else if (h >= 16 && h < (late ? 22 : 21)){ state = "Serving dinner"; until = "Kitchen open until " + closeH; wait = h > 17.5 && h < 20 ? "25–35 min" : "10–20 min"; }
  else if (h < 11){ until = "Opens today at 11:00 AM"; }
  $("#openState").textContent = state;
  $("#openUntil").textContent = until;
  $("#waitNow").innerHTML = wait;
  $("#waitBig").innerHTML = wait;
}

/* ============================ EVENTS ============================ */
document.addEventListener("click", e => {
  const t = e.target;
  const tab = t.closest("[data-tab]");
  if (tab){ TAB = tab.dataset.tab; document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab===TAB)); renderMenu(); return; }

  const chip = t.closest("[data-diet]");
  if (chip){ const k = chip.dataset.diet;
    FILTERS.has(k) ? FILTERS.delete(k) : FILTERS.add(k);
    chip.setAttribute("aria-pressed", FILTERS.has(k)); renderMenu(); return; }

  const add = t.closest("[data-add]");
  if (add){ const [c,i] = add.dataset.add.split(":"); openItem(c, +i); return; }

  const pour = t.closest("[data-wine]");
  if (pour){ addLine(pour.dataset.wine, +pour.dataset.amt, [pour.dataset.pour], 1); return; }

  if (t.closest("#cartBtn")){ openDrawer(); return; }
  if (t.closest("#closeDrawer")){ closeDrawer(); return; }
  if (t.id === "scrim"){ closeDrawer(); closeModal(); return; }

  const q = t.closest("[data-q]");
  if (q){ const [i,d] = q.dataset.q.split(":").map(Number);
    CART[i].q += d; if (CART[i].q < 1) CART.splice(i,1); save(); paintCart(); return; }

  const rm = t.closest("[data-rm]");
  if (rm){ CART.splice(+rm.dataset.rm,1); save(); paintCart(); return; }

  const md = t.closest("[data-mode]");
  if (md){ MODE = md.dataset.mode; paintCart(); return; }

  if (t.closest("#checkout")){
    toast("This is a concept &mdash; <b>no payment was taken.</b> Live, this would hand off to the kitchen.");
    return;
  }

  const seat = t.closest("[data-seat]");
  if (seat){ document.querySelectorAll("[data-seat]").forEach(b => b.setAttribute("aria-pressed", b===seat)); return; }

  const slot = t.closest("[data-slot]");
  if (slot && !slot.disabled){ SLOT = slot.dataset.slot;
    document.querySelectorAll("[data-slot]").forEach(b => b.setAttribute("aria-pressed", b===slot)); return; }

  if (t.closest("#waitlistBtn")){
    toast("You'd be on the list &mdash; <b>we'd text you</b> when your table is close.");
    return;
  }
});

$("#q").addEventListener("input", e => { QUERY = e.target.value; renderMenu(); });

$("#mBody").addEventListener("change", e => {
  const inp = e.target.closest("input"); if (!inp || !PEND) return;
  const gi = +inp.dataset.g, ci = +inp.dataset.c, g = PEND.it.o[gi];
  if (g.t === "one") PEND.sel[gi] = [ci];
  else PEND.sel[gi] = inp.checked ? [...PEND.sel[gi], ci] : PEND.sel[gi].filter(x => x !== ci);
  drawOpts();
});
$("#mPlus").onclick = () => { PEND.qty++; $("#mQty").textContent = PEND.qty; drawOpts(); };
$("#mMinus").onclick = () => { if (PEND.qty > 1){ PEND.qty--; $("#mQty").textContent = PEND.qty; drawOpts(); } };
$("#mAdd").onclick = () => {
  const {it, sel, qty} = PEND;
  const missing = it.o.findIndex((g,gi) => (g.t==="one"||g.req) && !sel[gi].length);
  if (missing > -1){ toast(`Choose an option under <b>${it.o[missing].g}</b>`); return; }
  const labels = [], mp = [];
  let price = it.p || 0;
  it.o.forEach((g,gi) => sel[gi].forEach(ci => {
    const c = g.c[ci]; labels.push(c.mp ? c.l + " (market)" : c.l); price += c.p || 0;
    if (c.mp) mp.push(1);
  }));
  addLine(it.n, price, labels, qty, false);
  closeModal();
};
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !document.getElementById("lb").classList.contains("on")){ closeModal(); closeDrawer(); } });

$("#bookBtn").onclick = () => {
  const name = $("#rname").value.trim();
  if (!name){ $("#rname").focus(); toast("Add a name so we know who to seat"); return; }
  const seat = document.querySelector('[data-seat][aria-pressed="true"]').dataset.seat;
  $("#resDetail").innerHTML = `<b>${name}</b> &middot; ${$("#party").value}<br>${prettyDate($("#date").value)} at ${SLOT} PM<br>${seat}`;
  $("#resForm").style.display = "none";
  $("#resOk").classList.add("on");
  $("#resOk").scrollIntoView({block:"center"});
};
$("#resAgain").onclick = () => { $("#resOk").classList.remove("on"); $("#resForm").style.display = ""; };

const fsb = document.getElementById("fsBtn");
if (fsb) fsb.onclick = async () => {
  const el = document.documentElement;
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (!isFs){
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else { toast("Open this link in Safari for full screen"); return; }
      fsb.textContent = "Exit full screen";
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      fsb.textContent = "Full screen";
    }
  } catch(e){ toast("Open this link in Safari for full screen"); }
};

function renderPlates(){
  const g = document.getElementById("plateGrid");
  if (!g) return;
  g.innerHTML = PLATES.map(p => `<a class="plate ${p.cls}" href="#${p.go}" data-plate="${p.tab}:${p.go}">
      <img src="${IMG[p.k]}" alt="${p.n}" loading="lazy">
      <div class="plate-cap"><div class="pn">${p.n}</div><div class="pm">${p.m}</div></div></a>`).join("");
}
document.addEventListener("click", e => {
  const pl = e.target.closest("[data-plate]");
  if (!pl) return;
  e.preventDefault();
  const [tab, go] = pl.dataset.plate.split(":");
  if (TAB !== tab){
    TAB = tab;
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === TAB));
    QUERY = ""; $("#q").value = ""; FILTERS.clear();
    document.querySelectorAll("[data-diet]").forEach(c => c.setAttribute("aria-pressed", false));
    renderMenu();
  }
  const target = document.getElementById(go) || document.getElementById("menu");
  target.scrollIntoView();
});

/* ---------- lightbox ---------- */
function zoom(key, name, desc){
  $("#lbImg").src = IMG[key];
  $("#lbImg").alt = name;
  $("#lbCap").innerHTML = name + (desc ? `<span>${desc}</span>` : "");
  $("#lb").classList.add("on");
  document.body.style.overflow = "hidden";
}
function unzoom(){
  $("#lb").classList.remove("on");
  document.body.style.overflow = "";
  $("#lbImg").removeAttribute("src");
}
document.addEventListener("click", e => {
  const z = e.target.closest("[data-zoom]");
  if (z){ e.stopPropagation(); zoom(z.dataset.zoom, z.dataset.zn, z.dataset.zd); return; }
  if (e.target.closest("#lbX") || e.target.id === "lb"){ unzoom(); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#lb").classList.contains("on")){ unzoom(); return; }
  const z = e.target.closest && e.target.closest("[data-zoom]");
  if (z && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); zoom(z.dataset.zoom, z.dataset.zn, z.dataset.zd); }
});

/* ============================ BOOT ============================ */
buildTabs(); renderMenu(); renderPlates(); buildSlots(); paintCart(); clock();
setInterval(clock, 60000);
const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
$("#date").value = d.toISOString().slice(0,10);
$("#date").min = d.toISOString().slice(0,10);
document.querySelectorAll('a[href^="#w-"], a[href="#wine"]').forEach(a => a.addEventListener("click", ev => {
  if (a.getAttribute("href") === "#wine"){ ev.preventDefault(); TAB = "wine";
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab==="wine"));
    renderMenu(); $("#menu").scrollIntoView(); }
}));
