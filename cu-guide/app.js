// C:U 상태이상 응급 매뉴얼 - 동작 코드
// 기본 내용은 data.js 에 있다.
// 오른쪽 아래 + 버튼(편집)에서 바꾼 내용은 이 브라우저(localStorage)에만 저장된다.
// 모두에게 보이게 하려면 편집 화면의 "data.js 내보내기"로 받은 파일로 data.js 를 바꾼다.

(function () {
  // data.js 를 못 불러왔으면 빈 화면 대신 안내문을 보여준다
  if (typeof STATUS_EFFECTS === "undefined" || !Array.isArray(STATUS_EFFECTS)) {
    document.getElementById("grid").innerHTML =
      '<p class="load-error">data.js 를 불러오지 못했습니다.<br>' +
      'index.html 과 data.js 가 같은 폴더에 있는지, data.js 에 문법 오류(쉼표, 따옴표 등)가 없는지 확인하세요.</p>';
    return;
  }

  // ---------- 데이터 (기본값 + 브라우저 저장본) ----------
  const STORAGE_KEY = "cu-guide-custom-v1";
  const FALLBACK_LEVELS = [
    { label: "긴급", color: "#d93025" },
    { label: "빠르게", color: "#e8710a" },
    { label: "여유 있음", color: "#888888" }
  ];
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function defaults() {
    const lv = (typeof PRIORITY_LEVELS !== "undefined" && Array.isArray(PRIORITY_LEVELS) && PRIORITY_LEVELS.length)
      ? PRIORITY_LEVELS : FALLBACK_LEVELS;
    return { cards: clone(STATUS_EFFECTS), levels: clone(lv) };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.cards) && Array.isArray(saved.levels) && saved.levels.length) {
        return saved;
      }
    } catch (e) { /* 저장본이 없거나 깨졌으면 기본값 */ }
    return defaults();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: data, levels: levels, presetName }));
    } catch (e) { /* 저장 불가(사생활 보호 모드 등) - 이번 방문 동안만 유지 */ }
  }

  function hasCustom() {
    try { return localStorage.getItem(STORAGE_KEY) !== null; } catch (e) { return false; }
  }

  let { cards: data, levels, presetName = "" } = load();   // presetName: 불러온 프리셋 이름
  const selected = new Set();          // 담은 상태이상 id (새로고침하면 초기화)
  const gauge = new Map();             // 상태이상 id → 현재 게이지 % (새로고침하면 0)
  let editingId = null;                // 편집 중인 카드 id (null 이면 새 카드)

  const $ = (id) => document.getElementById(id);
  const byId = (id) => data.find((s) => s.id === id);
  const circled = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

  // ---------- 공통 도우미 ----------
  function esc(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // 우선순위 숫자 p 는 levels[p-1] 단계. 범위를 벗어나면 가장 가까운 단계로 본다.
  function level(p) {
    const i = Math.min(Math.max((Number(p) || 1) - 1, 0), levels.length - 1);
    return levels[i];
  }
  function priorityColor(p) { return esc(level(p).color || "#888888"); }
  function priorityLabel(p) { return level(p).label || ""; }
  function badgeHtml(p, withNum) {
    return `<span class="badge" style="background:${priorityColor(p)}">
      ${withNum ? `우선순위 ${esc(p)} · ` : ""}${esc(priorityLabel(p))}</span>`;
  }

  // ---------- 게이지(%) 단계 ----------
  // stages: [{ min: 0, label: "가벼움", priority: 2 }, { min: 50, label: "심함", priority: 1 }]
  // 게이지가 min% 이상이면 그 단계. 단계가 없으면 priority 하나만 쓰는 1단계 카드다.
  function stagesOf(s) {
    if (Array.isArray(s.stages) && s.stages.length) {
      return s.stages.slice().sort((a, b) => a.min - b.min);
    }
    return [{ min: 0, label: "", priority: s.priority || 1 }];
  }
  function hasGauge(s) { return stagesOf(s).length > 1; }
  function pctOf(s) { return gauge.get(s.id) || 0; }
  function stageAt(s, pct) {
    const list = stagesOf(s);
    let cur = list[0];
    list.forEach((st) => { if (pct >= st.min) cur = st; });
    return cur;
  }
  function stageName(st) { return st.label || `${st.min}% 이상`; }
  function effPriority(s) { return stageAt(s, pctOf(s)).priority; }

  // 게이지 조절 막대 (치료 순서 목록, 상세 화면에서 사용)
  function gaugeHtml(s) {
    if (!hasGauge(s)) return "";
    const pct = pctOf(s);
    const st = stageAt(s, pct);
    const marks = stagesOf(s).filter((x) => x.min > 0)
      .map((x) => `<span class="gauge-mark" style="left:${x.min}%" title="${esc(stageName(x))} (${x.min}% 이상)"></span>`).join("");
    return `
      <div class="gauge" data-gauge="${esc(s.id)}">
        <div class="gauge-track">
          <input type="range" min="0" max="100" step="1" value="${pct}"
                 aria-label="${esc(s.nameKo)} 게이지 %">
          ${marks}
        </div>
        <span class="gauge-val">${pct}%</span>
        <span class="gauge-stage" style="color:${priorityColor(st.priority)}">${esc(stageName(st))}</span>
      </div>`;
  }

  // 카드에 보이는 작은 게이지 막대 (보기 전용)
  function miniGaugeHtml(s) {
    if (!hasGauge(s)) return "";
    const pct = pctOf(s);
    const st = stageAt(s, pct);
    return `
      <div class="mini-gauge"><span style="width:${pct}%;background:${priorityColor(st.priority)}"></span></div>
      <div class="mini-gauge-text">${pct}% · ${esc(stageName(st))}</div>`;
  }

  // 단계 표 (상세 화면)
  function stageTableHtml(s) {
    if (!hasGauge(s)) return "";
    const list = stagesOf(s);
    const cur = stageAt(s, pctOf(s));
    return `
      <h3>단계 <span class="hint">(게이지 % 에 따라 바뀜)</span></h3>
      <ul class="stage-table">
        ${list.map((st, i) => {
          const next = list[i + 1];
          const range = next ? `${st.min}% ~ ${next.min - 1}%` : `${st.min}% ~ 100%`;
          return `<li class="${st === cur ? "current" : ""}">
            <span class="stage-range">${range}</span>
            <strong>${esc(stageName(st))}</strong>
            ${badgeHtml(st.priority, true)}
          </li>`;
        }).join("")}
      </ul>`;
  }

  function placeholderHtml(s, big) {
    const ch = (s.nameKo || s.nameEn || "?").charAt(0);
    return `<div class="icon placeholder${big ? " big" : ""}">${esc(ch)}</div>`;
  }

  function iconHtml(s, big) {
    if (!s.icon) return placeholderHtml(s, big);
    // 이미지 파일을 못 찾으면 임시 아이콘으로 바꾼다
    return `<img class="icon${big ? " big" : ""}" src="${esc(s.icon)}" alt=""
             data-fallback="${esc(s.id)}" data-big="${big ? 1 : 0}">`;
  }

  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.fallback) {
      const s = byId(img.dataset.fallback);
      if (s) img.outerHTML = placeholderHtml(s, img.dataset.big === "1");
    }
  }, true);

  // ---------- 화면 전환 ----------
  let currentView = "main";
  function show(view) {
    ["main", "detail", "manage", "edit"].forEach((v) => {
      $("view-" + v).hidden = v !== view;
    });
    currentView = view;
    $("fab").hidden = view === "manage" || view === "edit";
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentView === "edit") openManage();
      else { renderGrid(); show("main"); }
    });
  });

  // ---------- 검색 ----------
  function matches(s, q) {
    if (!q) return true;
    const hay = [s.nameKo, s.nameEn, ...(s.symptoms || [])].join(" ").toLowerCase();
    return hay.includes(q);
  }

  // ---------- 메인 화면 ----------
  function renderGrid() {
    const q = $("search").value.trim().toLowerCase();
    const list = data.filter((s) => matches(s, q));
    const rank = rankMap();
    $("grid").innerHTML = list.map((s) => {
      const on = selected.has(s.id);
      return `
        <div class="card${on ? " selected" : ""}" data-toggle="${esc(s.id)}"
             title="${on ? "눌러서 선택 해제" : "눌러서 지금 걸린 상태이상으로 선택"}">
          ${on ? `<span class="rank">${rank[s.id]}</span>` : ""}
          <button class="check" data-open="${esc(s.id)}"
                  title="상세 보기" aria-label="${esc(s.nameKo)} 상세 보기">i</button>
          ${iconHtml(s, false)}
          <div class="name-ko">${esc(s.nameKo)}</div>
          <div class="name-en">${esc(s.nameEn)}</div>
          ${badgeHtml(effPriority(s), true)}
          ${miniGaugeHtml(s)}
        </div>`;
    }).join("");
    $("empty").hidden = list.length > 0;
    $("empty").textContent = data.length ? "검색 결과가 없습니다." : "카드가 없습니다. 오른쪽 아래 + 버튼으로 추가하세요.";
    renderQuickOrder();
  }

  // 메인 화면 위쪽: 선택하는 즉시 치료 순서를 보여준다
  function renderQuickOrder() {
    const box = $("quick-order");
    if (selected.size === 0) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = `
      <div class="quick-head">
        <h2>치료 순서 <span class="hint">(위에서부터 먼저)</span></h2>
        <button class="clear" data-clear>전체 해제</button>
      </div>
      <ol class="order">${orderHtml()}</ol>`;
  }

  $("search").addEventListener("input", renderGrid);

  // ---------- 상세 화면 ----------
  function renderDetail(id) {
    const s = byId(id);
    if (!s) return;
    const on = selected.has(s.id);
    const li = (arr) => (arr || []).map((t) => `<li>${esc(t)}</li>`).join("");
    $("detail").innerHTML = `
      <div class="detail" data-detail="${esc(s.id)}">
        <div class="detail-head">
          ${iconHtml(s, true)}
          <div>
            <h2>${esc(s.nameKo)} (${esc(s.nameEn)})</h2>
            ${badgeHtml(effPriority(s), true)}
          </div>
        </div>
        ${hasGauge(s) ? `<h3>현재 게이지</h3>${gaugeHtml(s)}` : ""}
        ${stageTableHtml(s)}
        <h3>증상</h3>
        <ul>${li(s.symptoms)}</ul>
        <h3>치료법</h3>
        <ul>${li(s.treatment)}</ul>
        <div class="row-btns">
          <button class="btn${on ? " on" : ""}" data-toggle="${esc(s.id)}">
            ${on ? "✓ 담김 (빼기)" : "+ 담기"}
          </button>
          <button class="btn" data-edit="${esc(s.id)}">수정</button>
        </div>
      </div>`;
  }

  function openDetail(id) {
    renderDetail(id);
    show("detail");
  }

  // ---------- 치료 순서 ----------
  // 선택한 항목을 (게이지 단계에 따른) 우선순위 숫자 순서로 정렬하고, 숫자가 같으면 한 묶음으로 만든다
  function orderGroups() {
    const items = data
      .filter((s) => selected.has(s.id))
      .map((s) => ({ s, p: effPriority(s) }))
      .sort((a, b) => a.p - b.p);
    const groups = [];
    items.forEach(({ s, p }) => {
      const last = groups[groups.length - 1];
      if (last && last.priority === p) last.items.push(s);
      else groups.push({ priority: p, items: [s] });
    });
    return groups;
  }

  function rankLabel(i) { return circled[i] || (i + 1) + "."; }

  // { 상태이상 id: "①" } 형태 - 카드에 몇 번째로 치료할지 표시할 때 사용
  function rankMap() {
    const map = {};
    orderGroups().forEach((g, i) => g.items.forEach((s) => { map[s.id] = rankLabel(i); }));
    return map;
  }

  function orderHtml() {
    return orderGroups().map((g, i) => `
      <li class="group">
        <div class="group-head">
          <span class="num">${rankLabel(i)}</span>
          ${badgeHtml(g.priority, false)}
          ${g.items.length > 1 ? `<span class="together">동시에 처리</span>` : ""}
        </div>
        ${g.items.map((s) => `
          <div class="order-item" style="border-left-color:${priorityColor(g.priority)}">
            <button class="order-open" data-open="${esc(s.id)}">
              <strong>${esc(s.nameKo)} (${esc(s.nameEn)})</strong>
              <span class="arrow">→</span> ${esc(s.summary)}
            </button>
            ${gaugeHtml(s)}
          </div>`).join("")}
      </li>`).join("");
  }

  // ---------- 게이지 조절 ----------
  // 끄는 동안(input)에는 글자만 바꾸고, 놓으면(change) 순서까지 다시 계산한다
  document.addEventListener("input", (e) => {
    const g = e.target.closest("[data-gauge]");
    if (!g || e.target.type !== "range") return;
    const s = byId(g.dataset.gauge);
    if (!s) return;
    const pct = Number(e.target.value);
    gauge.set(s.id, pct);
    const st = stageAt(s, pct);
    g.querySelector(".gauge-val").textContent = pct + "%";
    const name = g.querySelector(".gauge-stage");
    name.textContent = stageName(st);
    name.style.color = level(st.priority).color || "#888888";
  });

  document.addEventListener("change", (e) => {
    const g = e.target.closest("[data-gauge]");
    if (!g || e.target.type !== "range") return;
    const id = g.dataset.gauge;
    const where = g.closest("#quick-order") ? "quick-order" : "detail";
    updateAll();
    // 다시 그린 뒤에도 키보드로 계속 조절할 수 있게 포커스를 되돌린다
    const again = $(where).querySelector(`[data-gauge="${CSS.escape(id)}"] input`);
    if (again) again.focus();
  });

  // ---------- 담기 ----------
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    updateAll();
  }

  function updateAll() {
    renderGrid();
    if (currentView === "detail") {
      const id = $("detail").querySelector("[data-detail]")?.dataset.detail;
      if (id) renderDetail(id);
    }
  }

  // ---------- 편집: 목록 화면 ----------
  function openManage() {
    renderManage();
    show("manage");
  }

  // 카드와 그 단계들이 가진 우선순위 숫자를 모두 바꾼다
  function remapPriorities(fn) {
    data.forEach((s) => {
      s.priority = fn(s.priority);
      if (Array.isArray(s.stages)) s.stages.forEach((st) => { st.priority = fn(st.priority); });
    });
  }
  function usesLevel(s, p) { return stagesOf(s).some((st) => st.priority === p); }

  function renderManage() {
    // 우선순위 단계
    $("level-list").innerHTML = levels.map((lv, i) => {
      const used = data.filter((s) => usesLevel(s, i + 1)).length;
      return `
        <li class="level-row" data-level="${i}">
          <span class="level-num">${i + 1}</span>
          <input type="color" class="level-color" value="${esc(lv.color || "#888888")}"
                 aria-label="${i + 1}단계 색">
          <input type="text" class="level-label" value="${esc(lv.label)}"
                 placeholder="설명 (예: 긴급)" aria-label="${i + 1}단계 설명">
          <span class="level-used">${used}개</span>
          <button class="mini" data-level-move="-1" ${i === 0 ? "disabled" : ""} title="위로 (더 급하게)">↑</button>
          <button class="mini" data-level-move="1" ${i === levels.length - 1 ? "disabled" : ""} title="아래로 (덜 급하게)">↓</button>
          <button class="mini danger" data-level-del ${levels.length <= 1 ? "disabled" : ""} title="단계 삭제">✕</button>
        </li>`;
    }).join("");

    // 카드 목록 (가장 급한 단계 순)
    const top = (s) => Math.min(...stagesOf(s).map((st) => st.priority));
    const sorted = data.map((s, idx) => ({ s, idx }))
      .sort((a, b) => top(a.s) - top(b.s) || a.idx - b.idx);
    $("card-list").innerHTML = sorted.length ? sorted.map(({ s }) => `
      <li class="card-row">
        <div class="card-row-main">
          <strong>${esc(s.nameKo)}</strong> <span class="muted">${esc(s.nameEn)}</span>
          <div class="stage-badges">${hasGauge(s)
            ? stagesOf(s).map((st) => `<span class="stage-chip">${st.min}%+ ${esc(stageName(st))}</span>${badgeHtml(st.priority, false)}`).join(" ")
            : badgeHtml(stagesOf(s)[0].priority, true)}</div>
        </div>
        <button class="mini" data-edit="${esc(s.id)}">수정</button>
        <button class="mini danger" data-card-del="${esc(s.id)}">삭제</button>
      </li>`).join("") : `<li class="muted">카드가 없습니다.</li>`;

    $("reset-all").hidden = !hasCustom();
  }

  // 단계 설명/색 바꾸기 (입력 중에는 목록을 다시 그리지 않는다)
  $("level-list").addEventListener("change", (e) => {
    const row = e.target.closest("[data-level]");
    if (!row) return;
    const lv = levels[Number(row.dataset.level)];
    if (e.target.classList.contains("level-label")) lv.label = e.target.value.trim();
    if (e.target.classList.contains("level-color")) lv.color = e.target.value;
    save();
    renderManage();
  });

  // 단계 순서 바꾸기: 카드(와 게이지 단계)는 자기 단계를 따라간다
  function moveLevel(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    [levels[i], levels[j]] = [levels[j], levels[i]];
    const a = i + 1, b = j + 1;
    remapPriorities((p) => (p === a ? b : p === b ? a : p));
    save();
    renderManage();
  }

  // 단계 삭제: 그 단계를 쓰던 곳은 한 단계 위(1단계면 아래)로 옮기고, 뒤 번호를 당긴다
  function deleteLevel(i) {
    if (levels.length <= 1) return;
    const p = i + 1;
    const used = data.filter((s) => usesLevel(s, p));
    const target = p === 1 ? 1 : p - 1;   // 삭제 후 번호 기준
    if (used.length) {
      const targetName = p === 1 ? levels[1].label : levels[i - 1].label;
      if (!confirm(`"${levels[i].label}" 단계를 쓰는 카드 ${used.length}개를 "${targetName}" 단계로 옮기고 삭제할까요?`)) return;
    }
    levels.splice(i, 1);
    remapPriorities((q) => (q === p ? target : q > p ? q - 1 : q));
    save();
    renderManage();
  }

  $("level-add").addEventListener("click", () => {
    levels.push({ label: "새 단계", color: "#888888" });
    save();
    renderManage();
    const inputs = $("level-list").querySelectorAll(".level-label");
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.select(); }
  });

  function deleteCard(id) {
    const s = byId(id);
    if (!s || !confirm(`"${s.nameKo}" 카드를 삭제할까요?`)) return;
    data = data.filter((x) => x.id !== id);
    selected.delete(id);
    gauge.delete(id);
    save();
    renderManage();
  }

  $("reset-all").addEventListener("click", () => {
    if (!confirm("이 브라우저에서 바꾼 내용을 모두 지우고 data.js 기본값으로 되돌릴까요?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    ({ cards: data, levels } = defaults());
    presetName = "";
    selected.clear();
    gauge.clear();
    renderPresetName();
    renderManage();
  });

  // data.js 파일로 내보내기 - 이 파일로 data.js 를 바꾸면 모든 방문자에게 반영된다
  $("export").addEventListener("click", () => {
    const text =
`/*
  C:U 상태이상 응급 매뉴얼 - 데이터 파일
  앱의 편집 화면(오른쪽 아래 +)에서 내보낸 파일이다.

  ■ PRIORITY_LEVELS : 우선순위 단계. 위에서부터 1, 2, 3... (1이 가장 급함)
      label = 설명, color = 배지 색
  ■ STATUS_EFFECTS  : 상태이상 카드
      id(영어 소문자·하이픈), nameKo, nameEn, icon(없으면 ""),
      priority(위 단계 번호), symptoms(증상 목록), treatment(치료법 목록), summary(치료 순서에 보일 한 줄)
      stages(선택) : 게이지 % 에 따른 단계. [{ min: 0, label: "가벼움", priority: 2 }, { min: 50, label: "심함", priority: 1 }]
                     게이지가 min% 이상이면 그 단계의 priority 로 치료 순서를 정한다.

  ※ Scav Prototype Wiki(scavprototype.wiki.gg)를 참고해 다시 쓴 내용이다.
*/

const PRIORITY_LEVELS = ${JSON.stringify(levels, null, 2)};

const STATUS_EFFECTS = ${JSON.stringify(data, null, 2)};
`;
    downloadFile("data.js", text, "text/javascript;charset=utf-8");
  });

  function downloadFile(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- 프리셋 저장 / 불러오기 (오른쪽 위) ----------
  // 프리셋 = 우선순위 단계 + 카드(게이지 단계 포함) 전체를 담은 .json 파일.
  // 파일을 주고받으면 다른 사람이 만든 설정을 그대로 쓸 수 있다.
  const PRESET_APP = "cu-guide-preset";

  function renderPresetName() { $("preset-name").textContent = presetName; }

  let msgTimer = null;
  function presetMsg(text, isError) {
    const box = $("preset-msg");
    box.textContent = text;
    box.classList.toggle("error", !!isError);
    box.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { box.hidden = true; }, isError ? 8000 : 4000);
  }

  $("preset-save").addEventListener("click", () => {
    const name = prompt("프리셋 이름을 입력하세요.", presetName || "내 프리셋");
    if (name === null) return;                       // 취소
    const clean = name.trim() || "내 프리셋";
    const preset = { app: PRESET_APP, version: 1, name: clean, levels, cards: data };
    const file = clean.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
    downloadFile(`${file}.json`, JSON.stringify(preset, null, 2), "application/json;charset=utf-8");
    presetName = clean;
    save();
    renderPresetName();
    presetMsg(`"${clean}" 프리셋 파일을 저장했습니다. 이 파일을 다른 사람에게 주면 불러오기로 쓸 수 있습니다.`);
  });

  $("preset-load").addEventListener("click", () => {
    $("preset-file").value = "";
    $("preset-file").click();
  });

  $("preset-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let preset;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("파일이 너무 큽니다 (2MB 이하).");
      let raw;
      try { raw = JSON.parse(await file.text()); }
      catch (e2) { throw new Error("프리셋 파일(.json) 형식이 아닙니다. 파일이 깨졌거나 다른 종류의 파일입니다."); }
      preset = parsePreset(raw);
    } catch (err) {
      presetMsg(`불러오지 못했습니다: ${err.message || "프리셋 파일 형식이 아닙니다."}`, true);
      return;
    }
    const label = preset.name || file.name;
    if (!confirm(`"${label}" 프리셋을 불러올까요?\n카드 ${preset.cards.length}개, 우선순위 단계 ${preset.levels.length}개\n\n지금 설정은 이 프리셋으로 바뀝니다. (필요하면 먼저 "저장"으로 보관하세요)`)) return;
    data = preset.cards;
    levels = preset.levels;
    presetName = label;
    selected.clear();
    gauge.clear();
    save();
    renderPresetName();
    if (currentView !== "main") show("main");
    renderGrid();
    presetMsg(`"${label}" 프리셋을 불러왔습니다.`);
  });

  // 남이 만든 파일이므로 필요한 칸만 골라 담고, 형식이 이상하면 거절한다
  function parsePreset(raw) {
    if (!raw || typeof raw !== "object") throw new Error("프리셋 파일 형식이 아닙니다.");
    if (!Array.isArray(raw.levels) || !raw.levels.length) throw new Error("우선순위 단계(levels)가 없습니다.");
    if (!Array.isArray(raw.cards)) throw new Error("카드 목록(cards)이 없습니다.");
    const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const strList = (v) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 50) : []);
    const color = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#888888");

    const lv = raw.levels.slice(0, 20).map((l) => ({ label: str(l && l.label, 40) || "단계", color: color(l && l.color) }));
    const clampP = (p) => Math.min(Math.max(Math.round(Number(p)) || 1, 1), lv.length);

    const ids = new Set();
    const cards = raw.cards.slice(0, 200).map((c, i) => {
      if (!c || typeof c !== "object") throw new Error(`${i + 1}번째 카드 형식이 잘못되었습니다.`);
      const nameKo = str(c.nameKo, 60);
      if (!nameKo) throw new Error(`${i + 1}번째 카드에 한국어 이름(nameKo)이 없습니다.`);
      let id = str(c.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "card";
      const base = id; let n = 2;
      while (ids.has(id)) id = `${base}-${n++}`;
      ids.add(id);
      const card = {
        id, nameKo,
        nameEn: str(c.nameEn, 60),
        icon: str(c.icon, 300),
        priority: clampP(c.priority),
        symptoms: strList(c.symptoms),
        treatment: strList(c.treatment),
        summary: str(c.summary, 200)
      };
      if (Array.isArray(c.stages) && c.stages.length) {
        const seen = new Set();
        const stages = c.stages.slice(0, 20).map((s) => ({
          min: Math.min(Math.max(Math.round(Number(s && s.min)) || 0, 0), 100),
          label: str(s && s.label, 40),
          priority: clampP(s && s.priority)
        })).sort((a, b) => a.min - b.min).filter((s) => !seen.has(s.min) && seen.add(s.min));
        if (stages.length) {
          stages[0].min = 0;
          card.stages = stages;
          card.priority = stages[0].priority;
        }
      }
      return card;
    });
    return { name: str(raw.name, 60), levels: lv, cards };
  }

  // ---------- 편집: 카드 추가/수정 화면 ----------
  function levelOptions(p) {
    return levels.map((lv, i) =>
      `<option value="${i + 1}"${i + 1 === p ? " selected" : ""}>${i + 1} · ${esc(lv.label)}</option>`).join("");
  }

  // 게이지 단계 입력 줄들 그리기 (첫 줄은 항상 0%)
  function renderStageRows(stages) {
    const single = stages.length === 1;
    $("stage-list").innerHTML = stages.map((st, i) => `
      <li class="stage-row">
        <label class="stage-min">
          <input type="number" min="0" max="100" step="1" value="${i === 0 ? 0 : esc(st.min)}"
                 ${i === 0 ? "disabled" : ""} aria-label="${i + 1}번째 단계 시작 %">
          <span>% 이상</span>
        </label>
        <input type="text" class="stage-label" value="${esc(st.label)}"
               placeholder="${single ? "단계 이름 (선택)" : "단계 이름 (예: 심함)"}" aria-label="${i + 1}번째 단계 이름">
        <select class="stage-priority" aria-label="${i + 1}번째 단계 우선순위">${levelOptions(Math.min(Math.max(st.priority, 1), levels.length))}</select>
        <button type="button" class="mini danger" data-stage-del="${i}" ${i === 0 ? "disabled" : ""} title="단계 삭제">✕</button>
      </li>`).join("");
  }

  function readStageRows() {
    return [...$("stage-list").querySelectorAll(".stage-row")].map((row, i) => ({
      min: i === 0 ? 0 : Number(row.querySelector("input[type=number]").value),
      label: row.querySelector(".stage-label").value.trim(),
      priority: Number(row.querySelector(".stage-priority").value)
    }));
  }

  function openEdit(id) {
    editingId = id || null;
    const s = id ? byId(id) : null;
    const f = $("edit-form");
    $("edit-title").textContent = s ? `카드 수정: ${s.nameKo}` : "새 카드 추가";
    f.nameKo.value = s ? s.nameKo : "";
    f.nameEn.value = s ? s.nameEn : "";
    f.icon.value = s ? s.icon || "" : "";
    f.summary.value = s ? s.summary || "" : "";
    f.symptoms.value = s ? (s.symptoms || []).join("\n") : "";
    f.treatment.value = s ? (s.treatment || []).join("\n") : "";
    renderStageRows(s ? stagesOf(s) : [{ min: 0, label: "", priority: 1 }]);
    $("edit-delete").hidden = !s;
    $("edit-error").textContent = "";
    show("edit");
    f.nameKo.focus();
  }

  $("stage-add").addEventListener("click", () => {
    const rows = readStageRows();
    const last = rows[rows.length - 1];
    rows.push({ min: Math.min((Number(last.min) || 0) + 25, 100), label: "", priority: last.priority });
    renderStageRows(rows);
    const labels = $("stage-list").querySelectorAll(".stage-label");
    labels[labels.length - 1].focus();
  });

  $("stage-list").addEventListener("click", (e) => {
    const del = e.target.closest("[data-stage-del]");
    if (!del) return;
    const rows = readStageRows();
    rows.splice(Number(del.dataset.stageDel), 1);
    renderStageRows(rows);
  });

  function makeId(nameEn) {
    let base = String(nameEn || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!base) base = "custom";
    let id = base, n = 2;
    while (byId(id)) id = `${base}-${n++}`;
    return id;
  }

  $("edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const err = (msg) => { $("edit-error").textContent = msg; };
    const lines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);
    const nameKo = f.nameKo.value.trim();
    if (!nameKo) { err("한국어 이름을 입력하세요."); f.nameKo.focus(); return; }

    const stages = readStageRows();
    for (const st of stages.slice(1)) {
      if (!Number.isInteger(st.min) || st.min < 1 || st.min > 100) {
        err("단계 시작 %는 1~100 사이의 정수로 입력하세요. (첫 단계는 항상 0%)");
        return;
      }
    }
    stages.sort((a, b) => a.min - b.min);
    if (new Set(stages.map((st) => st.min)).size !== stages.length) {
      err("같은 % 로 시작하는 단계가 두 개 있습니다. 시작 % 를 서로 다르게 하세요.");
      return;
    }

    const fields = {
      nameKo,
      nameEn: f.nameEn.value.trim(),
      icon: f.icon.value.trim(),
      priority: stages[0].priority,
      symptoms: lines(f.symptoms.value),
      treatment: lines(f.treatment.value),
      summary: f.summary.value.trim()
    };
    let card;
    if (editingId && byId(editingId)) {
      card = Object.assign(byId(editingId), fields);
    } else {
      card = { id: makeId(fields.nameEn), ...fields };
      data.push(card);
    }
    // 단계가 하나뿐이고 이름도 없으면 일반(게이지 없는) 카드로 저장
    if (stages.length > 1 || stages[0].label) card.stages = stages;
    else delete card.stages;
    save();
    openManage();
  });

  $("edit-delete").addEventListener("click", () => {
    if (!editingId) return;
    const before = data.length;
    deleteCard(editingId);
    if (data.length < before) openManage();
  });

  $("edit-cancel").addEventListener("click", () => openManage());

  $("fab").addEventListener("click", () => openManage());

  // ---------- 클릭 처리 (한 곳에서) ----------
  document.addEventListener("click", (e) => {
    // 카드의 i 버튼(상세 보기)은 카드(선택) 안에 있으므로 먼저 확인한다
    const o = e.target.closest("[data-open]");
    if (o) { openDetail(o.dataset.open); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) { openEdit(ed.dataset.edit); return; }
    const cd = e.target.closest("[data-card-del]");
    if (cd) { deleteCard(cd.dataset.cardDel); return; }
    const lm = e.target.closest("[data-level-move]");
    if (lm) { moveLevel(Number(lm.closest("[data-level]").dataset.level), Number(lm.dataset.levelMove)); return; }
    const ld = e.target.closest("[data-level-del]");
    if (ld) { deleteLevel(Number(ld.closest("[data-level]").dataset.level)); return; }
    if (e.target.closest("[data-new-card]")) { openEdit(null); return; }
    if (e.target.closest("[data-clear]")) { selected.clear(); updateAll(); return; }
    const t = e.target.closest("[data-toggle]");
    if (t) toggle(t.dataset.toggle);
  });

  // ---------- 시작 ----------
  renderPresetName();
  renderGrid();
})();
