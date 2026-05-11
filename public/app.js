const el = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  logoutBtn: document.querySelector("#logoutBtn"),
  meLabel: document.querySelector("#meLabel"),

  loginForm: document.querySelector("#loginForm"),
  loginMsg: document.querySelector("#loginMsg"),
  registerForm: document.querySelector("#registerForm"),
  registerMsg: document.querySelector("#registerMsg"),

  templatesList: document.querySelector("#templatesList"),
  reloadTemplatesBtn: document.querySelector("#reloadTemplatesBtn"),
  searchInput: document.querySelector("#searchInput"),
  newTemplateBtn: document.querySelector("#newTemplateBtn"),

  adminPanel: document.querySelector("#adminPanel"),
  reloadPendingBtn: document.querySelector("#reloadPendingBtn"),
  pendingList: document.querySelector("#pendingList"),

  editorTitle: document.querySelector("#editorTitle"),
  editorMeta: document.querySelector("#editorMeta"),
  saveBtn: document.querySelector("#saveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  requestPublishBtn: document.querySelector("#requestPublishBtn"),

  labelWidthMm: document.querySelector("#labelWidthMm"),
  labelHeightMm: document.querySelector("#labelHeightMm"),
  labelOffsetXMm: document.querySelector("#labelOffsetXMm"),
  labelOffsetYMm: document.querySelector("#labelOffsetYMm"),
  zoom: document.querySelector("#zoom"),

  addTextBtn: document.querySelector("#addTextBtn"),
  addBoxBtn: document.querySelector("#addBoxBtn"),
  addQrBtn: document.querySelector("#addQrBtn"),

  canvasWrap: document.querySelector(".canvas-wrap"),
  canvas: document.querySelector("#canvas"),
  propsEmpty: document.querySelector("#propsEmpty"),
  propsForm: document.querySelector("#propsForm"),
  deleteObjBtn: document.querySelector("#deleteObjBtn"),
};

const state = {
  me: null,
  templates: [],
  current: null,
  selectedId: null,
  drag: null,
  zoom: 1,
  zoomAuto: true,
  cameraX: 0,
  cameraY: 0,
  panDrag: null,
};

function mmToDots(mm, dpi) {
  return (Number(mm) / 25.4) * Number(dpi);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const message = data?.error || `Erro (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function setAuthMode(isAuthed) {
  el.authView.classList.toggle("hidden", isAuthed);
  el.appView.classList.toggle("hidden", !isAuthed);
  el.logoutBtn.classList.toggle("hidden", !isAuthed);
}

function setMessage(target, msg) {
  target.textContent = msg || "";
}

function renderMe() {
  if (!state.me) {
    el.meLabel.textContent = "";
    return;
  }
  el.meLabel.textContent = `${state.me.email} (${state.me.role}) — ${state.me.storeId}`;
  el.adminPanel.classList.toggle("hidden", state.me.role !== "admin");
}

async function refreshMe() {
  try {
    const { user } = await api("/api/me");
    state.me = user;
    setAuthMode(true);
    renderMe();
  } catch {
    state.me = null;
    setAuthMode(false);
    renderMe();
  }
}

function enableEditor(isEnabled) {
  el.saveBtn.disabled = !isEnabled;
  el.addTextBtn.disabled = !isEnabled;
  el.addBoxBtn.disabled = !isEnabled;
  el.addQrBtn.disabled = !isEnabled;
  el.deleteObjBtn.disabled = !isEnabled;
  el.exportBtn.classList.toggle("disabled", !isEnabled);
}

function renderTemplates() {
  const q = el.searchInput.value.trim().toLowerCase();
  const filtered = state.templates.filter((t) => {
    if (!q) return true;
    return String(t.name ?? "").toLowerCase().includes(q);
  });

  el.templatesList.innerHTML = "";
  if (filtered.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "Nenhum modelo";
    el.templatesList.appendChild(div);
    return;
  }

  for (const t of filtered) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.addEventListener("click", () => openTemplate(t.id));

    const top = document.createElement("div");
    top.className = "row row-between";
    const name = document.createElement("strong");
    name.textContent = t.name;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = t.visibility === "public" ? "público" : "privado";
    top.appendChild(name);
    top.appendChild(pill);

    const meta = document.createElement("div");
    meta.className = "muted";
    const label = t.label || {};
    meta.textContent = `${label.widthMm ?? "?"}x${label.heightMm ?? "?"}mm @ ${label.dpi ?? "?"}dpi` + (t.publishStatus === "pending" ? " — pendente" : "");

    item.appendChild(top);
    item.appendChild(meta);
    el.templatesList.appendChild(item);
  }
}

async function loadTemplates() {
  const { templates } = await api("/api/templates");
  state.templates = templates || [];
  renderTemplates();
}

async function openTemplate(id) {
  const { template } = await api(`/api/templates/${encodeURIComponent(id)}`);
  state.current = template;
  state.current.label = { ...(state.current.label || {}), dpi: 203 };
  state.selectedId = null;
  state.zoomAuto = true;
  enableEditor(true);
  renderCurrentHeader();
  syncLabelInputsFromCurrent();
  updateExportLink();
  renderProperties();
  resizeCanvasToLabel();
  draw();
}

function renderCurrentHeader() {
  const t = state.current;
  if (!t) return;
  el.editorTitle.textContent = t.name || "Editor";
  const v = t.visibility === "public" ? "público" : "privado";
  const p = t.publishStatus === "pending" ? "pendente" : t.publishStatus === "approved" ? "aprovado" : "";
  el.editorMeta.textContent = [v, p].filter(Boolean).join(" — ");

  const canRequestPublish = state.me?.role !== "admin" && t.visibility !== "public" && t.publishStatus !== "pending";
  el.requestPublishBtn.classList.toggle("hidden", !canRequestPublish);
}

function syncLabelInputsFromCurrent() {
  const label = state.current?.label || {};
  el.labelWidthMm.value = String(label.widthMm ?? 50);
  el.labelHeightMm.value = String(label.heightMm ?? 30);
  el.labelOffsetXMm.value = String(label.offsetXMm ?? 0);
  el.labelOffsetYMm.value = String(label.offsetYMm ?? 0);
  el.zoom.value = String(state.zoom);
}

function syncCurrentFromLabelInputs() {
  if (!state.current) return;
  const widthMm = Number(el.labelWidthMm.value);
  const heightMm = Number(el.labelHeightMm.value);
  const offsetXMm = Number(el.labelOffsetXMm.value || 0);
  const offsetYMm = Number(el.labelOffsetYMm.value || 0);
  state.zoom = clamp(Number(el.zoom.value || 1), 0.1, 8);
  state.current.label = {
    widthMm: clamp(widthMm, 5, 300),
    heightMm: clamp(heightMm, 5, 300),
    dpi: 203,
    offsetXMm: clamp(offsetXMm, -50, 50),
    offsetYMm: clamp(offsetYMm, -50, 50),
  };
}

function updateExportLink() {
  if (!state.current?.id) {
    el.exportBtn.href = "#";
    el.exportBtn.classList.add("disabled");
    return;
  }
  el.exportBtn.href = `/api/templates/${encodeURIComponent(state.current.id)}/export.zpl`;
  el.exportBtn.download = `${state.current.name || "modelo"}.zpl`;
  el.exportBtn.classList.remove("disabled");
}

function zplMmToDots(mm, dpi) {
  return Math.round(mmToDots(mm, dpi));
}

function bytesToZplFieldData(bytes) {
  let out = "";
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    const isPrintable = b >= 32 && b <= 126;
    const needsEscape = ch === "\\" || ch === "^" || ch === "~";
    if (isPrintable && !needsEscape) out += ch;
    else out += `\\${b.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return `^FH\\^FD${out}^FS`;
}

function zplText(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  return bytesToZplFieldData(bytes);
}

function zplRotationToOrientation(rotationDeg) {
  const r = Number(rotationDeg);
  if (r === 90) return "R";
  if (r === 180) return "I";
  if (r === 270) return "B";
  return "N";
}

function zplJustification(align) {
  const a = String(align || "").toLowerCase();
  if (a === "center") return "C";
  if (a === "right") return "R";
  return "L";
}

function generateZplForTemplateDraft(template) {
  const dpi = 203;
  const widthDots = zplMmToDots(template.label?.widthMm ?? 50, dpi);
  const heightDots = zplMmToDots(template.label?.heightMm ?? 30, dpi);
  const offsetXDots = zplMmToDots(template.label?.offsetXMm ?? 0, dpi);
  const offsetYDots = zplMmToDots(template.label?.offsetYMm ?? 0, dpi);

  const lines = [];
  lines.push("^XA");
  lines.push("^CI28");
  lines.push(`^PW${widthDots}`);
  lines.push(`^LL${heightDots}`);
  if (offsetXDots !== 0 || offsetYDots !== 0) {
    lines.push(`^LH${offsetXDots},${offsetYDots}`);
  }

  const objects = Array.isArray(template.objects) ? template.objects : [];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;

    if (obj.type === "text") {
      const rawX = zplMmToDots(obj.xMm ?? 0, dpi);
      const rawY = zplMmToDots(obj.yMm ?? 0, dpi);
      const h = Math.max(1, zplMmToDots(obj.fontHeightMm ?? 4, dpi));
      const w = h;
      const rotateDeg = Number(obj.rotateDeg ?? 0);
      const o = zplRotationToOrientation(rotateDeg);
      const wMm = Number(obj.wMm ?? 0);
      const blockWidthDots = Number.isFinite(wMm) && wMm > 0 ? Math.max(1, zplMmToDots(wMm, dpi)) : 0;
      const j = zplJustification(obj.align);
      const text = String(obj.text ?? "");
      const estimatedWidthDots = Math.max(1, text.length * w);
      const blockWidthForPlacement = blockWidthDots > 0 ? blockWidthDots : estimatedWidthDots;

      let x = rawX;
      let y = rawY;
      if (rotateDeg === 90) {
        x -= h;
      } else if (rotateDeg === 180) {
        x -= blockWidthForPlacement;
        y -= h;
      } else if (rotateDeg === 270) {
        y -= blockWidthForPlacement;
      }
      x = clamp(x, 0, Math.max(0, widthDots - 1));
      y = clamp(y, 0, Math.max(0, heightDots - 1));

      if (rotateDeg === 0 && blockWidthDots > 0) {
        const maxBlock = Math.max(1, widthDots - x);
        const safeBlockWidthDots = clamp(blockWidthDots, 1, maxBlock);
        const maxLines = Math.max(1, Math.floor((heightDots - y) / h));
        lines.push(`^FO${x},${y}^A0${o},${h},${w}^FB${safeBlockWidthDots},${maxLines},0,${j},0${zplText(text)}`);
      } else {
        lines.push(`^FO${x},${y}^A0${o},${h},${w}${zplText(text)}`);
      }
    }

    if (obj.type === "box") {
      const x = zplMmToDots(obj.xMm ?? 0, dpi);
      const y = zplMmToDots(obj.yMm ?? 0, dpi);
      const w = Math.max(1, zplMmToDots(obj.wMm ?? 10, dpi));
      const h = Math.max(1, zplMmToDots(obj.hMm ?? 10, dpi));
      const t = Math.max(1, zplMmToDots(obj.thicknessMm ?? 0.3, dpi));
      lines.push(`^FO${x},${y}^GB${w},${h},${t}^FS`);
    }

    if (obj.type === "barcode") {
      const x = zplMmToDots(obj.xMm ?? 0, dpi);
      const y = zplMmToDots(obj.yMm ?? 0, dpi);
      const h = Math.max(10, zplMmToDots(obj.heightMm ?? 10, dpi));
      const data = String(obj.data ?? "");
      lines.push(`^FO${x},${y}^BCN,${h},Y,N,N${zplText(data)}`);
    }

    if (obj.type === "qrcode") {
      const x = zplMmToDots(obj.xMm ?? 0, dpi);
      const y = zplMmToDots(obj.yMm ?? 0, dpi);
      const sizeMm = Number(obj.sizeMm ?? 0);
      const magnification =
        sizeMm > 0
          ? clamp(Math.round(zplMmToDots(sizeMm, dpi) / 29), 1, 10)
          : Math.max(1, Math.min(10, Number(obj.magnification ?? 6)));
      const data = String(obj.data ?? "");
      lines.push(`^FO${x},${y}^BQN,2,${magnification}${zplText(`LA,${data}`)}`);
    }
  }

  lines.push("^XZ");
  return lines.join("\n");
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  const base = String(name || "")
    .trim()
    .slice(0, 60)
    .replace(/[^\w\-\. ]+/g, "_")
    .replace(/\s+/g, "_");
  return base || "modelo";
}

function selectedObject() {
  if (!state.current || !state.selectedId) return null;
  return (state.current.objects || []).find((o) => o.id === state.selectedId) || null;
}

function setSelected(id) {
  state.selectedId = id;
  renderProperties();
  draw();
}

function renderProperties() {
  const obj = selectedObject();
  el.propsForm.innerHTML = "";

  if (!obj) {
    el.propsEmpty.classList.remove("hidden");
    el.propsForm.classList.add("hidden");
    el.deleteObjBtn.disabled = true;
    return;
  }

  el.propsEmpty.classList.add("hidden");
  el.propsForm.classList.remove("hidden");
  el.deleteObjBtn.disabled = false;

  const addField = (labelText, key, type = "number", step = "0.1") => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.step = step;
    input.value = String(obj[key] ?? "");
    input.addEventListener("input", () => {
      if (type === "number") obj[key] = Number(input.value);
      else obj[key] = input.value;
      draw();
    });
    label.appendChild(input);
    el.propsForm.appendChild(label);
  };

  const addSelect = (labelText, key, options) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = String(opt.value);
      option.textContent = opt.label;
      select.appendChild(option);
    }
    select.value = String(obj[key] ?? "");
    select.addEventListener("change", () => {
      obj[key] = Number(select.value);
      draw();
    });
    label.appendChild(select);
    el.propsForm.appendChild(label);
  };

  addField("X (mm)", "xMm");
  addField("Y (mm)", "yMm");

  if (obj.type === "text") {
    addField("Texto", "text", "text");
    addField("Altura fonte (mm)", "fontHeightMm");
    addField("Largura bloco (mm)", "wMm");
    addSelect("Rotação", "rotateDeg", [
      { value: 0, label: "0°" },
      { value: 90, label: "90°" },
      { value: 180, label: "180°" },
      { value: 270, label: "270°" },
    ]);
    const align = typeof obj.align === "string" ? obj.align : "left";
    const alignSelect = document.createElement("select");
    for (const opt of [
      { value: "left", label: "Esquerda" },
      { value: "center", label: "Centro" },
      { value: "right", label: "Direita" },
    ]) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      alignSelect.appendChild(option);
    }
    alignSelect.value = align;
    alignSelect.addEventListener("change", () => {
      obj.align = alignSelect.value;
      draw();
    });
    const alignLabel = document.createElement("label");
    alignLabel.textContent = "Alinhamento";
    alignLabel.appendChild(alignSelect);
    el.propsForm.appendChild(alignLabel);
  }

  if (obj.type === "box") {
    addField("Largura (mm)", "wMm");
    addField("Altura (mm)", "hMm");
    addField("Espessura (mm)", "thicknessMm");
  }

  if (obj.type === "barcode") {
    addField("Dados", "data", "text");
    addField("Altura (mm)", "heightMm");
    addField("Largura (mm) (visual)", "wMm");
  }

  if (obj.type === "qrcode") {
    addField("Dados", "data", "text");
    addField("Tamanho (mm)", "sizeMm");
  }
}

function addObject(obj) {
  if (!state.current) return;
  state.current.objects = Array.isArray(state.current.objects) ? state.current.objects : [];
  state.current.objects.push(obj);
  setSelected(obj.id);
  draw();
}

function removeSelectedObject() {
  if (!state.current || !state.selectedId) return;
  state.current.objects = (state.current.objects || []).filter((o) => o.id !== state.selectedId);
  state.selectedId = null;
  renderProperties();
  draw();
}

function boundsForObject(obj, label) {
  const dpi = label.dpi;
  const dotsPerMm = mmToDots(1, dpi);

  const x = Number(obj.xMm ?? 0);
  const y = Number(obj.yMm ?? 0);

  if (obj.type === "text") {
    const hMm = Number(obj.fontHeightMm ?? 4);
    const text = String(obj.text ?? "");
    const hasBlock = Number(obj.wMm ?? 0) > 0;
    const wMm = hasBlock ? Number(obj.wMm) : Math.max(4, text.length * hMm * 0.6);
    const rotateDeg = Number(obj.rotateDeg ?? 0);
    if (rotateDeg === 0 && hasBlock) {
      const { linesCount } = textLayoutForEditor(text, wMm * dotsPerMm, hMm * dotsPerMm);
      return { xMm: x, yMm: y, wMm: wMm, hMm: hMm * linesCount };
    }
    if (rotateDeg === 90 || rotateDeg === 270) {
      const fontDots = Math.max(1, hMm * dotsPerMm);
      const measuredWMm = Math.max(4, measureTextWidthDots(text, fontDots) / dotsPerMm);
      return { xMm: x, yMm: y, wMm: hMm, hMm: measuredWMm };
    }
    if (rotateDeg === 180) {
      const fontDots = Math.max(1, hMm * dotsPerMm);
      const measuredWMm = Math.max(4, measureTextWidthDots(text, fontDots) / dotsPerMm);
      return { xMm: x, yMm: y, wMm: measuredWMm, hMm };
    }
    return { xMm: x, yMm: y, wMm: wMm, hMm };
  }

  if (obj.type === "box") {
    return { xMm: x, yMm: y, wMm: Number(obj.wMm ?? 10), hMm: Number(obj.hMm ?? 10) };
  }

  if (obj.type === "barcode") {
    return { xMm: x, yMm: y, wMm: Number(obj.wMm ?? 30), hMm: Number(obj.heightMm ?? 10) };
  }

  if (obj.type === "qrcode") {
    const sizeMm = Number(obj.sizeMm ?? 20);
    return { xMm: x, yMm: y, wMm: sizeMm, hMm: sizeMm };
  }

  return { xMm: x, yMm: y, wMm: 10, hMm: 10, dotsPerMm };
}

function resizeCanvasToLabel() {
  if (!state.current) return;
  syncCurrentFromLabelInputs();
  const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
  const wrap = el.canvasWrap;
  const cs = wrap ? window.getComputedStyle(wrap) : null;
  const padX = cs ? Number.parseFloat(cs.paddingLeft || "0") + Number.parseFloat(cs.paddingRight || "0") : 0;
  const padY = cs ? Number.parseFloat(cs.paddingTop || "0") + Number.parseFloat(cs.paddingBottom || "0") : 0;
  const cssW = Math.max(100, Math.floor((wrap?.clientWidth ?? 600) - padX));
  const cssH = Math.max(100, Math.floor((wrap?.clientHeight ?? 360) - padY));
  el.canvas.style.width = `${cssW}px`;
  el.canvas.style.height = `${cssH}px`;
  el.canvas.width = Math.floor(cssW * dpr);
  el.canvas.height = Math.floor(cssH * dpr);

  applyAutoFitCameraIfNeeded(cssW, cssH);
  draw();
}

function applyAutoFitCameraIfNeeded(viewW, viewH) {
  if (!state.current) return;
  if (!state.zoomAuto) return;

  const { widthMm, heightMm, dpi } = state.current.label;
  const widthDots = Math.max(1, mmToDots(widthMm, dpi));
  const heightDots = Math.max(1, mmToDots(heightMm, dpi));
  const fitZoom = clamp(Math.min(viewW / widthDots, viewH / heightDots, 1), 0.1, 8);

  state.zoom = fitZoom;
  el.zoom.value = String(Math.round(fitZoom * 100) / 100);
  state.cameraX = Math.round((viewW - widthDots * fitZoom) / 2);
  state.cameraY = Math.round((viewH - heightDots * fitZoom) / 2);
}

function draw() {
  const ctx = el.canvas.getContext("2d");
  const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
  const viewW = el.canvas.width / dpr;
  const viewH = el.canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);

  if (!state.current) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px system-ui";
    ctx.fillText("Abra ou crie um modelo", 12, 24);
    return;
  }

  const { widthMm, heightMm, dpi } = state.current.label;
  const dotsPerMm = mmToDots(1, dpi);

  ctx.save();
  ctx.translate(state.cameraX, state.cameraY);
  ctx.scale(state.zoom, state.zoom);

  const widthDots = mmToDots(widthMm, dpi);
  const heightDots = mmToDots(heightMm, dpi);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthDots, heightDots);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, widthDots - 1, heightDots - 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, widthDots, heightDots);
  ctx.clip();

  for (const obj of state.current.objects || []) {
    drawObject(ctx, obj, { dpi, dotsPerMm });
  }

  const selected = selectedObject();
  if (selected) {
    ctx.strokeStyle = "#2563eb";
    ctx.setLineDash([4, 4]);
    drawSelection(ctx, selected, state.current.label, dotsPerMm);
    ctx.setLineDash([]);
  }
  ctx.restore();

  ctx.restore();
}

function drawSelection(ctx, obj, label, dotsPerMm) {
  if (obj.type === "text") {
    const x = Number(obj.xMm ?? 0) * dotsPerMm;
    const y = Number(obj.yMm ?? 0) * dotsPerMm;
    const hMm = Number(obj.fontHeightMm ?? 4);
    const text = String(obj.text ?? "");
    const fontDots = Math.max(1, hMm * dotsPerMm);
    const blockMm = Number(obj.wMm ?? 0);
    const blockDots = blockMm > 0 ? Math.max(1, blockMm * dotsPerMm) : 0;
    const rotateDeg = Number(obj.rotateDeg ?? 0);
    const align = typeof obj.align === "string" ? obj.align : "left";

    const measuredWidthDots = Math.max(1, measureTextWidthDots(text, fontDots));
    const w = rotateDeg ? measuredWidthDots : blockDots > 0 ? blockDots : measuredWidthDots;
    const baseH =
      rotateDeg === 0 && blockDots > 0 ? Math.max(1, textLayoutForEditor(text, blockDots, fontDots).linesCount * fontDots) : Math.max(1, fontDots);
    const extraTop = Math.max(1, fontDots * 0.25);
    const extraBottom = Math.max(1, fontDots * 0.1);
    const h = baseH + extraTop + extraBottom;
    if (rotateDeg) {
      const rad = (rotateDeg * Math.PI) / 180;
      const anchorOffset = align === "center" ? blockDots / 2 : align === "right" ? blockDots : 0;
      const selectionOffsetX =
        blockDots > 0 ? (align === "center" ? anchorOffset - measuredWidthDots / 2 : align === "right" ? anchorOffset - measuredWidthDots : 0) : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rad);
      ctx.strokeRect(selectionOffsetX, -extraTop, w, h);
      ctx.restore();
    } else {
      ctx.strokeRect(x, y - extraTop, w, h);
    }
    return;
  }

  const b = boundsForObject(obj, label);
  const x = b.xMm * dotsPerMm;
  const y = b.yMm * dotsPerMm;
  const w = b.wMm * dotsPerMm;
  const h = b.hMm * dotsPerMm;
  ctx.strokeRect(x, y, w, h);
}

function drawObject(ctx, obj, { dotsPerMm }) {
  const x = Number(obj.xMm ?? 0) * dotsPerMm;
  const y = Number(obj.yMm ?? 0) * dotsPerMm;

  if (obj.type === "text") {
    const h = Math.max(1, Number(obj.fontHeightMm ?? 4) * dotsPerMm);
    ctx.fillStyle = "#111827";
    ctx.font = `${h}px Arial`;
    ctx.textBaseline = "top";
    const rotateDeg = Number(obj.rotateDeg ?? 0);
    const align = typeof obj.align === "string" ? obj.align : "left";
    const blockMm = Number(obj.wMm ?? 0);
    const blockDots = blockMm > 0 ? blockMm * dotsPerMm : 0;
    const anchorOffset = align === "center" ? blockDots / 2 : align === "right" ? blockDots : 0;
    if (rotateDeg) {
      const rad = (rotateDeg * Math.PI) / 180;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rad);
      if (blockDots > 0) {
        ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
        ctx.fillText(String(obj.text ?? ""), anchorOffset, 0);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(String(obj.text ?? ""), 0, 0);
      }
      ctx.restore();
    } else {
      if (blockDots > 0) {
        ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
        const text = String(obj.text ?? "");
        const layout = textLayoutForEditor(text, blockDots, h);
        for (let i = 0; i < layout.lines.length; i++) {
          ctx.fillText(layout.lines[i], x + anchorOffset, y + i * h);
        }
        ctx.textAlign = "left";
      } else {
        ctx.textAlign = "left";
        ctx.fillText(String(obj.text ?? ""), x, y);
      }
    }
    return;
  }

  if (obj.type === "box") {
    const w = Math.max(1, Number(obj.wMm ?? 10) * dotsPerMm);
    const h = Math.max(1, Number(obj.hMm ?? 10) * dotsPerMm);
    const t = Math.max(1, Number(obj.thicknessMm ?? 0.3) * dotsPerMm);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = t;
    ctx.strokeRect(x, y, w, h);
    return;
  }

  if (obj.type === "barcode") {
    const w = Math.max(1, Number(obj.wMm ?? 30) * dotsPerMm);
    const h = Math.max(1, Number(obj.heightMm ?? 10) * dotsPerMm);
    ctx.fillStyle = "#111827";
    ctx.fillRect(x, y, w, Math.max(2, h * 0.85));
    ctx.clearRect(x + 2, y + 2, w - 4, Math.max(0, h * 0.85 - 4));
    ctx.fillStyle = "#111827";
    ctx.font = `${Math.max(10, h * 0.18)}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(String(obj.data ?? ""), x, y + h * 0.86);
    return;
  }

  if (obj.type === "qrcode") {
    const size = Math.max(1, Number(obj.sizeMm ?? 20) * dotsPerMm);
    const data = String(obj.data ?? "");
    if (!data) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.strokeRect(x, y, size, size);
      return;
    }

    const sizePx = clamp(Math.round(size), 64, 512);
    const entry = getQrPreviewImage(data, sizePx);
    if (entry.loaded && !entry.error) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(entry.img, x, y, size, size);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.strokeRect(x, y, size, size);
      ctx.font = `${Math.max(10, size * 0.12)}px Arial`;
      ctx.fillStyle = "#111827";
      ctx.textBaseline = "top";
      ctx.fillText(entry.error ? "QR ERRO" : "QR...", x + 6, y + 6);
    }
  }
}

function pointerToMm(evt) {
  const { x: px, y: py } = pointerToCanvasCss(evt);
  const { dpi } = state.current.label;
  const dotsPerMm = mmToDots(1, dpi);
  const worldDotsX = (px - state.cameraX) / state.zoom;
  const worldDotsY = (py - state.cameraY) / state.zoom;
  const xMm = worldDotsX / dotsPerMm;
  const yMm = worldDotsY / dotsPerMm;
  return { xMm, yMm };
}

function pointerToCanvasCss(evt) {
  const rect = el.canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function zoomAt(cssX, cssY, newZoom) {
  const prevZoom = state.zoom;
  if (prevZoom === newZoom) return;
  const worldX = (cssX - state.cameraX) / prevZoom;
  const worldY = (cssY - state.cameraY) / prevZoom;
  state.zoom = newZoom;
  state.cameraX = cssX - worldX * newZoom;
  state.cameraY = cssY - worldY * newZoom;
  el.zoom.value = String(Math.round(state.zoom * 100) / 100);
}

function rotatePoint(x, y, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function approxTextWidthMm(obj) {
  const hMm = Number(obj.fontHeightMm ?? 4);
  const text = String(obj.text ?? "");
  return Math.max(4, text.length * hMm * 0.6);
}

const measureCtx = document.createElement("canvas").getContext("2d");
const qrImageCache = new Map();

function measureTextWidthDots(text, fontDots) {
  measureCtx.font = `${Math.max(1, fontDots)}px Arial`;
  return measureCtx.measureText(String(text ?? "")).width;
}

function textLayoutForEditor(text, blockWidthDots, fontDots) {
  const raw = String(text ?? "");
  const widthDots = Math.max(0, Number(blockWidthDots ?? 0));
  const lineHeightDots = Math.max(1, Number(fontDots ?? 1));
  if (!widthDots) {
    const w = measureTextWidthDots(raw, lineHeightDots);
    return { lines: [raw], linesCount: 1, lineHeightDots, widthDots: w };
  }

  const out = [];
  const parts = raw.split(/\r?\n/);
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    const words = p.trim().length ? p.split(/\s+/) : [""];
    let line = "";
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (measureTextWidthDots(cand, lineHeightDots) <= widthDots) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      line = "";
      if (measureTextWidthDots(word, lineHeightDots) <= widthDots) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        const cand2 = chunk + ch;
        if (measureTextWidthDots(cand2, lineHeightDots) <= widthDots || !chunk) {
          chunk = cand2;
        } else {
          out.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
    if (line) out.push(line);
    if (pi !== parts.length - 1) out.push("");
  }
  const lines = out.length ? out : [""];
  return { lines, linesCount: lines.length, lineHeightDots, widthDots };
}

function getQrPreviewImage(data, sizePx) {
  const safeSize = clamp(Math.round(Number(sizePx) || 0), 64, 512);
  const safeData = String(data ?? "");
  const key = `${safeSize}|${safeData}`;
  let entry = qrImageCache.get(key);
  if (!entry) {
    const img = new Image();
    img.decoding = "async";
    entry = { img, loaded: false, error: false };
    img.onload = () => {
      entry.loaded = true;
      draw();
    };
    img.onerror = () => {
      entry.error = true;
      draw();
    };
    img.src = `/api/qr?size=${encodeURIComponent(String(safeSize))}&data=${encodeURIComponent(safeData)}`;
    qrImageCache.set(key, entry);
  }
  return entry;
}

function hitTest(mm) {
  if (!state.current) return null;
  const objs = state.current.objects || [];
  for (let i = objs.length - 1; i >= 0; i--) {
    const obj = objs[i];
    if (obj.type === "text") {
      const x0 = Number(obj.xMm ?? 0);
      const y0 = Number(obj.yMm ?? 0);
      const hMm = Number(obj.fontHeightMm ?? 4);
      const rotateDeg = Number(obj.rotateDeg ?? 0);
      const hasBlock = Number(obj.wMm ?? 0) > 0;
      const wMm = hasBlock ? Number(obj.wMm) : Number(approxTextWidthMm(obj));
      const dpi = state.current.label.dpi;
      const dotsPerMm = mmToDots(1, dpi);
      const extraTopMm = Math.max(0.2, hMm * 0.25);
      const extraBottomMm = Math.max(0.1, hMm * 0.1);

      if (rotateDeg) {
        const rad = (rotateDeg * Math.PI) / 180;
        const p = rotatePoint(mm.xMm - x0, mm.yMm - y0, -rad);
        const fontDots = Math.max(1, hMm * dotsPerMm);
        const measuredWMm = Math.max(4, measureTextWidthDots(obj.text ?? "", fontDots) / dotsPerMm);
        const align = typeof obj.align === "string" ? obj.align : "left";
        const blockMm = hasBlock ? wMm : 0;
        const offsetX =
          blockMm > 0 ? (align === "center" ? blockMm / 2 - measuredWMm / 2 : align === "right" ? blockMm - measuredWMm : 0) : 0;
        if (p.x >= offsetX && p.x <= offsetX + measuredWMm && p.y >= -extraTopMm && p.y <= hMm + extraBottomMm) return obj.id;
      } else {
        const fontDots = Math.max(1, hMm * dotsPerMm);
        const { linesCount } = hasBlock ? textLayoutForEditor(obj.text ?? "", wMm * dotsPerMm, fontDots) : { linesCount: 1 };
        const totalHMm = hasBlock ? hMm * linesCount : hMm;
        if (mm.xMm >= x0 && mm.xMm <= x0 + wMm && mm.yMm >= y0 - extraTopMm && mm.yMm <= y0 + totalHMm + extraBottomMm) return obj.id;
      }
      continue;
    }

    const b = boundsForObject(obj, state.current.label);
    if (mm.xMm >= b.xMm && mm.xMm <= b.xMm + b.wMm && mm.yMm >= b.yMm && mm.yMm <= b.yMm + b.hMm) return obj.id;
  }
  return null;
}

async function saveCurrent() {
  if (!state.current) return;
  syncCurrentFromLabelInputs();

  const payload = {
    name: state.current.name,
    label: state.current.label,
    objects: state.current.objects || [],
  };

  const { template } = await api(`/api/templates/${encodeURIComponent(state.current.id)}`, {
    method: "PUT",
    body: payload,
  });
  state.current = template;
  await loadTemplates();
  renderCurrentHeader();
  updateExportLink();
}

async function createNewTemplate() {
  const name = prompt("Nome do modelo", "Novo modelo");
  if (!name) return;
  const widthMm = Number(el.labelWidthMm.value || 50);
  const heightMm = Number(el.labelHeightMm.value || 30);
  const { template } = await api("/api/templates", {
    method: "POST",
    body: {
      name,
      label: { widthMm, heightMm, dpi: 203 },
      objects: [],
    },
  });
  state.current = template;
  state.zoomAuto = true;
  enableEditor(true);
  await loadTemplates();
  renderCurrentHeader();
  syncLabelInputsFromCurrent();
  updateExportLink();
  resizeCanvasToLabel();
  draw();
}

async function requestPublish() {
  if (!state.current) return;
  const { template } = await api(`/api/templates/${encodeURIComponent(state.current.id)}/request-publish`, { method: "POST" });
  state.current = template;
  await loadTemplates();
  renderCurrentHeader();
}

function randomId() {
  return crypto.getRandomValues(new Uint32Array(4)).join("-");
}

el.canvas.addEventListener("mousedown", (evt) => {
  if (!state.current) return;
  if (evt.button === 2) evt.preventDefault();
  const pt = pointerToCanvasCss(evt);
  const mm = pointerToMm(evt);
  const hitId = hitTest(mm);

  const startPan = () => {
    state.panDrag = { startPx: pt.x, startPy: pt.y, startX: state.cameraX, startY: state.cameraY };
  };

  if (evt.button === 2) {
    startPan();
    return;
  }

  if (evt.button === 1) {
    startPan();
    return;
  }

  if (!hitId) {
    startPan();
    setSelected(null);
    return;
  }

  setSelected(hitId);
  const obj = selectedObject();
  state.drag = {
    startMm: mm,
    startObj: { xMm: Number(obj.xMm ?? 0), yMm: Number(obj.yMm ?? 0) },
  };
});

el.canvas.addEventListener("contextmenu", (evt) => {
  evt.preventDefault();
});

window.addEventListener("mousemove", (evt) => {
  if (state.panDrag) {
    const pt = pointerToCanvasCss(evt);
    const dx = pt.x - state.panDrag.startPx;
    const dy = pt.y - state.panDrag.startPy;
    state.cameraX = state.panDrag.startX + dx;
    state.cameraY = state.panDrag.startY + dy;
    draw();
    return;
  }
  if (!state.current || !state.drag || !state.selectedId) return;
  const mm = pointerToMm(evt);
  const obj = selectedObject();
  if (!obj) return;
  const dx = mm.xMm - state.drag.startMm.xMm;
  const dy = mm.yMm - state.drag.startMm.yMm;
  obj.xMm = clamp(state.drag.startObj.xMm + dx, 0, state.current.label.widthMm);
  obj.yMm = clamp(state.drag.startObj.yMm + dy, 0, state.current.label.heightMm);
  renderProperties();
  draw();
});

window.addEventListener("mouseup", () => {
  state.drag = null;
  state.panDrag = null;
});

el.deleteObjBtn.addEventListener("click", () => removeSelectedObject());

el.addTextBtn.addEventListener("click", () => {
  const text = prompt("Texto", "Laço");
  if (text == null) return;
  const labelWidthMm = Number(state.current?.label?.widthMm ?? 50);
  addObject({
    id: randomId(),
    type: "text",
    xMm: 2,
    yMm: 2,
    text,
    fontHeightMm: 4,
    rotateDeg: 0,
    wMm: Math.max(10, labelWidthMm - 4),
    align: "left",
  });
});

el.addBoxBtn.addEventListener("click", () => {
  addObject({ id: randomId(), type: "box", xMm: 2, yMm: 2, wMm: 30, hMm: 15, thicknessMm: 0.3 });
});

el.addQrBtn.addEventListener("click", () => {
  const data = prompt("Dados do QR", "https://exemplo.com");
  if (data == null) return;
  addObject({ id: randomId(), type: "qrcode", xMm: 2, yMm: 2, data, sizeMm: 20 });
});

el.labelWidthMm.addEventListener("input", resizeCanvasToLabel);
el.labelHeightMm.addEventListener("input", resizeCanvasToLabel);
el.labelOffsetXMm.addEventListener("input", resizeCanvasToLabel);
el.labelOffsetYMm.addEventListener("input", resizeCanvasToLabel);
el.zoom.addEventListener("input", () => {
  if (!state.current) return;
  const value = clamp(Number(el.zoom.value || 1), 0.1, 8);
  const rect = el.canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  state.zoomAuto = false;
  zoomAt(cx, cy, value);
  draw();
});

el.labelWidthMm.addEventListener("input", () => {
  state.zoomAuto = true;
});
el.labelHeightMm.addEventListener("input", () => {
  state.zoomAuto = true;
});
el.zoom.addEventListener("input", () => {
  state.zoomAuto = false;
});

if (el.canvasWrap) {
  el.canvasWrap.addEventListener(
    "wheel",
    (evt) => {
      if (!state.current) return;
      evt.preventDefault();
      const factor = evt.deltaY > 0 ? 0.9 : 1.1;
      state.zoomAuto = false;
      const rect = el.canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const next = clamp(state.zoom * factor, 0.1, 8);
      zoomAt(x, y, next);
      draw();
    },
    { passive: false }
  );
}

window.addEventListener("resize", () => {
  if (state.current) resizeCanvasToLabel();
  else resizeCanvasToDefault();
});

el.exportBtn.addEventListener("click", (evt) => {
  if (!state.current) return;
  evt.preventDefault();
  syncCurrentFromLabelInputs();
  const zpl = generateZplForTemplateDraft(state.current);
  downloadTextFile(zpl, `${sanitizeFilename(state.current.name)}.zpl`);
});

el.saveBtn.addEventListener("click", async () => {
  try {
    await saveCurrent();
  } catch (e) {
    alert(e.message);
  }
});

el.newTemplateBtn.addEventListener("click", async () => {
  try {
    await createNewTemplate();
  } catch (e) {
    alert(e.message);
  }
});

el.reloadTemplatesBtn.addEventListener("click", async () => {
  try {
    await loadTemplates();
  } catch (e) {
    alert(e.message);
  }
});

el.searchInput.addEventListener("input", renderTemplates);

el.requestPublishBtn.addEventListener("click", async () => {
  try {
    await requestPublish();
  } catch (e) {
    alert(e.message);
  }
});

async function loadPending() {
  const { templates } = await api("/api/admin/pending-publish");
  el.pendingList.innerHTML = "";
  if (!templates || templates.length === 0) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "Nenhuma pendência";
    el.pendingList.appendChild(div);
    return;
  }

  for (const t of templates) {
    const item = document.createElement("div");
    item.className = "list-item";
    const top = document.createElement("div");
    top.className = "row row-between";
    const name = document.createElement("strong");
    name.textContent = t.name;
    const publishBtn = document.createElement("button");
    publishBtn.className = "btn btn-primary";
    publishBtn.textContent = "Publicar";
    publishBtn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      await api(`/api/admin/templates/${encodeURIComponent(t.id)}/publish`, { method: "POST" });
      await loadTemplates();
      await loadPending();
    });
    top.appendChild(name);
    top.appendChild(publishBtn);
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `${t.label?.widthMm ?? "?"}x${t.label?.heightMm ?? "?"}mm @ ${t.label?.dpi ?? "?"}dpi`;
    item.appendChild(top);
    item.appendChild(meta);
    item.addEventListener("click", () => openTemplate(t.id));
    el.pendingList.appendChild(item);
  }
}

el.reloadPendingBtn.addEventListener("click", async () => {
  try {
    await loadPending();
  } catch (e) {
    alert(e.message);
  }
});

el.logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    state.me = null;
    state.current = null;
    state.templates = [];
    enableEditor(false);
    setAuthMode(false);
    renderMe();
    el.templatesList.innerHTML = "";
    draw();
  }
});

el.loginForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  setMessage(el.loginMsg, "");
  const fd = new FormData(el.loginForm);
  try {
    const { user } = await api("/api/auth/login", {
      method: "POST",
      body: { email: fd.get("email"), password: fd.get("password") },
    });
    state.me = user;
    renderMe();
    setAuthMode(true);
    await loadTemplates();
    enableEditor(false);
    draw();
  } catch (e) {
    setMessage(el.loginMsg, e.message);
  }
});

el.registerForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  setMessage(el.registerMsg, "");
  const fd = new FormData(el.registerForm);
  try {
    const { user } = await api("/api/auth/register", {
      method: "POST",
      body: { email: fd.get("email"), password: fd.get("password"), storeId: fd.get("storeId") },
    });
    state.me = user;
    renderMe();
    setAuthMode(true);
    await loadTemplates();
    enableEditor(false);
    draw();
  } catch (e) {
    setMessage(el.registerMsg, e.message);
  }
});

function resizeCanvasToDefault() {
  el.canvas.width = 600;
  el.canvas.height = 360;
  draw();
}

enableEditor(false);
resizeCanvasToDefault();
await refreshMe();
if (state.me) {
  await loadTemplates();
}
