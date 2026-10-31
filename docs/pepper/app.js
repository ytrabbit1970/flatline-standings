const $ = (sel) => document.querySelector(sel);
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pts = (n) => n.toFixed(2);
const fmtDate = (d, opts = { month: "short", day: "numeric" }) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", opts);
const ordinal = (n) => n + ([11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let DATA;
let sortKey = "points";

// Every season comes from a club spreadsheet: most have month labels, 2023 has real dates.
const eventLabel = (e, i, opts) => (e.date ? fmtDate(e.date, opts) : e.label || `Event ${i + 1}`);
const countsAll = () => !DATA.topN;

fetch("data/seasons.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((seasons) => {
    const sel = $("#season-pick");
    sel.innerHTML = seasons.map((s) => `<option value="${esc(s.file)}">${esc(s.name)}</option>`).join("");
    // #s2019 in the URL opens 2019, so a past season can be linked directly.
    const fromHash = seasons.find((s) => "#s" + s.name === location.hash);
    if (fromHash) sel.value = fromHash.file;
    sel.addEventListener("change", () => {
      const s = seasons.find((x) => x.file === sel.value);
      history.replaceState(null, "", s === seasons[0] ? location.pathname : "#s" + s.name);
      loadSeason(sel.value);
    });
    loadSeason(sel.value);
  });

function loadSeason(file) {
  fetch("data/" + file, { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      // "Total" only differs from "Points" when just the best N events count.
      if (countsAll() && sortKey === "total") sortKey = "points";
      document.querySelectorAll(".tabs button").forEach((b) => {
        b.hidden = b.dataset.sort === "total" && countsAll();
        b.setAttribute("aria-selected", b.dataset.sort === sortKey);
      });
      $("#pts-head").textContent = DATA.topN ? `Top ${DATA.topN}` : "Pts";
      // Some years only have a ToC on the blog, no POY spreadsheet.
      const sheet = DATA.standings.length > 0;
      ["#podium", "#board-panel", "#event-panel", "#rules-panel", "#stats"].forEach((s) => ($(s).hidden = !sheet));
      if (!sheet) {
        $("#season").textContent = "Tournament of Champions only · no POY spreadsheet";
        renderPoy();
        $("#updated").textContent = `${DATA.season} Tournament of Champions`;
        renderFinale();
        return;
      }
      renderHeader();
      renderPodium();
      renderBoard();
      renderEventPicker();
      renderFinale();
      renderRules();
    })
    .catch(() => ($("#season").textContent = "Couldn't load standings."));
}

function renderHeader() {
  const ev = DATA.events;
  $("#season").textContent = `${ev.length} events · final standings`;
  const entries = ev.reduce((s, e) => s + e.entrants, 0);
  const most = [...DATA.standings].sort((a, b) => b.wins - a.wins || b.points - a.points)[0];
  const stats = [
    [ev.length, "Events"],
    [DATA.standings.length, "Players"],
    [entries, "Entries"],
    [most.wins, `Most wins · ${esc(most.handle)}`],
  ];
  $("#stats").innerHTML = stats.map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join("");
  renderPoy();
  $("#updated").textContent = `${DATA.season} final standings`;
}

function renderPoy() {
  const leader = DATA.standings[0]?.handle;
  $("#poy").innerHTML = DATA.poy
    ? `🏆 Player of the Year: ${esc(DATA.poy)}` +
      (leader && DATA.poy.replace(/\W/g, "") !== leader.replace(/\W/g, "")
        ? `<small>As announced on the blog; ${esc(leader)} tops the points on the sheet</small>` : "")
    : "";
}

function renderPodium() {
  const [a, b, c] = DATA.standings;
  const spot = (p, cls, n) => p ? `
    <div class="spot ${cls}" data-handle="${esc(p.handle)}">
      ${n === 1 ? '<div class="crown">👑</div>' : ""}
      <div class="medal">${p.rank}</div>
      <div class="name">${esc(p.handle)}</div>
      <div class="pts">${pts(p.points)}</div>
      <div class="sub">${p.wins} win${p.wins === 1 ? "" : "s"} · ${p.played} played</div>
    </div>` : "<div></div>";
  // Visual order: 2nd, 1st, 3rd
  $("#podium").innerHTML = spot(b, "p2", 2) + spot(a, "p1", 1) + spot(c, "p3", 3);
  $("#podium").querySelectorAll(".spot").forEach((el) => el.addEventListener("click", () => openPlayer(el.dataset.handle)));
}

// A week is [place, points, won]; place is null on 2010's cash nights.
function formChips(p, n = 8) {
  return p.weeks.slice(-n).map((w) => {
    if (!w) return '<span class="chip dns" title="Did not play"></span>';
    if (w[0] == null) return `<span class="chip" title="Cash night · ${pts(w[1])} pts">$</span>`;
    return `<span class="chip ${w[2] ? "win" : ""}" title="${ordinal(w[0])} · ${pts(w[1])} pts">${w[0]}</span>`;
  }).join("");
}

const flag = (p) => p.sheetDiffers
  ? '<span class="flag" title="The sheet\'s total for this player doesn\'t add up from its event cells; the sheet\'s total is shown">*</span>' : "";

function renderBoard() {
  const rows = [...DATA.standings].sort((a, b) => b[sortKey] - a[sortKey] || b.points - a.points);
  const max = rows[0][sortKey] || 1;
  $("#board").innerHTML = rows.map((p, i) => `
    <tr class="r${p.rank}" data-handle="${esc(p.handle)}">
      <td class="num rank">${sortKey === "points" ? p.rank : i + 1}</td>
      <td><span class="player">${esc(p.handle)}</span>${flag(p)}
        <div class="bar" style="width:${Math.max(4, (p[sortKey] / max) * 100)}%"></div></td>
      <td class="num pts">${pts(p[sortKey])}</td>
      <td class="hide-sm"><div class="form">${formChips(p)}</div></td>
      <td class="num hide-sm">${p.played}</td>
      <td class="num">${p.wins || ""}</td>
      <td class="num hide-xs">${p.best ? ordinal(p.best) : ""}</td>
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
  sel.innerHTML = DATA.events.map((e, i) => `<option value="${i}">${i + 1} · ${esc(eventLabel(e, i))}</option>`).reverse().join("");
  sel.onchange = () => renderEvent(+sel.value);
  renderEvent(DATA.events.length - 1);
}

function renderEvent(i) {
  const e = DATA.events[i];
  const re = e.results.some((r) => r.reentries);
  // On monthly sheets the entrant count is just who scored; 2018+ recorded the field size.
  $("#event").innerHTML = `
    <div class="event-meta">
      ${e.date ? `<span>${fmtDate(e.date, { weekday: "short", month: "long", day: "numeric" })}</span>` : ""}
      <span>Entries <b>${e.entrants}</b></span>
      ${e.buyIn ? `<span>Buy-in <b class="money">${usd(e.buyIn)}</b></span>` : ""}
      ${e.rebuy ? `<span>Rebuy <b>${usd(e.rebuy)}</b></span>` : ""}
      ${e.game ? `<span class="tag">${esc(e.game)}</span>` : ""}
    </div>
    ${e.players < e.entrants && !re ? `<p class="note">The sheet lists ${e.players} of the ${e.entrants} finishers.</p>` : ""}
    <div class="table-wrap"><table>
      <thead><tr><th class="num">Place</th><th>Player</th><th class="num">Pts</th>
        ${re ? '<th class="num hide-xs">Re-entries</th>' : ""}</tr></thead>
      <tbody>${e.results.map((r) => `
        <tr class="r${r.place}">
          <td class="num rank">${r.place ?? "–"}</td>
          <td class="player">${esc(r.handle)}</td>
          <td class="num pts">${pts(r.points)}</td>
          ${re ? `<td class="num hide-xs">${r.reentries || ""}</td>` : ""}
        </tr>`).join("")}</tbody>
    </table></div>`;
}

// Tournament of Champions, from the blog. Cash amounts were only posted some years, and some
// players are listed without a place (couldn't attend, or nobody recorded their finish).
function renderFinale() {
  const fin = DATA.finale || [];
  $("#finale-panel").hidden = !fin.length;
  $("#finale").innerHTML = fin.map((e) => {
    const cash = e.results.some((r) => r.winnings);
    const notes = e.results.some((r) => r.note);
    return `<div>
      <h3>${esc(e.name)}</h3>
      <p class="champ">👑 ${esc(e.results[0].handle)}</p>
      <div class="event-meta">
        <span>Players <b>${e.entrants}</b></span>
        ${e.prizePool ? `<span>Paid out <b class="money">${usd(e.prizePool)}</b></span>` : ""}
      </div>
      ${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}
      <div class="table-wrap"><table>
        <thead><tr><th class="num">Place</th><th>Player</th>${cash ? '<th class="num">Cash</th>' : ""}${notes ? "<th></th>" : ""}</tr></thead>
        <tbody>${e.results.map((r) => `
          <tr class="r${r.place}">
            <td class="num rank">${r.place ?? "–"}</td>
            <td class="player">${esc(r.handle)}</td>
            ${cash ? `<td class="num money">${r.winnings ? usd(r.winnings) : ""}</td>` : ""}
            ${notes ? `<td class="note">${esc(r.note || "")}</td>` : ""}
          </tr>`).join("")}</tbody>
      </table></div>
    </div>`;
  }).join("");
}

function renderRules() {
  $("#rules").innerHTML = DATA.topN
    ? `Points come from the club's POY spreadsheet and scale with your finish and the field size.
       Only your best <b>${DATA.topN}</b> events count toward the standings; <b>Total</b> adds up every event.`
    : `Points come from the club's POY spreadsheet. Back then scoring was linear in finishing position,
       so each month's places here are ranked from the points. Every event counts.`;
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
    ${DATA.events.map((e, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${e.date ? fmtDate(e.date, { month: "numeric", day: "numeric" }) : i + 1}</text>`).join("")}
  </svg>`;
}

function openPlayer(handle) {
  const p = DATA.standings.find((s) => s.handle === handle);
  $("#player-body").innerHTML = `
    <p class="kicker" style="text-align:left">Rank #${p.rank} · ${esc(DATA.season)}</p>
    <h3 class="pd-name">${esc(p.handle)}</h3>
    <div class="pd-grid">
      <div class="stat"><b>${pts(p.points)}</b><small>${DATA.topN ? `Top ${DATA.topN}` : "Points"}</small></div>
      ${DATA.topN ? `<div class="stat"><b>${pts(p.total)}</b><small>Total</small></div>` : ""}
      <div class="stat"><b>${pts(p.avgPoints)}</b><small>Avg</small></div>
      <div class="stat"><b>${p.best ? ordinal(p.best) : "–"}</b><small>Best</small></div>
      <div class="stat"><b>${p.wins}</b><small>Wins</small></div>
      <div class="stat"><b>${p.played}</b><small>Played</small></div>
      ${p.reentries ? `<div class="stat"><b>${p.reentries}</b><small>Re-entries</small></div>` : ""}
      ${p.bonus ? `<div class="stat"><b>+${p.bonus}</b><small>Attendance bonus</small></div>` : ""}
    </div>
    ${p.sheetDiffers ? '<p class="note">* The sheet\'s total for this player doesn\'t add up from its event cells; the standings use the sheet\'s total.</p>' : ""}
    <h2 style="font-size:20px">Rank over the season</h2>
    ${rankChart(p)}
    <h2 style="font-size:20px">Event by event</h2>
    <table><tbody>${DATA.events.map((e, i) => {
      const w = p.weeks[i];
      return `<tr><td>${esc(eventLabel(e, i))}</td><td class="num">${w ? (w[0] ? ordinal(w[0]) : "cash") : '<span class="same">—</span>'}</td>
        <td class="num pts">${w ? pts(w[1]) : ""}</td></tr>`;
    }).reverse().join("")}</tbody></table>`;
  $("#player").showModal();
}
