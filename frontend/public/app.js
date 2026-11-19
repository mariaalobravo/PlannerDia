// Mi Día — lógica del frontend (JavaScript sin librerías)
const $ = (s) => document.querySelector(s);
const COLORS = 10;

const state = {
  date: localISO(new Date()),
  day: { blocks: [], tasks: [], note: "", meetings: [] },
  backlog: [],
  projects: [],
  freshId: null,
};

// ---------- utilidades ----------
function localISO(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localISO(d);
}
const today = () => localISO(new Date());
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toTime = (min) => {
  min = Math.max(0, Math.min(min, 23 * 60 + 59));
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
};
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
function fmtDur(m) {
  if (m <= 0) return "";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}
function shortDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
}
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else if (k in e && k !== "list") e[k] = v;
    else e.setAttribute(k, v);
  }
  kids.flat().forEach((k) => k != null && e.append(k));
  return e;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3200);
}

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const saveDay = debounce(() => {
  const { blocks, tasks, note, meetings } = state.day;
  api(`/day/${state.date}`, { method: "PUT", body: { blocks, tasks, note, meetings } })
    .then(loadWeek)
    .catch((e) => toast("⚠ No se pudo guardar: " + e.message));
}, 300);
const saveBacklog = debounce(() => {
  api("/backlog", { method: "PUT", body: { items: state.backlog } }).catch((e) => toast("⚠ " + e.message));
}, 300);
const saveProjects = debounce(() => {
  api("/projects", { method: "PUT", body: { items: state.projects } }).catch((e) => toast("⚠ " + e.message));
}, 300);

// ---------- proyectos ----------
const projById = (id) => (id ? state.projects.find((p) => p.id === id) : null);
// color de un elemento: el de su proyecto si lo tiene; si no, el suyo propio
const colorOf = (it) => projById(it.project)?.color ?? it.color ?? 0;
function nextProjectColor() {
  const used = new Set(state.projects.map((p) => p.color));
  for (let c = 0; c < COLORS; c++) if (c !== 5 && !used.has(c)) return c;
  return state.projects.length % COLORS;
}
function addProject() {
  const p = { id: uid(), name: "Nuevo proyecto", color: nextProjectColor(), collapsed: false };
  state.projects.push(p);
  saveProjects();
  render();
  const inp = document.querySelector(`.group[data-project="${p.id}"] .gname`);
  if (inp) { inp.focus(); inp.select(); }
}
function deleteProject(p) {
  const n = state.backlog.filter((b) => b.project === p.id).length;
  if (n && !confirm(`¿Borrar el proyecto "${p.name}"?\nSus ${n} cosa${n > 1 ? "s" : ""} pasarán a "Sin proyecto".`)) return;
  state.backlog.forEach((b) => { if (b.project === p.id) b.project = null; });
  state.projects = state.projects.filter((x) => x !== p);
  saveProjects();
  saveBacklog();
  render();
}

async function loadDay(date) {
  state.date = date;
  try {
    const d = await api(`/day/${date}`);
    state.day = { blocks: d.blocks || [], tasks: d.tasks || [], note: d.note || "", meetings: d.meetings || [] };
    // la "lista del día" ya no existe: lo que quedara pendiente pasa a la lista general
    const pending = state.day.tasks.filter((t) => !t.done);
    if (pending.length) {
      pending.forEach((t) => state.backlog.push({ id: t.id, text: t.text, project: t.project || null }));
      state.day.tasks = state.day.tasks.filter((t) => t.done);
      saveDay();
      saveBacklog();
      toast(`${pending.length} tarea${pending.length > 1 ? "s" : ""} pendiente${pending.length > 1 ? "s" : ""} pasaron a la lista general`);
    }
  } catch (e) {
    toast("⚠ " + e.message);
  }
  render();
  loadWeek();
}
async function loadWeek() {
  try {
    const end = state.date > today() ? state.date : today();
    renderWeek(await api(`/summary?end=${end}&days=7`));
  } catch { /* sin backend: no pasa nada */ }
}

// ---------- lógica de horario ----------
function sortBlocks() { state.day.blocks.sort((a, b) => a.time.localeCompare(b.time)); }
function suggestTime() {
  const b = state.day.blocks;
  if (b.length) return toTime(toMin(b[b.length - 1].time) + 60);
  if (state.date === today()) return toTime(Math.ceil((nowMin() + 1) / 30) * 30);
  return "09:00";
}
function parseQuick(str) {
  // "9:30 Reunión", "14 Comer", "8h Gym", "Gimnasio"
  const m = str.trim().match(/^(\d{1,2})(?:[:.h](\d{2})?)?\s+(.+)$/);
  if (m && +m[1] < 24) return { time: toTime(+m[1] * 60 + +(m[2] || 0)), text: m[3] };
  return { time: suggestTime(), text: str.trim() };
}
function addBlock(text, time = suggestTime(), color = state.day.blocks.length % COLORS, project = null) {
  const b = { id: uid(), time, text, color, project };
  state.day.blocks.push(b);
  sortBlocks();
  state.freshId = b.id;
  saveDay();
  render();
  return b;
}
function currentBlockId() {
  if (state.date !== today()) return null;
  const n = nowMin();
  let cur = null;
  for (const b of state.day.blocks) if (toMin(b.time) <= n) cur = b.id;
  return cur;
}

// ---------- reuniones ----------
function addMeeting() {
  const m = { id: uid(), title: "", project: null, text: "", actions: [], collapsed: false };
  state.day.meetings.push(m);
  saveDay();
  render();
  document.querySelector(`.meeting[data-mid="${m.id}"] .mtitle`)?.focus();
}
function deleteMeeting(m) {
  if ((m.text.trim() || m.actions.length) &&
      !confirm(`¿Borrar la reunión "${m.title || "sin título"}" con sus apuntes?`)) return;
  state.day.meetings = state.day.meetings.filter((x) => x !== m);
  saveDay();
  render();
}
function addAction(m, text) {
  m.actions.push({ id: uid(), text, project: m.project || null });
}
// crea actividades con el texto seleccionado (una por línea) o, si no hay selección, con la línea del cursor
function actionsFromNotes(m, ta) {
  const v = ta.value;
  let txt = v.slice(ta.selectionStart, ta.selectionEnd);
  if (!txt.trim()) {
    const p = ta.selectionStart, end = v.indexOf("\n", p);
    txt = v.slice(v.lastIndexOf("\n", p - 1) + 1, end < 0 ? v.length : end);
  }
  const lines = txt.split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•·>]|\d+[.)]|\[ ?\])\s*/, "").trim())
    .filter(Boolean);
  if (!lines.length) return toast("Selecciona en los apuntes el texto de la actividad");
  lines.forEach((t) => addAction(m, t));
  saveDay();
  render();
  toast(lines.length > 1 ? `✚ ${lines.length} actividades creadas` : `✚ Actividad: ${lines[0]}`);
}

// pasa una tarea (de la lista general o del día) al horario, conservando su proyecto
function toBlock(it, time) {
  return addBlock(it.text, time || suggestTime(), it.project ? colorOf(it) : undefined, it.project || null);
}

// ---------- arrastrar y soltar ----------
let drag = null; // { kind: 'block'|'task'|'backlog'|'action', id }

function takeItem(kind, id) {
  if (kind === "action") {
    for (const m of state.day.meetings) {
      const i = m.actions.findIndex((a) => a.id === id);
      if (i >= 0) return m.actions.splice(i, 1)[0];
    }
    return null;
  }
  const arr = kind === "block" ? state.day.blocks : kind === "task" ? state.day.tasks : state.backlog;
  const i = arr.findIndex((x) => x.id === id);
  return i >= 0 ? arr.splice(i, 1)[0] : null;
}
// opts: beforeId (insertar antes de), project (grupo destino en la lista general), time (hora en el horario)
function moveTo(zone, { beforeId, project, time } = {}) {
  if (!drag) return;
  const { kind, id } = drag;
  if (zone === "timeline") {
    if (kind === "block") {
      const b = state.day.blocks.find((x) => x.id === id);
      if (b && time) { b.time = time; sortBlocks(); state.freshId = b.id; saveDay(); render(); }
      return;
    }
    const it = takeItem(kind, id);
    if (it) toBlock(it, time);
    if (kind === "backlog") saveBacklog();
    return;
  }
  const target = zone === "tasks" ? state.day.tasks : state.backlog;
  const it = takeItem(kind, id);
  if (!it) return;
  const item = zone === "tasks"
    ? { id: it.id, text: it.text, done: false, since: it.since || state.date, carried: it.carried || false, project: it.project || null }
    : { id: it.id, text: it.text, project: project !== undefined ? project : it.project || null };
  const idx = beforeId ? target.findIndex((x) => x.id === beforeId) : -1;
  idx >= 0 ? target.splice(idx, 0, item) : target.push(item);
  if (kind !== "backlog" || zone !== "backlog") saveDay();
  if (kind === "backlog" || zone === "backlog") saveBacklog();
  render();
}
function swapBlocks(aId, bId) {
  const a = state.day.blocks.find((x) => x.id === aId), b = state.day.blocks.find((x) => x.id === bId);
  if (!a || !b || a === b) return;
  [a.text, b.text] = [b.text, a.text];
  [a.color, b.color] = [b.color, a.color];
  [a.project, b.project] = [b.project, a.project];
  saveDay();
  render();
}
function makeDraggable(node, kind, id) {
  node.draggable = true;
  node.addEventListener("dragstart", (e) => {
    drag = { kind, id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    requestAnimationFrame(() => { node.classList.add("dragging"); showSlots(); });
  });
  node.addEventListener("dragend", () => { node.classList.remove("dragging"); endDrag(); });
}
function endDrag() {
  drag = null;
  hideSlots();
  clearHints();
  document.querySelectorAll(".drop-zone-on").forEach((n) => n.classList.remove("drop-zone-on"));
}
function clearHints() {
  document.querySelectorAll(".drop-before,.drop-swap").forEach((n) => n.classList.remove("drop-before", "drop-swap"));
  document.querySelectorAll(".slot-on").forEach((s) => {
    s.classList.remove("slot-on");
    s.querySelector(".slot-time").textContent = toTime(+s.dataset.hour * 60);
  });
}

// mientras se arrastra, el horario enseña las horas para soltar justo ahí
function showSlots() {
  const ol = $("#timeline");
  if (!drag || ol.querySelector(".slot")) return;
  const lis = [...ol.querySelectorAll(".block")];
  const hours = state.day.blocks.map((b) => Math.floor(toMin(b.time) / 60));
  const start = Math.min(7, ...hours), end = Math.max(22, ...hours);
  for (let h = start; h <= end; h++) {
    const slot = el("li", { className: "slot", "data-hour": h },
      el("span", { className: "slot-time" }, toTime(h * 60)),
      el("span", { className: "slot-line" }));
    ol.insertBefore(slot, lis.find((li) => toMin(li.dataset.time) >= h * 60) || null);
  }
  $("#timelineEmpty").style.display = "none";
}
function hideSlots() {
  document.querySelectorAll("#timeline .slot").forEach((s) => s.remove());
  $("#timelineEmpty").style.display = state.day.blocks.length ? "none" : "block";
}
function slotTime(slot, e) {
  const r = slot.getBoundingClientRect();
  return toTime(+slot.dataset.hour * 60 + (e.clientY - r.top > r.height / 2 ? 30 : 0));
}
function setupZone(zoneEl) {
  const zone = zoneEl.dataset.zone;
  zoneEl.addEventListener("dragover", (e) => {
    if (!drag) return;
    e.preventDefault();
    clearHints();
    const over = e.target.closest("[data-id]");
    const slot = e.target.closest(".slot");
    if (zone === "timeline" && slot) {
      slot.classList.add("slot-on");
      slot.querySelector(".slot-time").textContent = slotTime(slot, e);
    } else if (zone === "timeline" && drag.kind === "block") {
      if (over && over.dataset.id !== drag.id) over.classList.add("drop-swap");
    } else if (zone === "backlog") {
      const grp = e.target.closest(".group") || zoneEl;
      document.querySelectorAll(".drop-zone-on").forEach((n) => n !== grp && n.classList.remove("drop-zone-on"));
      grp.classList.add("drop-zone-on");
      if (over) over.classList.add("drop-before");
    } else {
      zoneEl.classList.add("drop-zone-on");
      if (over && zone !== "timeline") over.classList.add("drop-before");
    }
  });
  zoneEl.addEventListener("dragleave", (e) => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("drop-zone-on");
  });
  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    zoneEl.classList.remove("drop-zone-on");
    const over = e.target.closest("[data-id]");
    const slot = e.target.closest(".slot");
    const grp = e.target.closest(".group");
    if (zone === "timeline" && slot) {
      moveTo(zone, { time: slotTime(slot, e) });
    } else if (zone === "timeline" && drag?.kind === "block") {
      if (over) swapBlocks(drag.id, over.dataset.id);
    } else {
      moveTo(zone, { beforeId: over?.dataset.id, project: grp ? grp.dataset.project || null : undefined });
    }
    endDrag();
  });
}

// ---------- pintar ----------
function render() {
  renderHeader();
  renderTimeline();
  renderMeetings();
  renderBacklog();
}

function renderHeader() {
  const d = new Date(state.date + "T12:00:00");
  $("#dateLabel").textContent = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const diff = Math.round((d - new Date(today() + "T12:00:00")) / 86400000);
  $("#dateSub").textContent =
    diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : diff === -1 ? "Ayer" : diff > 0 ? `Dentro de ${diff} días` : `Hace ${-diff} días`;
  $("#todayBtn").style.visibility = diff === 0 ? "hidden" : "visible";
}

function renderWeek(days) {
  const L = ["D", "L", "M", "X", "J", "V", "S"];
  $("#week").replaceChildren(
    ...days.map((d) => {
      const pct = Math.min(100, Math.round((d.blocks / 8) * 100));
      return el("button", {
          className: "d" + (d.date === state.date ? " sel" : ""),
          title: `${shortDate(d.date)} · ${d.blocks} actividades · ${d.meetings || 0} reuniones`,
          onclick: () => loadDay(d.date),
        },
        el("div", { className: "bar" }, el("i", { style: `height:${pct}%` })),
        L[new Date(d.date + "T12:00:00").getDay()]
      );
    })
  );
}

function renderTimeline() {
  const ol = $("#timeline");
  const blocks = state.day.blocks;
  const cur = currentBlockId();
  const isToday = state.date === today(), isPast = state.date < today();
  $("#timelineEmpty").style.display = blocks.length ? "none" : "block";
  $("#copyYesterday").style.display = blocks.length ? "none" : "inline";

  ol.replaceChildren(
    ...blocks.map((b, i) => {
      const next = blocks[i + 1];
      const dur = next ? toMin(next.time) - toMin(b.time) : 0;
      const past = isPast || (isToday && b.id !== cur && next && toMin(next.time) <= nowMin());
      const li = el("li", {
        className: "block" + (b.id === cur ? " now" : "") + (past ? " past" : "") + (b.id === state.freshId ? " fresh" : ""),
        "data-id": b.id,
        "data-time": b.time,
        style: `--c: var(--c${colorOf(b)})`,
      });
      const proj = projById(b.project);
      const time = el("input", {
        type: "time", className: "time", value: b.time,
        onchange: (e) => { if (e.target.value) { b.time = e.target.value; sortBlocks(); saveDay(); render(); } },
      });
      const txt = el("input", {
        className: "txt", value: b.text, placeholder: "¿Qué toca?",
        oninput: (e) => { b.text = e.target.value; saveDay(); },
        onkeydown: (e) => e.key === "Enter" && e.target.blur(),
      });
      const body = el("div", { className: "body" },
        proj
          ? el("span", { className: "dot", title: "Proyecto: " + proj.name })
          : el("button", { className: "dot", title: "Cambiar color", onclick: () => { b.color = ((b.color ?? 0) + 1) % COLORS; saveDay(); render(); } }),
        txt,
        proj ? el("span", { className: "tag" }, proj.name) : null,
        el("span", { className: "dur" }, fmtDur(dur)),
        el("button", { className: "icon", title: "Devolver a la lista general", onclick: () => { drag = { kind: "block", id: b.id }; moveTo("backlog"); drag = null; } }, "↩"),
        el("button", { className: "icon", title: "Borrar", onclick: () => { takeItem("block", b.id); saveDay(); render(); } }, "×")
      );
      makeDraggable(body, "block", b.id);
      li.append(time, body);
      return li;
    })
  );
  state.freshId = null;
}

// desplegable de proyecto (para reuniones y actividades)
function projSelect(value, onchange, extra = "") {
  const p = projById(value);
  return el("select", {
      className: "psel " + extra + (p ? " on" : ""),
      title: "Proyecto",
      style: p ? `--c: var(--c${p.color})` : "",
      onchange: (e) => onchange(e.target.value || null),
    },
    el("option", { value: "", selected: !p }, "Sin proyecto"),
    ...state.projects.map((x) => el("option", { value: x.id, selected: x.id === value }, x.name || "(sin nombre)")));
}

function renderMeetings() {
  const ms = state.day.meetings;
  $("#meetingsEmpty").style.display = ms.length ? "none" : "block";
  $("#meetings").replaceChildren(...ms.map(meetingCard));
}

function meetingCard(m) {
  const proj = projById(m.project);
  const head = el("div", { className: "mhead" },
    el("button", { className: "caret", title: m.collapsed ? "Desplegar" : "Plegar",
      onclick: () => { m.collapsed = !m.collapsed; saveDay(); render(); } }, m.collapsed ? "▸" : "▾"),
    el("input", { className: "mtitle", value: m.title, placeholder: "Título de la reunión",
      oninput: (e) => { m.title = e.target.value; saveDay(); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); card.querySelector(".notes")?.focus(); } } }),
    m.collapsed && m.actions.length ? el("span", { className: "count" }, `${m.actions.length} act.`) : null,
    projSelect(m.project, (v) => {
      // las actividades que seguían el proyecto de la reunión lo siguen siguiendo
      m.actions.forEach((a) => { if ((a.project || null) === (m.project || null)) a.project = v; });
      m.project = v;
      saveDay();
      render();
    }),
    el("button", { className: "icon", title: "Borrar reunión", onclick: () => deleteMeeting(m) }, "×")
  );
  const card = el("div", { className: "meeting" + (m.collapsed ? " collapsed" : "") + (proj ? " proj" : ""),
    "data-mid": m.id, style: proj ? `--c: var(--c${proj.color})` : "" }, head);
  if (m.collapsed) return card;

  const notes = el("textarea", { className: "notes", value: m.text,
    placeholder: "Apuntes…\n- Cada línea puede convertirse en una actividad",
    oninput: (e) => { m.text = e.target.value; saveDay(); },
    onkeydown: (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); actionsFromNotes(m, notes); } } });
  const extract = el("button", { className: "pill small", title: "Crear actividad con el texto seleccionado o la línea del cursor (Ctrl+Enter)",
    onmousedown: (e) => e.preventDefault(), // mantiene la selección del texto
    onclick: () => actionsFromNotes(m, notes) }, "✚ Actividad");

  const list = el("ul", { className: "list actions" }, ...m.actions.map((a) => actionItem(m, a)));
  const form = el("form", { className: "add sub",
      onsubmit: (e) => {
        e.preventDefault();
        const v = e.target.querySelector("input").value.trim();
        if (!v) return;
        addAction(m, v);
        saveDay();
        render();
        document.querySelector(`.meeting[data-mid="${m.id}"] .sub input`)?.focus();
      } },
    el("input", { placeholder: "Nueva actividad…", autocomplete: "off" }));

  card.append(notes,
    el("div", { className: "row-between mbar" },
      el("span", { className: "hint small" }, m.actions.length ? "Actividades que salen:" : "Aún no salen actividades"),
      extract),
    list, form);
  return card;
}

function actionItem(m, a) {
  const ap = projById(a.project);
  const li = el("li", { className: "item" + (ap ? " proj" : ""), "data-id": a.id, style: ap ? `--c: var(--c${ap.color})` : "" },
    ap ? null : el("span", { style: "color:var(--muted)" }, "•"),
    el("input", { className: "txt", value: a.text, oninput: (e) => { a.text = e.target.value; saveDay(); },
      onkeydown: (e) => e.key === "Enter" && e.target.blur() }),
    projSelect(a.project, (v) => { a.project = v; saveDay(); render(); }, "mini"),
    el("button", { className: "icon", title: "Poner en el horario", onclick: () => { takeItem("action", a.id); toBlock(a); } }, "◷"),
    el("button", { className: "icon", title: "Mandar a la lista general", onclick: () => {
      drag = { kind: "action", id: a.id }; moveTo("backlog"); drag = null;
      toast(`→ En la lista general${ap ? " · " + ap.name : ""}`);
    } }, "→"),
    el("button", { className: "icon", title: "Borrar", onclick: () => { takeItem("action", a.id); saveDay(); render(); } }, "×")
  );
  makeDraggable(li, "action", a.id);
  return li;
}

function renderBacklog() {
  $("#backlogCount").textContent = state.backlog.length ? `· ${state.backlog.length}` : "";
  const loose = state.backlog.filter((b) => !projById(b.project));
  // sin proyectos: lista plana como siempre
  if (!state.projects.length) {
    $("#backlogList").replaceChildren(...loose.map(backlogItem));
    return;
  }
  $("#backlogList").replaceChildren(
    ...state.projects.map((p) => projectGroup(p, state.backlog.filter((b) => b.project === p.id))),
    projectGroup(null, loose)
  );
}

function backlogItem(b) {
  const proj = projById(b.project);
  const li = el("li", { "data-id": b.id, className: proj ? "item proj" : "item",
      style: proj ? `--c: var(--c${proj.color})` : "" },
    proj ? null : el("span", { style: "color:var(--muted)" }, "•"),
    el("input", { className: "txt", value: b.text, oninput: (e) => { b.text = e.target.value; saveBacklog(); },
      onkeydown: (e) => e.key === "Enter" && e.target.blur() }),
    el("button", { className: "icon", title: "Poner en el horario", onclick: () => { takeItem("backlog", b.id); saveBacklog(); toBlock(b); } }, "◷"),
    el("button", { className: "icon", title: "Borrar", onclick: () => { takeItem("backlog", b.id); saveBacklog(); render(); } }, "×")
  );
  makeDraggable(li, "backlog", b.id);
  return li;
}

function projectGroup(p, items) {
  const collapsed = p?.collapsed;
  const head = el("div", { className: "group-head" },
    p ? el("button", { className: "caret", title: collapsed ? "Desplegar" : "Plegar",
      onclick: () => { p.collapsed = !p.collapsed; saveProjects(); render(); } }, collapsed ? "▸" : "▾") : null,
    p ? el("button", { className: "dot", title: "Cambiar color", onclick: () => { p.color = (p.color + 1) % COLORS; saveProjects(); render(); } }) : null,
    p
      ? el("input", { className: "gname", value: p.name, placeholder: "Nombre del proyecto",
          oninput: (e) => { p.name = e.target.value; saveProjects(); },
          onchange: () => render(),
          onkeydown: (e) => e.key === "Enter" && e.target.blur() })
      : el("span", { className: "gname loose" }, "Sin proyecto"),
    el("span", { className: "count" }, items.length || ""),
    p ? el("button", { className: "icon", title: "Borrar proyecto", onclick: () => deleteProject(p) }, "×") : null
  );
  const form = p && !collapsed ? el("form", { className: "add sub",
      onsubmit: (e) => {
        e.preventDefault();
        const v = e.target.querySelector("input").value.trim();
        if (!v) return;
        state.backlog.push({ id: uid(), text: v, project: p.id });
        saveBacklog();
        render();
        document.querySelector(`.group[data-project="${p.id}"] .sub input`)?.focus();
      } },
    el("input", { placeholder: `Añadir a ${p.name || "este proyecto"}…`, autocomplete: "off" })) : null;
  return el("li", { className: "group" + (p ? "" : " loose") + (collapsed ? " collapsed" : ""),
      "data-project": p ? p.id : "", style: p ? `--c: var(--c${p.color})` : "" },
    head,
    collapsed ? null : el("ul", { className: "items" }, ...items.map(backlogItem)),
    form);
}

// ---------- eventos ----------
$("#blockForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#blockInput").value;
  if (!v.trim()) return;
  const { time, text } = parseQuick(v);
  addBlock(text, time);
  $("#blockInput").value = "";
});
$("#backlogForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#backlogInput").value.trim();
  if (!v) return;
  state.backlog.push({ id: uid(), text: v, project: null });
  $("#backlogInput").value = "";
  saveBacklog();
  render();
});
$("#newProject").onclick = addProject;
$("#newMeeting").onclick = addMeeting;
$("#prev").onclick = () => loadDay(addDays(state.date, -1));
$("#next").onclick = () => loadDay(addDays(state.date, 1));
$("#todayBtn").onclick = () => loadDay(today());
$("#copyYesterday").onclick = async () => {
  const y = await api(`/day/${addDays(state.date, -1)}`);
  if (!y.blocks?.length) return toast("El día anterior no tenía horario");
  state.day.blocks = y.blocks.map((b) => ({ ...b, id: uid() }));
  saveDay();
  render();
  toast(`Copiadas ${y.blocks.length} actividades`);
};
document.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") $("#prev").click();
  else if (e.key === "ArrowRight") $("#next").click();
  else if (e.key.toLowerCase() === "t") loadDay(today());
  else if (e.key === "n") { e.preventDefault(); $("#blockInput").focus(); }
  else if (e.key === "r") { e.preventDefault(); addMeeting(); }
});
document.querySelectorAll("[data-zone]").forEach(setupZone);

// refresca el indicador "AHORA" cada minuto
setInterval(() => state.date === today() && renderTimeline(), 60000);

// ---------- arranque ----------
(async () => {
  try {
    [state.backlog, state.projects] = await Promise.all([api("/backlog"), api("/projects")]);
  } catch { toast("⚠ No conecto con el backend de Python"); }
  loadDay(today());
})();
