(function () {
  "use strict";

  const STORE_KEY = "brand-coach.v1";
  const MODULES = window.PROGRAM.modules;
  const STEPS = [];
  MODULES.forEach(m => m.steps.forEach(s => STEPS.push(Object.assign({ module: m }, s))));
  const STEP = Object.fromEntries(STEPS.map(s => [s.id, s]));
  const WHO = { client: "Клиент", coach: "Наставник", both: "Вместе" };
  const STATUS = { todo: "Не начат", progress: "В работе", done: "Готово" };
  const DEFAULT_FIELD = { key: "result", label: "Результат — ответ нейросети", type: "textarea", big: true };

  // ---------- storage ----------
  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }
    return { clients: [] };
  }
  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
      catch (e) { toast("Не удалось сохранить — сделайте резервную копию"); }
    };
    now ? write() : (saveTimer = setTimeout(write, 300));
  }

  const uid = () => Math.random().toString(36).slice(2, 10);
  const client = id => db.clients.find(c => c.id === id);
  function stepData(c, sid) {
    c.data = c.data || {};
    return (c.data[sid] = c.data[sid] || { status: "todo", f: {}, notes: "" });
  }
  const touch = c => { c.updated = Date.now(); };
  const activeModules = c => MODULES.filter(m => !(c.off || []).includes(m.id));
  const fieldsOf = s => (s.fields && s.fields.length ? s.fields : [DEFAULT_FIELD]);

  function progress(c, mods) {
    const steps = (mods || activeModules(c)).flatMap(m => m.steps);
    const done = steps.filter(s => c.data && c.data[s.id] && c.data[s.id].status === "done").length;
    return { done, total: steps.length, pct: steps.length ? Math.round(done / steps.length * 100) : 0 };
  }

  function hasValue(v) {
    if (Array.isArray(v)) return v.some(r => r.some(x => String(x || "").trim()));
    return String(v || "").trim() !== "";
  }

  // ---------- helpers ----------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const fill = (text, c) => String(text || "").replace(/\{\{name\}\}/g, c && c.name ? c.name : "[имя]");
  const $ = (sel, root) => (root || document).querySelector(sel);
  const app = $("#app");

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 1800);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    toast("Скопировано");
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString("ru-RU") : "";
  const slug = s => String(s || "client").trim().replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();

  // ---------- router ----------
  window.addEventListener("hashchange", render);
  function render() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    document.querySelectorAll(".topbar nav a").forEach(a => {
      const h = a.getAttribute("href").replace("#/", "");
      a.classList.toggle("active", (parts[0] || "") === h || (h === "" && parts[0] === "c"));
    });
    window.scrollTo(0, 0);
    app.onclick = app.oninput = app.onchange = null;
    if (parts[0] === "guide") return viewGuide();
    if (parts[0] === "program") return parts[1] === "s" ? viewStep(null, parts[2]) : viewProgram();
    if (parts[0] === "c") {
      const c = client(parts[1]);
      if (!c) { location.hash = "#/"; return; }
      if (parts[2] === "s") return viewStep(c, parts[3]);
      if (parts[2] === "book") return viewBook(c);
      return viewClient(c);
    }
    viewClients();
  }

  // ---------- views: clients ----------
  function viewClients() {
    const list = db.clients.filter(c => !c.archived).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const archived = db.clients.filter(c => c.archived);
    app.innerHTML = `
      <div class="spread">
        <div><h1>Клиенты</h1><p class="muted">Ведите каждого клиента по программе: промпты, задания, ответы и итоговая библия бренда.</p></div>
        <button class="primary" data-act="new">+ Новый клиент</button>
      </div>
      <form class="card no-print" id="newForm" hidden>
        <h3>Новый клиент</h3>
        <label for="nName">Имя</label><input type="text" id="nName" required placeholder="Например: Анна или «Я» — для своего бренда">
        <label for="nNiche">Сфера / ниша</label><input type="text" id="nNiche" placeholder="Психология, beauty, юрист, кафе…">
        <label for="nType">Что строим</label>
        <select id="nType"><option>Личный бренд</option><option>Бренд компании</option><option>Личный бренд + компания</option></select>
        <div class="row" style="margin-top:14px"><button class="primary" type="submit">Создать</button><button type="button" class="ghost" data-act="cancel">Отмена</button></div>
      </form>
      ${list.length ? `<div class="grid">${list.map(clientCard).join("")}</div>` : `
        <div class="card empty">
          <h2>Пока нет клиентов</h2>
          <p class="muted">Создайте первого клиента — или себя, чтобы вести собственную «библию бренда».</p>
        </div>`}
      ${archived.length ? `<h3 style="margin-top:24px">Архив</h3><div class="grid">${archived.map(clientCard).join("")}</div>` : ""}
      <div class="card no-print" style="margin-top:24px">
        <h3>Резервная копия</h3>
        <p class="muted small">Данные хранятся только в этом браузере. Регулярно скачивайте копию — с ней можно перенести всё на другой компьютер или телефон.</p>
        <div class="row">
          <button data-act="export">Скачать копию (.json)</button>
          <label class="btn" style="margin:0">Загрузить копию<input type="file" accept=".json,application/json" id="importFile" hidden></label>
        </div>
      </div>`;
    const form = $("#newForm");
    app.onclick = e => {
      const act = e.target.closest("[data-act]");
      if (!act) return;
      const a = act.dataset.act;
      if (a === "new") { form.hidden = false; $("#nName").focus(); }
      if (a === "cancel") form.hidden = true;
      if (a === "export") exportAll();
    };
    form.onsubmit = e => {
      e.preventDefault();
      const name = $("#nName").value.trim();
      if (!name) return;
      const c = { id: uid(), name, niche: $("#nNiche").value.trim(), type: $("#nType").value, created: Date.now(), updated: Date.now(), off: [], data: {} };
      stepData(c, "intake").f.brandType = c.type;
      stepData(c, "intake").f.niche = c.niche;
      db.clients.push(c); save(true);
      location.hash = `#/c/${c.id}`;
    };
    $("#importFile").onchange = e => importFile(e.target.files[0]);
  }

  function clientCard(c) {
    const p = progress(c);
    return `<a class="card" href="#/c/${c.id}">
      <div class="spread"><h3>${esc(c.name)}</h3><span class="badge">${p.pct}%</span></div>
      <div class="muted small">${esc(c.type || "")}${c.niche ? " · " + esc(c.niche) : ""}</div>
      <div class="progress" style="margin:10px 0 6px"><i style="width:${p.pct}%"></i></div>
      <div class="muted small">${p.done} из ${p.total} шагов · обновлено ${fmtDate(c.updated)}</div>
    </a>`;
  }

  function exportAll() {
    download(`brand-coach-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 1), "application/json");
  }
  function importFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const incoming = data.clients || (data.id && data.name ? [data] : null);
        if (!incoming) throw new Error("format");
        let added = 0, replaced = 0;
        incoming.forEach(c => {
          const i = db.clients.findIndex(x => x.id === c.id);
          if (i >= 0) { db.clients[i] = c; replaced++; } else { db.clients.push(c); added++; }
        });
        save(true); render();
        toast(`Загружено: новых ${added}, обновлено ${replaced}`);
      } catch (e) { toast("Не получилось прочитать файл"); }
    };
    r.readAsText(file);
  }

  // ---------- views: client dashboard ----------
  function viewClient(c) {
    const p = progress(c);
    const next = activeModules(c).flatMap(m => m.steps).find(s => !c.data[s.id] || c.data[s.id].status !== "done");
    app.innerHTML = `
      <div class="crumbs"><a href="#/">Клиенты</a></div>
      <div class="spread">
        <div>
          <h1>${esc(c.name)}</h1>
          <div class="muted">${esc(c.type || "")}${c.niche ? " · " + esc(c.niche) : ""} · с ${fmtDate(c.created)}</div>
        </div>
        <div class="row no-print">
          ${next ? `<a class="btn primary" href="#/c/${c.id}/s/${next.id}">Продолжить: ${esc(next.title)}</a>` : ""}
          <a class="btn" href="#/c/${c.id}/book">📖 Библия бренда</a>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="spread"><b>Прогресс программы</b><span class="muted">${p.done} из ${p.total} · ${p.pct}%</span></div>
        <div class="progress" style="margin-top:8px"><i style="width:${p.pct}%"></i></div>
      </div>
      ${MODULES.map(m => moduleCard(c, m)).join("")}
      <details class="card no-print">
        <summary><b>Настроить программу и клиента</b></summary>
        <p class="muted small">Отключите блоки, которые не нужны этому клиенту. Данные в них сохранятся.</p>
        ${MODULES.map(m => `<label style="font-weight:400;margin:4px 0"><input type="checkbox" data-mod="${m.id}" ${(c.off || []).includes(m.id) ? "" : "checked"}> ${m.icon} ${esc(m.title)}</label>`).join("")}
        <label for="cName">Имя</label><input type="text" id="cName" value="${esc(c.name)}">
        <label for="cNiche">Сфера / ниша</label><input type="text" id="cNiche" value="${esc(c.niche || "")}">
        <div class="row" style="margin-top:14px">
          <button data-act="export">Скачать данные клиента (.json)</button>
          <button data-act="archive">${c.archived ? "Вернуть из архива" : "В архив"}</button>
          <button class="danger" data-act="delete">Удалить клиента</button>
        </div>
      </details>`;
    app.onclick = e => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "export") download(`${slug(c.name)}.json`, JSON.stringify(c, null, 1), "application/json");
      if (a.dataset.act === "archive") { c.archived = !c.archived; save(true); render(); }
      if (a.dataset.act === "delete" && confirm(`Удалить «${c.name}» и все ответы? Это нельзя отменить.`)) {
        db.clients = db.clients.filter(x => x !== c); save(true); location.hash = "#/";
      }
    };
    app.onchange = e => {
      const mod = e.target.dataset.mod;
      if (mod) {
        c.off = (c.off || []).filter(x => x !== mod);
        if (!e.target.checked) c.off.push(mod);
        touch(c); save(true); render();
      }
    };
    app.oninput = e => {
      if (e.target.id === "cName") { c.name = e.target.value; touch(c); save(); }
      if (e.target.id === "cNiche") { c.niche = e.target.value; touch(c); save(); }
    };
  }

  function moduleCard(c, m) {
    const off = (c.off || []).includes(m.id);
    const p = progress(c, [m]);
    return `<section class="card module ${off ? "off" : ""}">
      <div class="spread"><h2>${m.icon} ${esc(m.title)}</h2><span class="muted small">${off ? "отключён" : `${p.done}/${p.total}`}</span></div>
      <div class="muted small">${esc(m.about)}</div>
      ${off ? "" : `<ul class="steps">${m.steps.map(s => {
        const st = (c.data[s.id] || {}).status || "todo";
        return `<li><a href="#/c/${c.id}/s/${s.id}"><span>${esc(s.title)}</span>
          <span class="row"><span class="badge who">${WHO[s.who] || ""}</span>${statusBadge(st)}</span></a></li>`;
      }).join("")}</ul>`}
    </section>`;
  }
  function statusBadge(st) {
    return `<span class="badge ${st === "done" ? "done" : st === "progress" ? "progress-b" : ""}">${STATUS[st]}</span>`;
  }

  // ---------- views: step ----------
  function assignmentText(s, c) {
    const out = [`${s.module.icon} ${s.module.title} → ${s.title}`];
    if (s.goal) out.push(s.goal);
    if (s.task) out.push("ЗАДАНИЕ:\n" + s.task);
    if (s.questions && s.questions.length) out.push("ВСПОМОГАТЕЛЬНЫЕ ВОПРОСЫ:\n" + s.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
    if (s.prompt) out.push("ПРОМПТ — скопируй и отправь в чат проекта в нейросети:\n\n" + s.prompt);
    out.push("Результат пришли мне или вставь в приложение 🙌");
    return fill(out.join("\n\n"), c);
  }

  function viewStep(c, sid) {
    const s = STEP[sid];
    if (!s) { location.hash = c ? `#/c/${c.id}` : "#/program"; return; }
    const list = c ? activeModules(c).flatMap(m => m.steps) : STEPS;
    const i = list.findIndex(x => x.id === sid);
    const prev = list[i - 1], next = list[i + 1];
    const base = c ? `#/c/${c.id}/s/` : "#/program/s/";
    const d = c ? stepData(c, sid) : null;
    const prompt = fill(s.prompt, c);

    app.innerHTML = `
      <div class="crumbs">${c ? `<a href="#/">Клиенты</a> / <a href="#/c/${c.id}">${esc(c.name)}</a>` : `<a href="#/program">Программа</a>`} / ${s.module.icon} ${esc(s.module.title)}</div>
      <div class="spread">
        <h1>${esc(s.title)}</h1>
        <div class="row no-print">
          <span class="badge who">${WHO[s.who] || ""}</span>
          ${c ? `<div class="status-switch">${Object.keys(STATUS).map(k => `<button data-status="${k}" class="${d.status === k ? "on" : ""}">${STATUS[k]}</button>`).join("")}</div>` : ""}
        </div>
      </div>
      ${s.goal ? `<p class="block">${esc(fill(s.goal, c))}</p>` : ""}
      ${s.intro ? `<details class="card"><summary><b>Вступление для клиента</b></summary><p class="block">${esc(s.intro)}</p></details>` : ""}
      ${s.task ? `<div class="card"><div class="section-title">Задание</div><div class="block">${esc(fill(s.task, c))}</div></div>` : ""}
      ${s.questions && s.questions.length ? `<details class="card" open><summary class="section-title" style="display:list-item">Вспомогательные вопросы</summary><ol class="qs">${s.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></details>` : ""}
      ${s.prompt ? `<div class="card">
        <div class="spread"><div class="section-title">Промпт для нейросети</div>
          <div class="row no-print">
            <button data-act="copy-prompt" class="primary">Скопировать промпт</button>
            <a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT ↗</a>
            <a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">Claude ↗</a>
          </div></div>
        <div class="prompt" id="prompt">${esc(prompt)}</div>
        <button class="ghost small no-print" data-act="expand" style="margin-top:6px">Развернуть полностью</button>
      </div>` : ""}
      ${s.tip ? `<div class="tip no-print"><b>Совет наставнику.</b> ${esc(s.tip)}</div>` : ""}
      ${s.module.tools && s.module.steps[0].id === s.id ? toolsCard(s.module) : ""}
      ${c ? `
        <div class="card" style="margin-top:12px" id="fields">
          <div class="section-title">Ответы и результат</div>
          ${fieldsOf(s).map(f => fieldHtml(f, d.f[f.key])).join("")}
        </div>
        <div class="card no-print">
          <label for="notes" style="margin-top:0">Заметки наставника <span class="muted small">(не попадают в библию бренда)</span></label>
          <textarea id="notes" placeholder="Наблюдения, что уточнить на встрече, дедлайн…">${esc(d.notes)}</textarea>
        </div>
        <div class="row no-print"><button data-act="assign">📋 Задание клиенту (для мессенджера)</button></div>
      ` : `<p class="muted small" style="margin-top:12px">Это просмотр программы. Чтобы заполнять ответы, откройте шаг у конкретного клиента.</p>`}
      <div class="pager no-print">
        ${prev ? `<a class="btn" href="${base}${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a class="btn ${c ? "primary" : ""}" href="${base}${next.id}">${esc(next.title)} →</a>` : c ? `<a class="btn primary" href="#/c/${c.id}/book">📖 Библия бренда</a>` : ""}
      </div>`;

    app.onclick = e => {
      const a = e.target.closest("[data-act],[data-status]");
      if (!a) return;
      if (a.dataset.status && c) {
        d.status = a.dataset.status; touch(c); save(true);
        app.querySelectorAll("[data-status]").forEach(b => b.classList.toggle("on", b === a));
        return;
      }
      const act = a.dataset.act;
      if (act === "copy-prompt") copy(prompt);
      if (act === "expand") { $("#prompt").classList.toggle("open"); a.textContent = $("#prompt").classList.contains("open") ? "Свернуть" : "Развернуть полностью"; }
      if (act === "assign") copy(assignmentText(s, c));
      if (act === "add-row") {
        const f = fieldsOf(s).find(x => x.key === a.dataset.key);
        const rows = Array.isArray(d.f[f.key]) ? d.f[f.key] : [];
        rows.push(f.columns.map(() => ""));
        d.f[f.key] = rows; changed(); rerenderField(f);
      }
      if (act === "del-row") {
        const f = fieldsOf(s).find(x => x.key === a.dataset.key);
        d.f[f.key].splice(+a.dataset.r, 1); changed(); rerenderField(f);
      }
    };
    if (!c) return;

    function changed() {
      if (d.status === "todo") {
        d.status = "progress";
        app.querySelectorAll("[data-status]").forEach(b => b.classList.toggle("on", b.dataset.status === "progress"));
      }
      touch(c); save();
    }
    function rerenderField(f) {
      const el = app.querySelector(`[data-field="${f.key}"]`);
      el.outerHTML = fieldHtml(f, d.f[f.key]);
    }
    app.oninput = app.onchange = e => {
      const t = e.target;
      if (t.id === "notes") { d.notes = t.value; touch(c); save(); return; }
      if (t.dataset.key && t.dataset.r != null) {
        const rows = d.f[t.dataset.key];
        rows[+t.dataset.r][+t.dataset.c] = t.value; changed(); return;
      }
      if (t.dataset.key) { d.f[t.dataset.key] = t.value; changed(); }
    };
  }

  function toolsCard(m) {
    return `<div class="card" style="margin-top:12px"><div class="section-title">Инструменты</div>
      <div class="tbl-wrap"><table>${m.tools.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.use)}</td></tr>`).join("")}</table></div></div>`;
  }

  function fieldHtml(f, v) {
    const id = "f_" + f.key;
    const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : "";
    if (f.type === "table") {
      const rows = Array.isArray(v) && v.length ? v : [];
      return `<div data-field="${f.key}"><label>${esc(f.label)}</label>${hint}
        <div class="tbl-wrap"><table>
          <tr>${f.columns.map(col => `<th>${esc(col)}</th>`).join("")}<th></th></tr>
          ${rows.map((r, ri) => `<tr>${f.columns.map((_, ci) => `<td class="edit"><textarea rows="1" data-key="${f.key}" data-r="${ri}" data-c="${ci}" aria-label="${esc(f.columns[ci])}">${esc(r[ci])}</textarea></td>`).join("")}
            <td class="x"><button data-act="del-row" data-key="${f.key}" data-r="${ri}" title="Удалить строку">✕</button></td></tr>`).join("")}
        </table></div>
        <button class="ghost no-print" data-act="add-row" data-key="${f.key}" style="margin-top:6px">+ строка</button></div>`;
    }
    if (f.type === "select") {
      return `<div data-field="${f.key}"><label for="${id}">${esc(f.label)}</label>${hint}
        <select id="${id}" data-key="${f.key}"><option value=""></option>${f.options.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
    }
    if (f.type === "textarea") {
      return `<div data-field="${f.key}"><label for="${id}">${esc(f.label)}</label>${hint}
        <textarea id="${id}" data-key="${f.key}" class="${f.big ? "big" : ""}" placeholder="${f.big ? "Вставьте сюда итоговый ответ нейросети после правок…" : ""}">${esc(v)}</textarea></div>`;
    }
    return `<div data-field="${f.key}"><label for="${id}">${esc(f.label)}</label>${hint}
      <input type="text" id="${id}" data-key="${f.key}" value="${esc(v)}"></div>`;
  }

  // ---------- views: brand book ----------
  function bookSections(c) {
    return activeModules(c).map(m => ({
      m,
      steps: m.steps.map(s => {
        const d = (c.data || {})[s.id];
        if (!d) return null;
        const vals = fieldsOf(s).filter(f => hasValue(d.f[f.key])).map(f => ({ f, v: d.f[f.key] }));
        return vals.length ? { s, vals } : null;
      }).filter(Boolean)
    })).filter(x => x.steps.length);
  }

  function viewBook(c) {
    const secs = bookSections(c);
    const html = secs.map(({ m, steps }) => `<h2>${m.icon} ${esc(m.title)}</h2>` + steps.map(({ s, vals }) =>
      `<h3>${esc(s.title)}</h3>` + vals.map(({ f, v }) => {
        const lbl = vals.length > 1 || f.key !== "result" ? `<div class="section-title" style="margin-top:8px">${esc(f.label)}</div>` : "";
        if (Array.isArray(v)) return lbl + `<div class="tbl-wrap"><table><tr>${f.columns.map(x => `<th>${esc(x)}</th>`).join("")}</tr>${v.filter(r => r.some(x => String(x).trim())).map(r => `<tr>${f.columns.map((_, i) => `<td>${esc(r[i])}</td>`).join("")}</tr>`).join("")}</table></div>`;
        return lbl + `<div class="block">${esc(v)}</div>`;
      }).join("")).join("")).join("");
    app.innerHTML = `
      <div class="crumbs no-print"><a href="#/">Клиенты</a> / <a href="#/c/${c.id}">${esc(c.name)}</a></div>
      <div class="spread">
        <div><h1>Библия бренда: ${esc(c.name)}</h1><div class="muted small">Собрано из всех заполненных шагов · ${fmtDate(Date.now())}</div></div>
        <div class="row no-print">
          <button data-act="print" class="primary">Сохранить в PDF / печать</button>
          <button data-act="md">Скачать .md</button>
          <button data-act="copy">Скопировать текст</button>
        </div>
      </div>
      <div class="card book">${html || `<p class="muted">Пока пусто — заполните шаги программы, и здесь соберётся документ.</p>`}</div>`;
    app.onclick = e => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "print") window.print();
      if (a.dataset.act === "md") download(`brand-book-${slug(c.name)}.md`, bookMarkdown(c, secs));
      if (a.dataset.act === "copy") copy(bookMarkdown(c, secs));
    };
  }

  function bookMarkdown(c, secs) {
    const out = [`# Библия бренда: ${c.name}`, ""];
    secs.forEach(({ m, steps }) => {
      out.push(`## ${m.title}`, "");
      steps.forEach(({ s, vals }) => {
        out.push(`### ${s.title}`, "");
        vals.forEach(({ f, v }) => {
          if (vals.length > 1 || f.key !== "result") out.push(`**${f.label}**`, "");
          if (Array.isArray(v)) {
            const cell = x => String(x || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
            out.push(`| ${f.columns.join(" | ")} |`, `|${f.columns.map(() => "---").join("|")}|`);
            v.filter(r => r.some(x => String(x).trim())).forEach(r => out.push(`| ${f.columns.map((_, i) => cell(r[i])).join(" | ")} |`));
            out.push("");
          } else out.push(String(v).trim(), "");
        });
      });
    });
    return out.join("\n");
  }

  // ---------- views: program & guide ----------
  function viewProgram() {
    const total = STEPS.length;
    app.innerHTML = `
      <h1>Программа</h1>
      <p class="muted">${MODULES.length} блоков, ${total} шагов. Здесь можно посмотреть все промпты и задания без привязки к клиенту.</p>
      ${MODULES.map(m => `<section class="card module">
        <h2>${m.icon} ${esc(m.title)}</h2>
        <div class="muted small">${esc(m.about)}</div>
        <ul class="steps">${m.steps.map(s => `<li><a href="#/program/s/${s.id}"><span>${esc(s.title)}</span><span class="badge who">${WHO[s.who] || ""}</span></a></li>`).join("")}</ul>
        ${m.outro ? `<details><summary class="small muted">Завершение блока</summary><p class="block small">${esc(m.outro)}</p></details>` : ""}
      </section>`).join("")}`;
    app.onclick = app.oninput = app.onchange = null;
  }

  function viewGuide() {
    app.innerHTML = `
      <h1>Методика наставника</h1>
      <p class="muted">Как вести клиента по программе: форматы, карта недель, структура встречи, контрольные точки и частые ошибки.</p>
      ${window.GUIDE.map((g, i) => `<details class="card" ${i === 0 ? "open" : ""}><summary><b>${esc(g.title)}</b></summary><div class="guide">${g.html}</div></details>`).join("")}`;
    app.onclick = app.oninput = app.onchange = null;
  }

  render();
})();
