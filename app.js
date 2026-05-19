const MAIN = document.getElementById("main");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");

function h(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "html") node.innerHTML = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : h(String(child)));
  }
  return node;
}

let activeAudio = null;
let toastTimer = null;
let pendingResumeActiveAudio = false;
let lastAllowedHash = location.hash || "#/basla";
let suppressHashRevert = false;
let lockedAudio = null;
const suppressedAudioSrc = new WeakMap();
function showToast(message) {
  const root = document.getElementById("app") || document.body;
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = el("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" });
    root.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("toast--show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("toast--show"), 2200);
}

// Enforce single-audio playback globally (works better with built-in <audio controls>).
document.addEventListener(
  "play",
  (e) => {
    const target = e.target;
    if (!(target instanceof HTMLAudioElement)) return;
    if (lockedAudio && lockedAudio !== target) {
      target.pause();
      target.currentTime = 0;
      try { target.load(); } catch {}
      showToast("Süren'nin bitmesini bekleyin");
      try { lockedAudio.play(); } catch {}
      return;
    }
    if (activeAudio && activeAudio !== target && !activeAudio.paused && !activeAudio.ended) {
      target.pause();
      target.currentTime = 0;
      // Cancel any pending playback on the blocked element so it won't start later.
      try {
        target.load();
      } catch {
        // ignore
      }
      showToast("Süren'nin bitmesini bekleyin");
      pendingResumeActiveAudio = true;
      try {
        activeAudio.play();
      } catch {
        // ignore
      }
      return;
    }
    activeAudio = target;
    pendingResumeActiveAudio = false;
    lastAllowedHash = location.hash || lastAllowedHash;
  },
  true,
);
document.addEventListener(
  "pause",
  (e) => {
    const target = e.target;
    if (!(target instanceof HTMLAudioElement)) return;
    if (activeAudio !== target) return;

    // If the active audio was paused because user tried to start another one,
    // immediately resume it.
    if (pendingResumeActiveAudio && !target.ended) {
      pendingResumeActiveAudio = false;
      try {
        target.play();
      } catch {
        // ignore
      }
      return;
    }

    activeAudio = null;
  },
  true,
);

function isAudioBlockingNavigation() {
  return !!(activeAudio && !activeAudio.paused && !activeAudio.ended);
}

// Block navigation via menu while audio is playing.
document.addEventListener(
  "click",
  (e) => {
    const a = e.target instanceof Element ? e.target.closest("a") : null;
    if (!a) return;
    if (!a.classList.contains("nav__item")) return;
    if (!isAudioBlockingNavigation()) return;
    e.preventDefault();
    e.stopPropagation();
    showToast("Süren'nin bitmesini bekleyin");
  },
  true,
);

// Block route changes via back/forward or programmatic hash changes.
window.addEventListener("hashchange", () => {
  if (suppressHashRevert) return;
  if (!isAudioBlockingNavigation()) {
    lastAllowedHash = location.hash || lastAllowedHash;
    return;
  }
  showToast("Süren'nin bitmesini bekleyin");
  suppressHashRevert = true;
  // revert to last allowed route
  location.hash = lastAllowedHash;
  // allow next real change
  setTimeout(() => {
    suppressHashRevert = false;
  }, 0);
});

function normalize(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, " ")
    .trim();
}

function toUrl(pathOrUrl) {
  const s = String(pathOrUrl || "");
  if (!s) return s;
  if (/^(https?:)?\/\//i.test(s) || /^https?:/i.test(s) || /^data:/i.test(s)) return s;
  return s
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function isAndroidWebView() {
  const ua = navigator.userAgent || "";
  // "wv" and/or "Version/" usually indicates Android WebView
  return /Android/i.test(ua) && (/\bwv\b/i.test(ua) || /Version\//i.test(ua));
}

function androidPdfLink(assetPath) {
  // Pass relative path under assets/www
  const p = String(assetPath || "").replace(/^\.?\//, "");
  const safe = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `app://pdf?path=${safe}`;
}

function routeFromHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw || raw === "/") return { path: "/basla", params: {} };
  const [path, query] = raw.split("?");
  const params = {};
  if (query) {
    for (const part of query.split("&")) {
      const [k, v] = part.split("=");
      if (!k) continue;
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return { path, params };
}

function setActiveNav(path) {
  for (const a of document.querySelectorAll(".nav__item")) {
    const matches = a.getAttribute("data-route") === path;
    if (matches) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

async function loadIndex() {
  try {
    const res = await fetch("content-index.json", { cache: "no-store" });
    if (!res.ok) throw new Error("index not found");
    return await res.json();
  } catch {
    return null;
  }
}

function pill(text, variant = "brand") {
  const cls =
    variant === "ok"
      ? "pill pill--ok"
      : variant === "warn"
        ? "pill pill--warn"
        : "pill pill--brand";
  return el("span", { class: cls }, text);
}

function card(title, meta, actions = []) {
  return el(
    "div",
    { class: "card" },
    el("div", { class: "card__body" }, el("div", { class: "card__title" }, title), el("div", { class: "card__meta" }, meta)),
    el("div", { class: "row" }, actions),
  );
}

function renderDetailText(detailText) {
  const text = String(detailText || "");
  const lines = text.split(/\r?\n/);
  const isArabicLine = (s) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(s);

  return el(
    "div",
    { class: "item__detail" },
    lines.map((line) => {
      const cls = isArabicLine(line) ? "detailLine arabic" : "detailLine";
      // Keep empty lines as spacing
      return el("div", { class: cls }, line === "" ? "\u00A0" : line);
    }),
  );
}

function repeatControls(audioEl) {
  const select = el(
    "select",
    { class: "repeat__select", title: "Tekrar sayısı (en fazla 10x)" },
    ...Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return el("option", { value: String(n) }, `${n}x`);
    }),
  );
  select.value = "1";

  const counter = el("span", { class: "repeat__counter" }, "");

  const state = { total: 1, cycle: 0, timer: null };
  const setPlayingStyle = (on) => {
    const item = audioEl.closest(".item");
    if (!item) return;
    item.classList.toggle("item--playing", on);
  };
  const scrollToPlayer = () => {
    const item = audioEl.closest(".item");
    if (!item) return;
    item.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  };
  const setHeardStyle = () => {
    const item = audioEl.closest(".item");
    if (!item) return;
    item.classList.add("item--heard");
  };

  const setLock = (on) => {
    if (on) {
      lockedAudio = audioEl;
      // Suppress all other audio sources so they can't queue playback.
      for (const other of document.querySelectorAll("audio")) {
        if (other === audioEl) continue;
        if (!suppressedAudioSrc.has(other)) suppressedAudioSrc.set(other, other.getAttribute("src") || "");
        other.pause();
        other.removeAttribute("src");
        try { other.load(); } catch {}
      }
    } else if (lockedAudio === audioEl) {
      lockedAudio = null;
      // Restore suppressed sources.
      for (const other of document.querySelectorAll("audio")) {
        if (!suppressedAudioSrc.has(other)) continue;
        const src = suppressedAudioSrc.get(other) || "";
        suppressedAudioSrc.delete(other);
        if (src) other.setAttribute("src", src);
        try { other.load(); } catch {}
      }
    }
  };
  const sync = () => {
    if (state.total > 1) {
      counter.textContent = `${Math.max(1, state.cycle || 1)}/${state.total}`;
      return;
    }
    counter.textContent = "";
  };
  const reset = () => {
    state.cycle = 0;
    sync();
  };
  const clearRepeatTimer = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  };
  const scheduleNextCycle = () => {
    clearRepeatTimer();
    if (state.total <= 1 || state.cycle >= state.total || audioEl.paused) return;

    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    if (duration <= 0) {
      state.timer = setTimeout(scheduleNextCycle, 250);
      return;
    }

    const remaining = Math.max(0.2, duration - (audioEl.currentTime || 0));
    state.timer = setTimeout(() => {
      if (state.total <= 1 || audioEl.paused) return;

      if (state.cycle < state.total) {
        state.cycle += 1;
        sync();
      }

      if (state.cycle >= state.total) {
        audioEl.loop = false;
        clearRepeatTimer();
        return;
      }

      scheduleNextCycle();
    }, (remaining + 0.15) * 1000);
  };

  select.addEventListener("change", () => {
    state.total = Math.max(1, Math.min(10, Number(select.value) || 1));
    clearRepeatTimer();
    reset();
    if (state.total <= 1) setLock(false);
    audioEl.loop = state.total > 1;
    if (state.total > 1 && !audioEl.paused) {
      if (state.cycle === 0) state.cycle = 1;
      setLock(true);
      sync();
      scheduleNextCycle();
    }
  });

  audioEl.addEventListener("play", () => {
    setPlayingStyle(true);
    scrollToPlayer();
    if (state.cycle === 0) state.cycle = 1;
    if (state.total > 1) setLock(true);
    audioEl.loop = state.total > 1;
    sync();
    if (state.total > 1) scheduleNextCycle();
  });
  audioEl.addEventListener("pause", () => {
    setPlayingStyle(false);
    // If user pauses manually, release the lock.
    clearRepeatTimer();
    if (state.total > 1) setLock(false);
    audioEl.loop = false;
  });
  audioEl.addEventListener("seeked", () => {
    // When looping, the browser may reset currentTime to 0 between cycles.
    if (state.total > 1 && audioEl.loop) return;
    if (audioEl.currentTime < 0.1) reset();
    if (state.total > 1 && !audioEl.paused) scheduleNextCycle();
  });
  audioEl.addEventListener("ended", async () => {
    setPlayingStyle(false);
    setHeardStyle();
    clearRepeatTimer();
    if (state.total <= 1) {
      reset();
      return;
    }
    audioEl.loop = false;
    setLock(false);
    reset();
  });

  return el("div", { class: "repeat" }, el("span", { class: "repeat__label" }, "Tekrar"), select, counter);
}

function audioRow(name, src, sub, detailText = "") {
  const a = el("audio", { class: "media", controls: "true", preload: "none", src: toUrl(src) });
  const rep = repeatControls(a);
  const mediaBox = el("div", { class: "item__media" }, el("div", { class: "mediaRow" }, a, rep));
  const detail = detailText ? renderDetailText(detailText) : null;

  if (!detailText) {
    return el(
      "div",
      { class: "item" },
      el("div", { class: "item__left" }, el("div", { class: "item__title" }, name), el("div", { class: "item__sub" }, sub || src)),
      el("div", { style: "min-width: min(420px, 54vw);" }, el("div", { class: "mediaRow" }, a, rep)),
    );
  }

  return el(
    "div",
    { class: "item item--stack" },
    el("div", { class: "item__left" }, el("div", { class: "item__title" }, name), el("div", { class: "item__sub" }, sub || src)),
    mediaBox,
    detail,
  );
}

function videoRow(name, src, sub) {
  const v = el("video", { class: "media", controls: "true", preload: "metadata", src: toUrl(src) });
  return el(
    "div",
    { class: "item" },
    el("div", { class: "item__left" }, el("div", { class: "item__title" }, name), el("div", { class: "item__sub" }, sub || src)),
    el("div", { style: "min-width: min(520px, 62vw);" }, v),
  );
}

function docLink(label, href) {
  return el("a", { class: "btn btn--ghost", href: toUrl(href), target: "_blank", rel: "noreferrer" }, label);
}

function fileDownload(label, href) {
  return el("a", { class: "btn", href: toUrl(href), download: "" }, label);
}

function renderBasla(index) {
  const hints = el(
    "div",
    { class: "grid" },
    card(
      "1) Sıfırdan başla (en kolay yol)",
      "Önce resimli namaz adımlarına bak, sonra sure/duaları sesli dinleyerek ezberle.",
      [
        el("a", { class: "btn btn--primary", href: "#/namazlar" }, "Namazlara git"),
        el("a", { class: "btn", href: "#/sureler" }, "Surelere git"),
      ],
    ),
    card(
      "2) Günlük tekrar (10–15 dk)",
      "Her gün 1 sure seç → dinle → tekrar et → sonra kısa bir namaz adımını oku.",
      [pill("Arama: üstteki kutu", "brand"), pill("Mobil uyumlu", "ok")],
    ),
  );

  const quick = el(
    "div",
    { class: "grid" },
    card("Sabah", "Görsel anlatım + PDF", [el("a", { class: "btn btn--primary", href: "#/namazlar?s=sabah" }, "Aç")]),
    card("Ayetel Kürsi", "Dinle + tekrar et", [el("a", { class: "btn btn--primary", href: "#/sureler?q=ayetel" }, "Aç")]),
  );

  return el(
    "div",
    {},
    el("h1", { class: "h1" }, "Hoş geldin"),
    el(
      "p",
      { class: "p" },
      "Bu uygulama Namaz kılma ve duaları ezberleme ve Öğrenme için tasarlanmıştır.",
    ),
    hints,
    el("div", { class: "sep" }),
    el("h1", { class: "h1" }, "Hızlı erişim"),
    quick,
    el("div", { class: "sep" }),
    el(
      "p",
      { class: "p" },
      "İpucu: Klavyede ",
      el("span", { class: "kbd" }, "/"),
      " tuşuna basınca arama kutusuna odaklanır.",
    ),
  );
}

function renderNamazlar(index, params) {
  const selected = normalize(params.s || "");
  const list = index?.namazlar || [];

  const header = el(
    "div",
    {},
    el("h1", { class: "h1" }, "Namazlar"),
    el("p", { class: "p" }, "Resimli adımlar ve ilgili dosyalar."),
  );

  if (selected) {
    const item = list.find((n) => normalize(n.id) === selected) || list.find((n) => normalize(n.ad).includes(selected));
    if (!item) return el("div", {}, header, el("p", { class: "p" }, "Bulunamadı."));
    return el("div", {}, header, renderNamazDetay(item));
  }

  const grid = el(
    "div",
    { class: "grid" },
    list.map((n) =>
      el(
        "div",
        { class: "card" },
        el(
          "div",
          { class: "card__body" },
          el("div", { class: "card__title" }, n.ad),
          el("div", { class: "card__meta" }, `${n.rekat || ""} • ${n.resimler?.length || 0} görsel • ${n.pdfler?.length || 0} PDF`),
        ),
        el("div", { class: "row" }, pill(n.rekat || "Rekât", "brand")),
        el(
          "div",
          { class: "row" },
          el("a", { class: "btn btn--primary", href: `#/namazlar?s=${encodeURIComponent(n.id)}` }, "Aç"),
        ),
      ),
    ),
  );
  return el("div", {}, header, grid);
}

function renderNamazDetay(item) {
  const actions = el("div", { class: "viewer__actions" }, el("a", { class: "btn", href: "#/resimli" }, "Resimli bölümüne git"));

  const pdfs = (item.pdfler || []).map((p) => {
    const url = toUrl(p);
    const androidUrl = androidPdfLink(p);
    const header = el(
      "div",
      { class: "row" },
      pill("PDF", "warn"),
      el(
        "a",
        { class: "btn btn--primary", href: isAndroidWebView() ? androidUrl : url, target: isAndroidWebView() ? undefined : "_blank", rel: "noreferrer" },
        "PDF Aç",
      ),
      el("a", { class: "btn btn--ghost", href: url, target: "_blank", rel: "noreferrer" }, "Yeni sekmede aç"),
    );

    if (isAndroidWebView()) {
      return el(
        "div",
        { class: "viewer" },
        header,
        el("p", { class: "p" }, "Not: Offline APK’da PDF, uygulama içi görüntüleyicide açılır."),
      );
    }

    return el(
      "div",
      { class: "viewer" },
      header,
      el(
        "object",
        { class: "media", data: url, type: "application/pdf", style: "height: min(72vh, 720px);" },
        el("a", { href: url }, "PDF indir"),
      ),
    );
  });

  const imgs = (item.resimler || []).map((src) =>
    el(
      "div",
      { class: "viewer" },
      el(
        "div",
        { class: "row" },
        pill("Görsel", "brand"),
        el("a", { class: "btn btn--ghost", href: toUrl(src), target: "_blank", rel: "noreferrer" }, "Yeni sekmede aç"),
      ),
      el("img", { class: "img", src: toUrl(src), alt: item.ad }),
    ),
  );

  return el(
    "div",
    {},
    el("div", { class: "sep" }),
    el("h1", { class: "h1" }, `${item.ad} (${item.rekat || ""})`),
    el("p", { class: "p" }, "PDF anlatımı ve adım adım görselleri takip et."),
    actions,
    el("div", { class: "sep" }),
    ...pdfs,
    ...imgs,
  );
}

function renderSureler(index, params) {
  const q = normalize(params.q || "");
  const list = index?.surelerVeDualar || [];
  const filtered = q ? list.filter((s) => normalize(s.ad).includes(q) || normalize(s.tur).includes(q)) : list;

  const header = el(
    "div",
    {},
    el("h1", { class: "h1" }, "Sureler & Dualar"),
    el("p", { class: "p" }, "Dinle → tekrar et → ezberle. Üstteki aramayı da kullanabilirsin."),
  );

  const group = (tur) => filtered.filter((x) => x.tur === tur);
  const ezan = group("Ezan");
  const sureler = group("Sure");
  const dualar = group("Dua");

  const section = (title, items) =>
    el(
      "div",
      {},
      el("div", { class: "sep" }),
      el("div", { class: "row" }, el("h1", { class: "h1", style: "margin:0" }, title), pill(`${items.length} kayıt`, "brand")),
      el("div", { class: "list" }, items.map((s) => audioRow(s.ad, s.ses, s.tur, s.metin || ""))),
    );

  return el("div", {}, header, section("Ezan", ezan), section("Dualar", dualar), section("Sureler", sureler), extraDocs(index));
}

function extraDocs(index) {
  const docs = index?.medya?.dokumanlar || [];
  if (!docs.length) return el("div", {});

  const prettyTitle = (s) => {
    let t = String(s || "").trim();

    // Normalize "01- ..." / "01_ ..." -> "01. ..."
    t = t.replace(/^(\d{2})\s*[-_]\s*/u, "$1. ");

    // Replace underscores/dashes with spaces (keep the leading "01. " intact)
    const m = t.match(/^(\d{2})\.\s*(.*)$/u);
    const prefix = m ? `${m[1]}. ` : "";
    let rest = m ? m[2] : t;
    rest = rest.replace(/[_-]+/g, " ");
    rest = rest.replace(/\s+/g, " ").trim();
    t = `${prefix}${rest}`.trim();

    // Turkish display fixes for ASCII file names
    t = t
      .replace(/\bSabah\b/gu, "Sabah")
      .replace(/\bOgle\b/gu, "Öğle")
      .replace(/\bIkindi\b/gu, "İkindi")
      .replace(/\bAksam\b/gu, "Akşam")
      .replace(/\bYatsi\b/gu, "Yatsı")
      .replace(/\bNamazi\b/gu, "Namazı")
      .replace(/\bKisa\b/gu, "Kısa")
      .replace(/\bIftitah\b/gu, "İftitah")
      .replace(/\bTekbiri\b/gu, "Tekbiri")
      .replace(/\bOkunan\b/gu, "Okunan")
      .replace(/\bSureler\b/gu, "Sureler");

    return t;
  };

  return el(
    "div",
    {},
    el("div", { class: "sep" }),
    el("h1", { class: "h1" }, "Ek dokümanlar"),
    el(
      "div",
      { class: "list" },
      docs.map((d) =>
        el(
          "div",
          { class: "item" },
          el("div", { class: "item__left" }, el("div", { class: "item__title" }, prettyTitle(d.ad))),
          el("div", { class: "row" }, docLink("Aç", d.dosya)),
        ),
      ),
    ),
  );
}

function renderResimli(index) {
  const pdfs = index?.resimli?.pdfler || [];
  const imgs = index?.resimli?.resimler || [];

  return el(
    "div",
    {},
    el("h1", { class: "h1" }, "Resimli"),
    el("p", { class: "p" }, "Rekât tablosu ve namaz adım görselleri."),
    el(
      "div",
      { class: "grid" },
      pdfs.map((p) =>
        el(
          "div",
          { class: "card card--stack", style: "grid-column: span 12;" },
          el("div", { class: "card__body" }, el("div", { class: "card__title" }, p.split("/").pop()), el("div", { class: "card__meta" }, "PDF")),
          el(
            "div",
            { class: "row" },
            el("a", { class: "btn btn--primary", href: toUrl(p), target: "_blank", rel: "noreferrer" }, "Aç"),
            isAndroidWebView() ? el("span", { class: "pill pill--warn" }, "WebView PDF: harici aç") : null,
          ),
        ),
      ),
    ),
    el("div", { class: "sep" }),
    el(
      "div",
      { class: "grid" },
      imgs.map((src) =>
        el(
          "div",
          { class: "card card--stack", style: "grid-column: span 6;" },
          el("div", { class: "card__body" }, el("div", { class: "card__title" }, src.split("/").pop()), el("div", { class: "card__meta" }, "Görsel")),
          el("img", { class: "img", src: toUrl(src), alt: src.split("/").pop() }),
          el("div", { class: "row" }, el("a", { class: "btn btn--ghost", href: toUrl(src), target: "_blank", rel: "noreferrer" }, "Yeni sekmede aç")),
        ),
      ),
    ),
  );
}

function youtubeId(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || "";
  } catch {
    // ignore
  }
  return "";
}

function youtubeRow(name, url) {
  const id = youtubeId(url);
  const embed = id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : url;
  const iframe = el("iframe", {
    class: "media",
    src: embed,
    title: name,
    allow:
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    allowfullscreen: "true",
    referrerpolicy: "strict-origin-when-cross-origin",
    style: "height: min(62vh, 540px);"
  });
  return el(
    "div",
    { class: "item" },
    el("div", { class: "item__left" }, el("div", { class: "item__title" }, name), el("div", { class: "item__sub" }, "YouTube")),
    el("div", { style: "min-width: min(720px, 72vw);" }, iframe),
  );
}

function renderMedya(index) {
  const v = index?.medya?.video || [];
  const yt = index?.medya?.youtube || [];
  const a = index?.medya?.ses || [];
  const list = el(
    "div",
    { class: "list" },
    ...yt.map((x) => youtubeRow(x.ad, x.url)),
    ...v.map((x) => videoRow(x.ad, x.dosya, "Video")),
    ...a.map((x) => audioRow(x.ad, x.dosya, "Ses")),
  );
  return el("div", {}, el("h1", { class: "h1" }, "Medya"), el("p", { class: "p" }, "Video ve toplu ses kayıtları."), list);
}

function renderArama(index, query) {
  const q = normalize(query || "");
  const all = [];

  for (const n of index?.namazlar || []) {
    const detail = (n.pdfler && n.pdfler.length) ? n.pdfler[0] : "";
    all.push({ kind: "Namaz", title: `${n.ad} (${n.rekat})`, href: `#/namazlar?s=${encodeURIComponent(n.id)}`, detail });
  }
  for (const s of index?.surelerVeDualar || []) {
    all.push({ kind: s.tur, title: s.ad, href: `#/sureler?q=${encodeURIComponent(s.ad)}`, detail: s.ses });
  }
  for (const p of index?.resimli?.pdfler || []) {
    all.push({ kind: "PDF", title: p.split("/").pop(), href: p, detail: p });
  }
  for (const i of index?.resimli?.resimler || []) {
    all.push({ kind: "Görsel", title: i.split("/").pop(), href: i, detail: i });
  }

  const filtered = q ? all.filter((x) => normalize(x.title).includes(q) || normalize(x.kind).includes(q)) : all.slice(0, 12);
  return el(
    "div",
    {},
    el("h1", { class: "h1" }, "Arama"),
    el("p", { class: "p" }, q ? `Aranan: “${query}”` : "Üstteki arama kutusunu kullan veya bir kelime yaz."),
    el(
      "div",
      { class: "list" },
      filtered.map((x) =>
        el(
          "div",
          { class: "item" },
          el("div", { class: "item__left" }, el("div", { class: "item__title" }, x.title), el("div", { class: "item__sub" }, `${x.kind} • ${x.detail}`)),
          el(
            "div",
            { class: "row" },
            el(
              "a",
              {
                class: "btn btn--primary",
                href: x.href.startsWith("#") ? x.href : toUrl(x.href),
                target: x.href.startsWith("#") ? undefined : "_blank",
                rel: "noreferrer"
              },
              "Aç",
            ),
          ),
        ),
      ),
    ),
  );
}

function renderNotFound() {
  return el(
    "div",
    {},
    el("h1", { class: "h1" }, "Sayfa bulunamadı"),
    el("p", { class: "p" }, "Sol menüden bir bölüm seç."),
    el("a", { class: "btn btn--primary", href: "#/basla" }, "Başla"),
  );
}

function setMain(node) {
  MAIN.innerHTML = "";
  MAIN.append(node);
  MAIN.focus();
}

let CONTENT_INDEX = null;

function setupAutoNextAudio() {
  const audios = Array.from(MAIN.querySelectorAll("audio"));
  if (audios.length < 2) return;
  audios.forEach((audio, idx) => {
    audio.addEventListener("play", () => {
      for (const other of audios) {
        if (other !== audio) other.pause();
      }
    });
    audio.addEventListener("ended", () => {
      const next = audios[idx + 1];
      if (next) next.play().catch(() => {});
    });
  });
}

function setupTopbarHeightVar() {
  const topbar = document.querySelector(".topbar");
  if (!topbar || !("ResizeObserver" in window)) return;
  const ro = new ResizeObserver(() => {
    const h = Math.ceil(topbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--topbar-h", `${h}px`);
  });
  ro.observe(topbar);
}

function render() {
  const { path, params } = routeFromHash();
  setActiveNav(path);

  if (!CONTENT_INDEX) {
    setMain(
      el(
        "div",
        {},
        el("h1", { class: "h1" }, "Yükleniyor..."),
        el("p", { class: "p" }, "İçerik indeksi okunuyor."),
      ),
    );
    return;
  }

  if (path === "/basla") {
    setMain(renderBasla(CONTENT_INDEX));
  } else if (path === "/namazlar") {
    setMain(renderNamazlar(CONTENT_INDEX, params));
  } else if (path === "/sureler") {
    if (typeof params.q === "string") searchInput.value = params.q;
    setMain(renderSureler(CONTENT_INDEX, params));
    setupAutoNextAudio();
  } else if (path === "/resimli") {
    setMain(renderResimli(CONTENT_INDEX));
  } else if (path === "/medya") {
    setMain(renderMedya(CONTENT_INDEX));
  } else if (path === "/arama") {
    if (typeof params.q === "string") searchInput.value = params.q;
    setMain(renderArama(CONTENT_INDEX, params.q ?? searchInput.value));
  } else {
    setMain(renderNotFound());
  }
}

function navigateToSearch(query) {
  const q = String(query || "").trim();
  if (!q) {
    location.hash = "#/arama";
    return;
  }
  location.hash = `#/arama?q=${encodeURIComponent(q)}`;
}

async function main() {
  CONTENT_INDEX = await loadIndex();
  if (!CONTENT_INDEX) {
    setMain(
      el(
        "div",
        {},
        el("h1", { class: "h1" }, "İçerik bulunamadı"),
        el("p", { class: "p" }, "`content-index.json` okunamadı. Dosya adları/klasörler değiştiyse tekrar oluşturmak gerekebilir."),
      ),
    );
    return;
  }

  setupTopbarHeightVar();

  window.addEventListener("hashchange", render);
  render();

  // In offline Android APK, the raw folder link isn't meaningful.
  if (isAndroidWebView()) {
    const footerLink = document.querySelector(".footer__link");
    if (footerLink) footerLink.style.display = "none";
  }

  clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    navigateToSearch("");
    searchInput.focus();
  });

  let typingTimer = 0;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => navigateToSearch(searchInput.value), 200);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
      searchInput.blur();
    }
  });
}

main();
