// Pepper St Poker: a modern front end for the club's two Blogger blogs.
// Posts are read live from Blogger's JSON feeds (JSONP, since the feeds don't send CORS headers),
// so anything published on Blogger shows up here without a rebuild.
//
// The same script runs in two places: here on standings.flatline.wtf (hash routes, #/p/...), and
// inside the Blogger theme on both blogs (real URLs, one page load per page). On Blogger, the page
// Blogger served is in <noscript id="server">: the post itself, plus the menus and intro the owner
// edits as gadgets under Layout.

const BLOGS = {
  main: { id: "9057610958077509444", host: "www.pepperstreetpoker.org", origin: "http://www.pepperstreetpoker.org", route: "p" },
  rules: { id: "8563722220474512012", host: "pepperstreetrules.blogspot.com", origin: "https://pepperstreetrules.blogspot.com", route: "info" },
};
const sameHost = (a, b) => a.replace(/^www\./, "") === b.replace(/^www\./, "");
// Which blog this page is on, or undefined on standings.flatline.wtf.
const HERE = Object.keys(BLOGS).find((b) => sameHost(location.hostname, BLOGS[b].host));
const STANDINGS = "https://standings.flatline.wtf/pepper/";

const link = {
  home: (blog = "main") => (HERE ? (blog === HERE ? "/" : `${BLOGS[blog].origin}/`) : "#/"),
  post: (blog, path) => (HERE ? `${blog === HERE ? "" : BLOGS[blog].origin}/${path}.html` : `#/${BLOGS[blog].route}/${path}`),
  recaps: (year) => (HERE ? `${HERE === "main" ? "" : BLOGS.main.origin}/${year ? `${year}/` : "search"}` : `#/recaps${year ? `/${year}` : ""}`),
  search: (q) => (HERE ? `${HERE === "main" ? "" : BLOGS.main.origin}/search?q=${encodeURIComponent(q)}` : `#/search/${encodeURIComponent(q)}`),
};
// Images and data that live with this site; the Blogger theme loads them from here.
const asset = (file) => (/^https?:/.test(file) || !HERE ? file : `https://standings.flatline.wtf/pepperst/${file}`);

const $ = (sel, el = document) => el.querySelector(sel);

const SERVER = (() => {
  const n = document.getElementById("server");
  return n && new DOMParser().parseFromString(n.textContent, "text/html");
})();

// The original sidebar's two link lists. On Blogger they're LinkList gadgets, so the owner can rename,
// reorder or add menus under Layout; these are the fallback when a page has none.
const RULES = BLOGS.rules.origin;
const DEFAULT_MENUS = [
  { title: "The Game", links: [
    ["Blind Structures & Buy-Ins", `${RULES}/2012/09/psp-nlhe-tournament-blind-structures.html`],
    ["Rules in General", `${RULES}/2008/08/rules-in-general.html`],
    ["Cash Game Info", `${RULES}/2009/04/cash-game.html`],
    ["Dealing & Misdeals", `${RULES}/2008/09/heres-deal.html`],
    ["New Players", `${RULES}/2008/12/can-i-bring-buddy.html`],
    ["The House Fund", `${RULES}/2008/09/house-fund.html`],
    ["Be on Time", `${RULES}/2009/04/congratulations.html`],
    ["In Memoriam", `${RULES}/2015/09/in-memoriam.html`],
  ] },
  { title: "Champions", links: [
    ["The Tournament of Champions", `${RULES}/2013/10/the-tournament-of-champions.html`],
    ["2024-2025 Champions", `${RULES}/2024/10/2024-2025-champions.html`],
    ["Player of the Year", `${RULES}/2018/01/player-of-year_19.html`],
    ["Legacy Hall of Fame", `${RULES}/2018/10/pepper-street-poker-legacy-hall-of-fame.html`],
    ["Legacy Invitational Tournament", `${RULES}/2021/12/legacy-invitational-tournament.html`],
    ["Past Years Standings", STANDINGS],
  ] },
];
const MENU_NOTES = { "The Game": "How we play", Champions: "Player and Champion of the Year" };
const MENUS = (() => {
  const menus = SERVER ? [...SERVER.querySelectorAll(".cms-menu")].map((ul) => ({
    title: ul.dataset.title || "",
    links: [...ul.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
  })).filter((m) => m.title && m.links.length) : [];
  return menus.length ? menus : DEFAULT_MENUS;
})();

// The home page's headline and intro: a Text gadget on Blogger. The headline's last sentence is set in italics.
const INTRO = (() => {
  const el = SERVER?.querySelector(".cms-intro");
  const title = el?.querySelector(".cms-title")?.textContent.trim();
  const body = el?.querySelector(".cms-body")?.innerHTML.trim();
  return {
    title: title || "No rake. No fees. No drama.",
    body: body || `Just a simple home game: a monthly Saturday tournament and Friday night cash games
      in the garage around back. Keep your eyes peeled for updates and ramblings.`,
  };
})();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Feed titles and summaries arrive with HTML entities still encoded ("&nbsp;", "&amp;").
const decoder = document.createElement("textarea");
const decode = (s) => ((decoder.innerHTML = s), decoder.value);
const fmtDate = (iso, opts = { month: "long", day: "numeric", year: "numeric" }) =>
  new Date(iso).toLocaleDateString("en-US", opts);

// ---------- Blogger feeds ----------

let jsonpSeq = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__blogger${++jsonpSeq}`;
    const s = document.createElement("script");
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = (data) => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("feed failed")); };
    s.src = `${url}${url.includes("?") ? "&" : "?"}alt=json-in-script&callback=${cb}`;
    document.head.append(s);
  });
}

const feedUrl = (blog, kind, params = "") =>
  `https://www.blogger.com/feeds/${BLOGS[blog].id}/posts/${kind}${params}`;

// "https://host/2026/01/psp-2025-toc.html" -> "2026/01/psp-2025-toc"
const pathOf = (url) => (url.match(/\/(\d{4}\/\d{2}\/[^/?#]+?)\.html/) || [])[1];

function entry(e) {
  const link = (e.link.find((l) => l.rel === "alternate") || {}).href || "";
  return {
    id: e.id.$t.split(".post-")[1],
    title: decode(e.title.$t || "") || "Untitled",
    published: e.published.$t,
    author: e.author?.[0]?.name?.$t,
    link,
    path: pathOf(link),
    summary: decode(e.summary?.$t || "").replace(/\s+/g, " ").trim(),
    thumb: e.media$thumbnail?.url,
    content: e.content?.$t,
  };
}

// Every post's summary, loaded once per blog and kept for the session.
const indexes = {};
function loadIndex(blog) {
  if (indexes[blog]) return indexes[blog];
  indexes[blog] = (async () => {
    const all = [];
    // Blogger often returns fewer than max-results per page, so page by what's left of the total.
    for (;;) {
      const d = await jsonp(feedUrl(blog, "summary", `?max-results=150&start-index=${all.length + 1}`));
      const page = (d.feed.entry || []).map(entry);
      all.push(...page);
      if (!page.length || all.length >= +d.feed.openSearch$totalResults.$t) break;
    }
    return all;
  })();
  indexes[blog].catch(() => delete indexes[blog]);
  return indexes[blog];
}

const latest = (n) => jsonp(feedUrl("main", "summary", `?max-results=${n}`)).then((d) => (d.feed.entry || []).map(entry));
const fullPost = (blog, id) => jsonp(feedUrl(blog, "default", `/${id}`)).then((d) => entry(d.entry));
const search = (q) => jsonp(feedUrl("main", "summary", `?max-results=60&q=${encodeURIComponent(q)}`))
  .then((d) => (d.feed.entry || []).map(entry));

// Blogger image URLs carry their size as a path segment (/s72-c/) or a suffix (=s72-c).
function sized(url, size) {
  if (!url) return url;
  url = url.replace(/^http:/, "https:");
  if (/\/(s|w|h)\d+[^/]*\/[^/]+$/.test(url)) return url.replace(/\/(s|w|h)\d+[^/]*\/([^/]+)$/, `/${size}/$2`);
  if (/=[swh]\d+[^/]*$/.test(url)) return url.replace(/=[swh]\d+[^/]*$/, `=${size}`);
  return url;
}

// ---------- cleaning Blogger HTML ----------

const KEEP = new Set(["P", "BR", "A", "IMG", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U", "H2", "H3", "H4",
  "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "FIGURE", "FIGCAPTION", "IFRAME", "HR"]);
const ATTRS = { A: ["href"], IMG: ["src", "alt"], TD: ["colspan", "rowspan"], TH: ["colspan", "rowspan"], IFRAME: ["src"] };
const BLOCK = new Set(["P", "DIV", "TABLE", "UL", "OL", "FIGURE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "IFRAME", "HR"]);

// Links into either blog become links into this site (or, on Blogger, plain links within the blogs).
function localHref(href) {
  try {
    const u = new URL(href, `${BLOGS[HERE || "main"].origin}/`);
    const blog = Object.keys(BLOGS).find((b) => sameHost(u.hostname, BLOGS[b].host));
    const path = pathOf(u.pathname);
    if (blog && path) return link.post(blog, path);
    if (blog === "rules" && /2010-player-of-year-standings/.test(u.pathname)) return STANDINGS;
  } catch {}
  return null;
}
const menuHref = (url) => (HERE ? url : localHref(url) || url);

function unwrap(el) {
  el.replaceWith(...el.childNodes);
}

function clean(html) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");

  // Photo-with-caption tables -> <figure>.
  root.querySelectorAll("table.tr-caption-container").forEach((t) => {
    const img = t.querySelector("img");
    const cap = t.querySelector(".tr-caption");
    if (!img) return unwrap(t);
    const fig = doc.createElement("figure");
    fig.append(img);
    if (cap && cap.textContent.trim()) {
      const fc = doc.createElement("figcaption");
      fc.textContent = cap.textContent.trim();
      fig.append(fc);
    }
    t.replaceWith(fig);
  });
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

  // Deepest elements first, so unwrapping never skips a child.
  [...root.querySelectorAll("*")].reverse().forEach((el) => {
    const tag = el.tagName;
    if (tag === "H1") { const h = doc.createElement("h2"); h.append(...el.childNodes); el.replaceWith(h); return; }
    if (tag === "DIV" || tag === "CENTER") {
      // Blogger writes one <div> per line; a div of plain text reads best as a paragraph.
      if ([...el.children].some((c) => BLOCK.has(c.tagName))) return unwrap(el);
      const p = doc.createElement("p"); p.append(...el.childNodes); el.replaceWith(p); return;
    }
    if (!KEEP.has(tag)) return unwrap(el);
    if (tag === "IFRAME" && !/youtube\.com|youtube-nocookie\.com|vimeo\.com/.test(el.getAttribute("src") || "")) return el.remove();
    const keep = ATTRS[tag] || [];
    [...el.attributes].forEach((a) => keep.includes(a.name) || el.removeAttribute(a.name));
    if (tag === "IMG") {
      el.src = sized(el.getAttribute("src"), "w1600");
      el.loading = "lazy";
      el.decoding = "async";
      // A photo wrapped in a link to itself: drop the link, the lightbox handles it.
      const a = el.parentElement;
      if (a?.tagName === "A" && a.children.length === 1 && /googleusercontent|bp\.blogspot|\.(jpe?g|png|gif)/i.test(a.getAttribute("href") || "")) unwrap(a);
    }
    if (tag === "A") {
      const href = el.getAttribute("href") || "";
      const local = localHref(href);
      if (local) el.setAttribute("href", local);
      else { el.setAttribute("href", href.replace(/^http:\/\/(\w+\.)?(blogspot|googleusercontent)/, "https://$1$2")); el.target = "_blank"; el.rel = "noopener"; }
    }
    if (tag === "IFRAME") { el.setAttribute("src", el.getAttribute("src").replace(/^(http:)?\/\//, "https://")); el.setAttribute("allowfullscreen", ""); el.className = "video"; }
    if (tag === "TABLE") { const w = doc.createElement("div"); w.className = "table-wrap"; el.replaceWith(w); w.append(el); }
  });

  // Paragraphs that are only whitespace or line breaks, and runs of 3+ <br>, are Blogger spacing.
  root.querySelectorAll("p").forEach((p) => {
    if (!p.textContent.replace(/ /g, " ").trim() && !p.querySelector("img, iframe")) p.remove();
  });
  root.innerHTML = root.innerHTML.replace(/(<br>\s*){3,}/g, "<br><br>");
  root.querySelectorAll("p").forEach((p) => {
    while (p.firstChild?.nodeName === "BR") p.firstChild.remove();
    while (p.lastChild?.nodeName === "BR") p.lastChild.remove();
  });
  // The rules pages title each rule with an ALL-CAPS line ("CARDS SPEAK"); style those as subheads.
  [...root.querySelectorAll("p")].flatMap((p) => [...p.childNodes]).forEach((n) => {
    const t = n.nodeType === 3 ? n.textContent.trim() : "";
    const lineStart = !n.previousSibling || n.previousSibling.nodeName === "BR";
    if (lineStart && t.length >= 4 && t.length <= 48 && /[A-Z]{3}/.test(t) && t === t.toUpperCase() && !/^[\d\s$.,:/-]+$/.test(t)) {
      const s = doc.createElement("strong");
      s.className = "cap";
      s.textContent = t;
      n.replaceWith(s);
      if (s.nextSibling?.nodeName === "BR") s.nextSibling.remove();
    }
  });
  return root.innerHTML;
}

// ---------- shared bits ----------

function readTime(text) {
  const words = (text || "").split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

const SUITS = ["♠", "♥", "♦", "♣"];
function cover(post, size, cls = "") {
  if (post.thumb) {
    return `<div class="cover ${cls}"><img src="${esc(sized(post.thumb, size))}" alt="" loading="lazy" decoding="async"></div>`;
  }
  const suit = SUITS[parseInt(post.id.slice(-2), 10) % 4];
  return `<div class="cover cover-blank ${cls}"><span class="${"♥♦".includes(suit) ? "red" : ""}">${suit}</span></div>`;
}

function card(post) {
  return `<a class="card" href="${esc(link.post("main", post.path))}">
    ${cover(post, "w800-h450-c")}
    <div class="card-body">
      <time datetime="${esc(post.published)}">${fmtDate(post.published, { month: "short", day: "numeric", year: "numeric" })}</time>
      <h3>${esc(post.title)}</h3>
      <p>${esc(post.summary.slice(0, 140))}${post.summary.length > 140 ? "…" : ""}</p>
    </div>
  </a>`;
}

const linkRow = ([label, url], i) =>
  `<li><a href="${esc(menuHref(url))}"><span class="idx">${String(i + 1).padStart(2, "0")}</span>${esc(label)}<span class="arrow">→</span></a></li>`;

const menuPanels = () => MENUS.map((m) => `
  <div class="panel">
    ${MENU_NOTES[m.title] ? `<p class="eyebrow">${esc(MENU_NOTES[m.title])}</p>` : ""}
    <h2>${esc(m.title)}</h2>
    <ul class="links">${m.links.map(linkRow).join("")}</ul>
  </div>`).join("");

const skeleton = (n) => `<div class="grid">${'<div class="card sk"><div class="cover"></div><div class="card-body"><i></i><i></i><i></i></div></div>'.repeat(n)}</div>`;

function failed(msg = "Couldn't reach Blogger. Try again in a moment.") {
  return `<div class="empty"><p>${esc(msg)}</p><a class="btn ghost" href="${link.home()}">Back home</a></div>`;
}

// ---------- navigation ----------

function renderNav() {
  const menu = (label, items) => `
    <div class="dd">
      <button class="dd-btn" aria-expanded="false">${esc(label)}<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <div class="dd-menu">${items.map(([l, url]) => `<a href="${esc(menuHref(url))}">${esc(l)}</a>`).join("")}</div>
    </div>`;
  $("#nav").innerHTML = `
    <a href="${link.recaps()}">Recaps</a>
    ${MENUS.map((m) => menu(m.title, m.links)).join("")}
    <a class="nav-cta" href="${STANDINGS}">Standings</a>
    <form class="nav-search" role="search"><input type="search" name="q" placeholder="Search" aria-label="Search posts"></form>`;
  $("#nav").querySelectorAll(".dd-btn").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = b.getAttribute("aria-expanded") !== "true";
    $("#nav").querySelectorAll(".dd-btn").forEach((x) => x.setAttribute("aria-expanded", "false"));
    b.setAttribute("aria-expanded", open);
  }));
  $(".nav-search").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = ev.target.q.value.trim();
    if (q) location.href = link.search(q);
  });
  document.addEventListener("click", () => $("#nav").querySelectorAll(".dd-btn").forEach((x) => x.setAttribute("aria-expanded", "false")));
  $(".menu-btn").addEventListener("click", () => {
    const open = !document.body.classList.contains("nav-open");
    document.body.classList.toggle("nav-open", open);
    $(".menu-btn").setAttribute("aria-expanded", open);
  });
}

// ---------- views ----------

async function home(view) {
  // "No rake. No fees. No drama." -> the last sentence in italics.
  const headline = esc(INTRO.title).replace(/([^.!?]+[.!?]?)\s*$/, "<em>$1</em>");
  view.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="dot"></span>Magnolia Park · The Garage Around Back</p>
        <h1>${headline}</h1>
        <div class="lede">${INTRO.body}</div>
        <div class="actions">
          <a class="btn" id="latest-btn" href="${link.recaps()}">Latest recap</a>
          <a class="btn ghost" href="${STANDINGS}">Standings</a>
        </div>
      </div>
      <div class="hero-art"><img src="${asset("logo.png")}" alt="Pepper St Poker, Magnolia Park" width="703" height="523"></div>
    </section>

    <section class="wrap">
      <div class="sec-head"><h2>Latest from the garage</h2><a class="more" href="${link.recaps()}">All recaps →</a></div>
      <div id="latest">${skeleton(4)}</div>
    </section>

    <section class="wrap two">${menuPanels()}</section>

    <section class="wrap">
      <div class="sec-head"><h2>Archive</h2></div>
      <div class="years" id="years"><span class="muted">Loading…</span></div>
    </section>`;

  try {
    const posts = await latest(9);
    const [first, ...rest] = posts;
    $("#latest-btn").href = link.post("main", first.path);
    $("#latest").innerHTML = `
      <a class="feature" href="${esc(link.post("main", first.path))}">
        ${cover(first, "w1600-h900-c")}
        <div class="feature-body">
          <span class="tag">Latest</span>
          <h3>${esc(first.title)}</h3>
          <p>${esc(first.summary.slice(0, 260))}${first.summary.length > 260 ? "…" : ""}</p>
          <time>${fmtDate(first.published)} · Read the post →</time>
        </div>
      </a>
      <div class="grid">${rest.map(card).join("")}</div>`;
  } catch {
    $("#latest").innerHTML = failed();
  }
  loadIndex("main").then((all) => {
    if (!$("#years")) return;
    $("#years").innerHTML = yearPills(all);
  }).catch(() => ($("#years").innerHTML = ""));
}

function yearPills(all, active) {
  const counts = {};
  all.forEach((p) => (counts[p.published.slice(0, 4)] = (counts[p.published.slice(0, 4)] || 0) + 1));
  return Object.keys(counts).sort().reverse().map((y) =>
    `<a class="pill${y === active ? " on" : ""}" href="${link.recaps(y)}">${y}<small>${counts[y]}</small></a>`).join("");
}

// The rules blog's front page: the menus, then every post on that blog.
async function rulesHome(view) {
  view.innerHTML = `
    <section class="wrap page-head">
      <p class="eyebrow">Pepper Street Rules</p>
      <h1>House rules &amp; records</h1>
    </section>
    <section class="wrap two">${menuPanels()}</section>
    <section class="wrap">
      <div class="sec-head"><h2>Everything on this blog</h2></div>
      <div id="list"><span class="muted">Loading…</span></div>
    </section>`;
  try {
    const all = await loadIndex("rules");
    $("#list").innerHTML = `<div class="panel"><ul class="links">${all.map((p, i) => linkRow([p.title, p.link], i)).join("")}</ul></div>`;
  } catch {
    $("#list").innerHTML = failed();
  }
}

async function recaps(view, year) {
  view.innerHTML = `
    <section class="wrap page-head">
      <p class="eyebrow">The archive</p>
      <h1>${year ? `Recaps from ${esc(year)}` : "All recaps"}</h1>
      <div class="years" id="years"></div>
    </section>
    <section class="wrap"><div id="list">${skeleton(6)}</div></section>`;
  try {
    const all = await loadIndex("main");
    const y = year || all[0]?.published.slice(0, 4);
    $("#years").innerHTML = yearPills(all, y);
    const posts = all.filter((p) => p.published.startsWith(y));
    $("#list").innerHTML = posts.length ? `<div class="grid">${posts.map(card).join("")}</div>` : failed("No posts that year.");
  } catch {
    $("#list").innerHTML = failed();
  }
}

async function searchView(view, q) {
  view.innerHTML = `
    <section class="wrap page-head">
      <p class="eyebrow">Search</p>
      <h1>“${esc(q)}”</h1>
    </section>
    <section class="wrap"><div id="list">${skeleton(3)}</div></section>`;
  $(".nav-search input").value = q;
  try {
    const posts = await search(q);
    $("#list").innerHTML = posts.length
      ? `<p class="muted count">${posts.length}${posts.length === 60 ? "+" : ""} posts</p><div class="grid">${posts.map(card).join("")}</div>`
      : failed(`Nothing found for “${q}”.`);
  } catch {
    $("#list").innerHTML = failed();
  }
}

// The post, with links to its neighbours on the main blog: from the page Blogger served when there is
// one, otherwise from the feeds.
async function loadPost(blog, path) {
  const sp = SERVER?.querySelector(".server-post");
  if (sp) {
    const pager = (cls) => {
      const a = SERVER.querySelector(`.${cls}`);
      return a && { title: a.textContent.trim() || (cls === "sp-newer" ? "Newer post" : "Older post"), href: a.getAttribute("href") };
    };
    return {
      title: sp.querySelector(".sp-title").textContent.trim() || "Untitled",
      published: sp.querySelector(".sp-date")?.getAttribute("datetime"),
      author: sp.querySelector(".sp-author")?.textContent.trim(),
      content: sp.querySelector(".sp-body").innerHTML,
      isPage: sp.classList.contains("is-page"),
      newer: pager("sp-newer"),
      older: pager("sp-older"),
    };
  }
  const all = await loadIndex(blog);
  const i = all.findIndex((p) => p.path === path);
  if (i < 0) return null;
  const p = await fullPost(blog, all[i].id);
  // The main blog is newest-first: i - 1 is newer, i + 1 is older.
  const near = (q) => blog === "main" && q && { title: q.title, href: link.post("main", q.path) };
  return { ...p, newer: near(all[i - 1]), older: near(all[i + 1]) };
}

async function post(view, blog, path) {
  view.innerHTML = `<article class="article"><div class="article-head"><div class="sk-line w40"></div><div class="sk-line w90 tall"></div><div class="sk-line w70 tall"></div></div></article>`;
  try {
    const p = await loadPost(blog, path);
    if (!p) { view.innerHTML = failed("That post couldn't be found."); return; }
    const hof = blog === "rules" && path === HOF_PATH;
    const body = hof ? hallOfFameIntro(p.content || "") : clean(p.content || "");
    const text = new DOMParser().parseFromString(body, "text/html").body.textContent;
    const dated = blog === "main" && !p.isPage && p.published;
    const { newer, older } = p;
    document.title = `${p.title} · Pepper St Poker`;
    view.innerHTML = `
      <article class="article">
        <header class="article-head">
          <a class="back" href="${dated ? link.recaps(p.published.slice(0, 4)) : link.home(blog)}">← ${dated ? `${p.published.slice(0, 4)} recaps` : "Home"}</a>
          ${hof ? `<h1 class="plaque-title"><img src="${asset("hof-plaque.png")}" alt="${esc(p.title)}" width="1200" height="600"></h1>` : `<h1>${esc(p.title)}</h1>`}
          <p class="meta">
            ${dated ? `<time datetime="${esc(p.published)}">${fmtDate(p.published)}</time><span>·</span>` : ""}
            ${p.author && p.author !== "Unknown" ? `<span>${esc(p.author)}</span><span>·</span>` : ""}
            <span>${readTime(text)} min read</span>
          </p>
        </header>
        <div class="prose">${body}</div>
        <footer class="article-foot">
          ${HERE ? "" : `<a class="muted small" href="${esc(p.link.replace(/^http:\/\/(\w+\.)?blogspot/, "https://$1blogspot"))}" target="_blank" rel="noopener">View the original on Blogger ↗</a>`}
          ${newer || older ? `<nav class="pager">
            ${older ? `<a href="${esc(older.href)}"><small>← Older</small>${esc(older.title)}</a>` : "<span></span>"}
            ${newer ? `<a class="next" href="${esc(newer.href)}"><small>Newer →</small>${esc(newer.title)}</a>` : "<span></span>"}
          </nav>` : ""}
        </footer>
      </article>`;
    view.querySelectorAll(".prose img").forEach((img) => img.addEventListener("click", () => openPhoto(img.src)));
    if (hof) renderHallOfFame(p.content || "");
  } catch {
    view.innerHTML = failed();
  }
}

// ---------- Legacy Hall of Fame ----------
// The post is a long column of chip photos. Here it becomes a grid of each player's "Legacy Player"
// chip, oldest year first; clicking one shows both sides. hof.json holds the name and year printed on
// each chip (read off the images) and which image is which side.

const HOF_PATH = "2018/10/pepper-street-poker-legacy-hall-of-fame";
const HOF_HEADING = "LEGACY HALL OF FAME";
const imgKey = (url) => decodeURIComponent(url).replace(/=[swh]\d+[^/]*$/, "").split("/").filter((s) => !/^[swh]\d+/.test(s)).slice(-1)[0];

function splitHallOfFame(html) {
  const at = html.indexOf(HOF_HEADING);
  return at < 0 ? [html, ""] : [html.slice(0, html.lastIndexOf("<", at)), html.slice(at)];
}

// Rearranges the intro: the benefits list and the Invitational details move below the grid (the
// details as a bulleted list), and the two Legacy Bounty chip photos sit small, side by side.
// Blocks are found by their text, so if Chris rewrites the post this falls back to the plain intro.
function hallOfFameIntro(html) {
  const box = document.createElement("div");
  box.innerHTML = clean(splitHallOfFame(html)[0]);
  // The photo of the chip wall: the grid replaces it, and its plaque is the page title (hof-plaque.png).
  box.querySelectorAll('img[src*="IMG_4314"]').forEach((img) => {
    const p = img.closest("p, figure");
    p && p.parentNode === box && !p.textContent.trim() ? p.remove() : img.remove();
  });
  // Line breaks straight after a block (paragraph, list, photo) are just Blogger spacing.
  [...box.childNodes].forEach((n) => {
    if (n.nodeName !== "BR") return;
    let prev = n.previousSibling;
    while (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev = prev.previousSibling;
    if (!prev || BLOCKS.test(prev.nodeName)) n.remove();
  });
  // Much of this post is bare text between <br>s, so work with every node, not just elements.
  const nodes = [...box.childNodes];
  const find = (re, from = 0) => nodes.findIndex((n, i) => i >= from && re.test(n.textContent));
  const start = find(/also get other benefits/i);
  const end = find(/Special Legacy Trophy/i, start);
  const ado = find(/without any further ado/i, end);
  const grid = `<h2>The Legacy Hall of Fame</h2><div id="hof" class="hof"></div>`;
  if (start < 0 || end < 0) return box.innerHTML + grid;

  const benefits = nodes.slice(start, end + 1);
  const head = benefits.findIndex((n) => /^\s*Legacy Invitational Tournament\s*-/i.test(n.textContent));
  // "Legacy players also get other benefits..." heads the benefits list, like the Invitational line heads its own.
  let after = `<h3>${esc(benefits[0].textContent.trim())}</h3>` + paragraphs(benefits.slice(1, head < 0 ? undefined : head));
  if (head >= 0) {
    // One line per <br>, whichever paragraph it landed in; the first line is the header.
    const lines = benefits.slice(head).flatMap((n) => (n.nodeType === 1 ? n.innerHTML : nodeHtml(n)).split(/<br\s*\/?>/i))
      .filter((l) => l.replace(/&nbsp;|\u00a0|<[^>]+>/g, " ").trim());
    after += `<h3>${lines[0].replace(/<[^>]+>/g, "").trim()}</h3>` +
      `<ul>${lines.slice(1).map((l) => `<li>${l.trim()}</li>`).join("")}</ul>`;
  }
  const between = nodes.slice(end + 1, ado < 0 ? nodes.length : ado);
  const chips = between.flatMap((n) => (n.nodeName === "IMG" ? [n] : n.querySelectorAll ? [...n.querySelectorAll("img")] : []));
  // Local copies of the two bounty chips, recoloured to the site red.
  const bountyImg = (img) => {
    const who = (img.getAttribute("src").match(/LB\+(\w+)\+for/) || [])[1];
    return who ? `<img src="${asset(`hof-bounty-${who.toLowerCase()}.jpg`)}" alt="Legacy Bounty chip: ${esc(who)}">` : img.outerHTML;
  };
  const bounties = chips.length ? `<div class="bounties">${chips.map(bountyImg).join("")}</div>` : "";
  return `<div class="hof-intro">${paragraphs(nodes.slice(0, start))}</div>` + bounties +
    (ado >= 0 ? `<div class="hof-intro">${paragraphs(nodes.slice(ado))}</div>` : "") +
    grid + `<div class="hof-after">${mergeLists(after)}</div>`;
}

const BLOCKS = /^(P|UL|OL|FIGURE|IMG|DIV|TABLE|H\d)$/;
const nodeHtml = (n) => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 ? esc(n.textContent) : "");

// Loose text and <br>s -> <p>s: a run of two or more <br>s ends a paragraph; block elements pass through.
function paragraphs(list) {
  let out = "", buf = [];
  const blank = (n) => n && n.nodeType === 3 && !n.textContent.trim();
  const flush = () => {
    const h = buf.map(nodeHtml).join("").replace(/^(\s|<br>)+|(\s|<br>)+$/g, "");
    if (h.replace(/&nbsp;|\u00a0|\s|<br>/g, "")) out += `<p>${h}</p>`;
    buf = [];
  };
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.nodeName === "BR") {
      let j = i + 1;
      while (blank(list[j])) j++;
      if (list[j]?.nodeName !== "BR") { buf.push(n); continue; }
      flush();
      while (list[i + 1] && (list[i + 1].nodeName === "BR" || blank(list[i + 1]))) i++;
    } else if (n.nodeType === 1 && BLOCKS.test(n.nodeName)) {
      flush();
      out += n.outerHTML;
    } else buf.push(n);
  }
  flush();
  return out;
}

// Blogger wrote the benefits as one <ul> per bullet; join neighbouring lists into one.
function mergeLists(html) {
  const box = document.createElement("div");
  box.innerHTML = html;
  box.querySelectorAll("ul").forEach((ul) => {
    let next = ul.nextSibling;
    while (next && ((next.nodeType === 3 && !next.textContent.trim()) || next.nodeName === "UL")) {
      const n = next.nextSibling;
      if (next.nodeName === "UL") ul.append(...next.children);
      next.remove();
      next = n;
    }
  });
  return box.innerHTML;
}

async function renderHallOfFame(html) {
  const el = $("#hof");
  let coins = [];
  try {
    coins = (await fetch(asset("hof.json"), { cache: "no-cache" }).then((r) => r.json()))
      .map((c) => ({ ...c, legacy: c.legacy && asset(c.legacy), named: c.named && asset(c.named) }));
  } catch {}
  // Chips posted on Blogger after hof.json was made: show them too, after the known ones.
  const known = new Set(coins.flatMap((c) => [c.legacy, c.named].filter(Boolean).map(imgKey)));
  const posted = [...new DOMParser().parseFromString(splitHallOfFame(html)[1], "text/html").querySelectorAll("img")]
    .map((img) => img.getAttribute("src")).filter((src) => src && !known.has(imgKey(src)));

  // The wall display: a framed felt board of round slots, 5 across, with spare slots left empty
  // the way the real one is. Chips posted on Blogger after hof.json was made fill in after the rest.
  const slots = [
    ...coins.map((c, i) => `
      <button class="slot" data-i="${i}" aria-label="${esc(c.name)}, ${c.year}">
        <span class="well${c.tight ? " tight" : ""}"><img src="${esc(sized(c.legacy, "s200"))}" alt="" loading="lazy" decoding="async"></span>
        <span class="plate">${esc(c.name)} <i>${c.year}</i></span>
      </button>`),
    ...posted.map((src) => `
      <button class="slot" data-src="${esc(src)}" aria-label="Newest inductee">
        <span class="well"><img src="${esc(sized(src, "s200"))}" alt="" loading="lazy"></span>
        <span class="plate">New</span>
      </button>`),
  ];
  while (slots.length % 5) slots.push(`<div class="slot empty" aria-hidden="true"><span class="well"></span><span class="plate">&nbsp;</span></div>`);
  el.innerHTML = `
    <div class="display"><div class="felt"><div class="slots">${slots.join("")}</div></div></div>
    <p class="muted small">Ordered by the year on each chip, oldest first. Tap a chip to see both sides.</p>`;
  el.querySelectorAll("button.slot").forEach((b) => b.addEventListener("click", () =>
    b.dataset.src ? openPhoto(b.dataset.src) : openCoin(coins[+b.dataset.i])));
}

function openCoin(c) {
  let dlg = $("#coin");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "coin";
    document.body.append(dlg);
    dlg.addEventListener("click", (ev) => ev.target === dlg && dlg.close());
  }
  const side = (url, label) => `<figure><img src="${esc(sized(url, "s800"))}" alt="${esc(c.name)}: ${label}"><figcaption>${label}</figcaption></figure>`;
  dlg.innerHTML = `
    <form method="dialog"><button class="lb-close" aria-label="Close">✕</button></form>
    <div class="coin-sides">${side(c.legacy, "Front")}${c.named ? side(c.named, "Back") : ""}</div>
    <div class="coin-info">
      <h3>${esc(c.name)} <span>${c.year}</span></h3>
      <p>${esc(c.caption)}</p>
      ${c.named ? "" : '<p class="muted small">Only one side of this chip was posted.</p>'}
    </div>`;
  dlg.showModal();
}

function openPhoto(src) {
  const lb = $("#lightbox");
  $("img", lb).src = sized(src, "s2400");
  lb.showModal();
}
$("#lightbox").addEventListener("click", (ev) => ev.target.tagName !== "BUTTON" && $("#lightbox").close());

// ---------- router ----------

// The route as "p/2026/01/slug", "info/...", "page/p/slug", "recaps/2025", "search/q", "error" or "".
// Here it's the hash; on Blogger it comes from the URL Blogger served.
function currentRoute() {
  if (!HERE) return decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const path = decodeURIComponent(location.pathname);
  const q = new URLSearchParams(location.search).get("q");
  let m;
  if (SERVER?.querySelector(".server-error")) return "error";
  if ((m = path.match(/^\/(\d{4}\/\d{2}\/[^/]+?)\.html$/))) return `${BLOGS[HERE].route}/${m[1]}`;
  if ((m = path.match(/^\/(p\/[^/]+?)\.html$/))) return `page/${m[1]}`;
  if ((m = path.match(/^\/(\d{4})(\/\d{2})?\/?$/))) return HERE === "main" ? `recaps/${m[1]}` : "";
  if ((m = path.match(/^\/search\/label\/(.+)$/))) return `search/${m[1]}`;
  if (path.startsWith("/search")) return q ? `search/${q}` : "recaps";
  return "";
}

function route() {
  const view = $("#view");
  const h = currentRoute();
  const [a, ...rest] = h.split("/");
  document.title = "Pepper St Poker";
  document.body.classList.remove("nav-open");
  $(".menu-btn").setAttribute("aria-expanded", "false");
  const here = HERE ? location.href.split(/[?#]/)[0] : "#/" + h;
  $("#nav").querySelectorAll("a").forEach((l) => l.classList.toggle("on", (HERE ? l.href : l.getAttribute("href")) === here));
  if (a === "p" || a === "info") post(view, a === "p" ? "main" : "rules", rest.join("/"));
  else if (a === "page") post(view, HERE, rest.join("/"));
  else if (a === "recaps") recaps(view, rest[0]);
  else if (a === "search") searchView(view, rest.join("/"));
  else if (a === "error") view.innerHTML = failed("That page couldn't be found.");
  else if (HERE === "rules") rulesHome(view);
  else home(view);
  window.scrollTo({ top: 0 });
}

// Many blog images (the PSP badges) are transparent PNGs drawn for a white page. Mark images once
// loaded so CSS can put white behind them without a white flash while they load.
document.addEventListener("load", (ev) => ev.target.tagName === "IMG" && ev.target.classList.add("loaded"), true);

renderNav();
if (!HERE) window.addEventListener("hashchange", route);
route();
