const $ = (sel) => document.querySelector(sel);
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pts = (n) => n.toFixed(2);
const fmtDate = (d, opts = { month: "short", day: "numeric" }) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", opts);
const ordinal = (n) => n + ([11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let DATA;
let sortKey = "points";

fetch("data/standings.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    DATA = data;
    renderHeader();
    renderPodium();
    renderBoard();
    renderEventPicker();
  })
  .catch(() => ($("#season").textContent = "Couldn't load standings."));

function renderHeader() {
  const ev = DATA.events;
  const last = ev[ev.length - 1];
  $("#season").textContent = `${DATA.season} · ${ev.length} weeks played · last game ${fmtDate(last.date, { month: "long", day: "numeric" })}`;
  const pool = ev.reduce((s, e) => s + e.prizePool + e.bounty * e.entrants, 0);
  const entries = ev.reduce((s, e) => s + e.entrants, 0);
  const biggest = ev.flatMap((e) => e.results.map((r) => ({ ...r, date: e.date })))
    .sort((a, b) => b.winnings + b.bounties - (a.winnings + a.bounties))[0];
  $("#stats").innerHTML = [
    [ev.length, "Weeks"],
    [DATA.standings.length, "Players"],
    [entries, "Entries"],
    [usd(Math.round(pool)), "Paid out"],
    [usd(biggest.winnings + biggest.bounties), `Best night · ${esc(biggest.handle)}`],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join("");
  $("#updated").textContent = "Updated " + new Date(DATA.updated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function renderPodium() {
  const [a, b, c] = DATA.standings;
  const spot = (p, cls, n) => p ? `
    <div class="spot ${cls}" data-handle="${esc(p.handle)}">
      ${n === 1 ? '<div class="crown">👑</div>' : ""}
      <div class="medal">${n}</div>
      <div class="name">${esc(p.handle)}</div>
      <div class="pts">${pts(p.points)}</div>
      <div class="sub">${p.wins} win${p.wins === 1 ? "" : "s"} · ${p.played} played</div>
    </div>` : "<div></div>";
  // Visual order: 2nd, 1st, 3rd
  $("#podium").innerHTML = spot(b, "p2", 2) + spot(a, "p1", 1) + spot(c, "p3", 3);
  $("#podium").querySelectorAll(".spot").forEach((el) => el.addEventListener("click", () => openPlayer(el.dataset.handle)));
}

function movement(p) {
  const h = p.rankHistory;
  const prev = h[h.length - 2];
  if (prev == null) return '<span class="move up">NEW</span>';
  const d = prev - h[h.length - 1];
  if (d > 0) return `<span class="move up">▲${d}</span>`;
  if (d < 0) return `<span class="move down">▼${-d}</span>`;
  return '<span class="move same">–</span>';
}

function formChips(p, n = 6) {
  return p.weeks.slice(-n).map((w) => {
    if (!w) return '<span class="chip dns" title="Did not play"></span>';
    const cls = w[0] === 1 ? "win" : w[2] ? "cash" : "";
    return `<span class="chip ${cls}" title="${ordinal(w[0])} · ${pts(w[1])} pts">${w[0]}</span>`;
  }).join("");
}

function renderBoard() {
  const rows = [...DATA.standings].sort((a, b) => b[sortKey] - a[sortKey] || b.points - a.points);
  const max = rows[0][sortKey] || 1;
  const val = (p) => sortKey === "winnings" || sortKey === "bounties" ? usd(p[sortKey]) : pts(p[sortKey]);
  $("#board").innerHTML = rows.map((p, i) => `
    <tr class="r${p.rank}" data-handle="${esc(p.handle)}">
      <td class="num rank">${sortKey === "points" ? p.rank : i + 1}</td>
      <td><span class="player">${esc(p.handle)}</span>${sortKey === "points" ? movement(p) : ""}
        <div class="bar" style="width:${Math.max(4, (p[sortKey] / max) * 100)}%"></div></td>
      <td class="num pts">${val(p)}</td>
      <td class="hide-sm"><div class="form">${formChips(p)}</div></td>
      <td class="num hide-sm">${p.played}</td>
      <td class="num">${p.wins || ""}</td>
      <td class="num hide-xs">${p.cashes || ""}</td>
      <td class="num hide-sm">${p.winnings ? usd(p.winnings) : ""}</td>
      <td class="num hide-sm">${p.bounties ? usd(p.bounties) : ""}</td>
    </tr>`).join("");
  $("#board").querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => openPlayer(tr.dataset.handle)));
}

document.querySelectorAll(".tabs button").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    sortKey = btn.dataset.sort;
    renderBoard();
  }));

function renderEventPicker() {
  const sel = $("#event-pick");
  sel.innerHTML = DATA.events.map((e, i) => `<option value="${i}">Week ${i + 1} · ${fmtDate(e.date)}</option>`).reverse().join("");
  sel.addEventListener("change", () => renderEvent(+sel.value));
  renderEvent(DATA.events.length - 1);
}

function renderEvent(i) {
  const e = DATA.events[i];
  $("#event").innerHTML = `
    <div class="event-meta">
      <span>Tourney <b>#${e.number}</b></span>
      <span>Entries <b>${e.entrants}</b></span>
      <span>Players <b>${e.players}</b></span>
      <span>Prize pool <b class="money">${usd(e.prizePool)}</b></span>
      <span>Bounty <b>${usd(e.bounty)}</b></span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th class="num">Place</th><th>Player</th><th class="num">Pts</th>
        <th class="num">Cash</th><th class="num">KOs $</th><th class="num hide-xs">Re-entries</th></tr></thead>
      <tbody>${e.results.map((r) => `
        <tr class="r${r.place}">
          <td class="num rank">${r.place}</td>
          <td class="player">${esc(r.handle)}</td>
          <td class="num pts">${pts(r.points)}</td>
          <td class="num money">${r.winnings ? usd(r.winnings) : ""}</td>
          <td class="num">${r.bounties ? usd(r.bounties) : ""}</td>
          <td class="num hide-xs">${r.reentries || ""}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

function rankChart(p) {
  const h = p.rankHistory;
  const n = DATA.standings.length;
  const W = 500, H = 130, pad = 22;
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, h.length - 1);
  const y = (r) => 12 + ((r - 1) * (H - 34)) / Math.max(1, n - 1);
  const pts = h.map((r, i) => (r == null ? null : [x(i), y(r)])).filter(Boolean);
  const path = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line class="axis" x1="${pad}" x2="${W - pad}" y1="${y(1)}" y2="${y(1)}"/>
    <text x="0" y="${y(1) + 3}">#1</text>
    <path class="lineplot" d="${path}"/>
    ${pts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3.5"/>`).join("")}
    ${DATA.events.map((e, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${fmtDate(e.date, { month: "numeric", day: "numeric" })}</text>`).join("")}
  </svg>`;
}

function openPlayer(handle) {
  const p = DATA.standings.find((s) => s.handle === handle);
  $("#player-body").innerHTML = `
    <p class="kicker" style="text-align:left">Rank #${p.rank} · ${DATA.season}</p>
    <h3 class="pd-name">${esc(p.handle)}</h3>
    <div class="pd-grid">
      <div class="stat"><b>${pts(p.points)}</b><small>Points</small></div>
      <div class="stat"><b>${pts(p.avgPoints)}</b><small>Avg</small></div>
      <div class="stat"><b>${p.best ? ordinal(p.best) : "–"}</b><small>Best</small></div>
      <div class="stat"><b>${Math.round(p.cashPct * 100)}%</b><small>Cash rate</small></div>
      <div class="stat"><b>${p.wins}</b><small>Wins</small></div>
      <div class="stat"><b>${usd(p.winnings)}</b><small>Cashed</small></div>
      <div class="stat"><b>${usd(p.bounties)}</b><small>Bounties</small></div>
      <div class="stat"><b>${p.reentries}</b><small>Re-entries</small></div>
    </div>
    <h2 style="font-size:20px">Rank over the season</h2>
    ${rankChart(p)}
    <h2 style="font-size:20px">Week by week</h2>
    <table><tbody>${DATA.events.map((e, i) => {
      const w = p.weeks[i];
      return `<tr><td>${fmtDate(e.date)}</td><td class="num">${w ? ordinal(w[0]) : '<span class="same">—</span>'}</td>
        <td class="num pts">${w ? pts(w[1]) : ""}</td></tr>`;
    }).reverse().join("")}</tbody></table>`;
  $("#player").showModal();
}
