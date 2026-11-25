// C:U 상태이상 응급 매뉴얼 - 동작 코드
// 기본 내용은 data.js 에 있다. 앱 안에서 바꾼 내용은 이 브라우저(localStorage)에 저장된다.

(function () {
  const STORAGE_KEY = "cu-guide-data-v1";
  const circled = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

  let data = loadData();
  const selected = new Set();          // 선택한 상태이상 id (새로고침하면 초기화)
  let currentView = "main";
  let prevView = "main";               // 상세/입력 화면에서 돌아갈 화면
  let editingId = null;                // 수정 중인 항목 id (새로 추가면 null)

  const $ = (id) => document.getElementById(id);
  const byId = (id) => data.find((s) => s.id === id);

  // ---------- 데이터 저장/불러오기 ----------
  function cloneDefault() {
    return JSON.parse(JSON.stringify(typeof STATUS_EFFECTS !== "undefined" ? STATUS_EFFECTS : []));
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { /* 저장소를 못 쓰면 data.js 내용 사용 */ }
    return cloneDefault();
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert("이 브라우저에 저장하지 못했습니다. 새로고침하면 바뀐 내용이 사라질 수 있으니 'data.js로 내보내기'를 사용하세요.");
      return false;
    }
  }

  // ---------- 공통 도우미 ----------
  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function priorityClass(p) { return p <= 1 ? "p1" : p === 2 ? "p2" : "p3"; }
  function priorityLabel(p) { return p <= 1 ? "긴급" : p === 2 ? "빠르게" : "여유 있음"; }

  function placeholderHtml(s, big) {
    const ch = (s.nameKo || s.nameEn || "?").charAt(0);
    return `<div class="icon placeholder${big ? " big" : ""}">${esc(ch)}</div>`;
  }

  function iconHtml(s, big) {
    if (!s.icon) return placeholderHtml(s, big);
    return `<img class="icon${big ? " big" : ""}" src="${esc(s.icon)}" alt=""
             data-fallback="${esc(s.id)}" data-big="${big ? 1 : 0}">`;
  }

  // 아이콘 이미지 파일을 못 찾으면 임시 아이콘으로 바꾼다
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.fallback) {
      const s = byId(img.dataset.fallback) || {};
      img.outerHTML = placeholderHtml(s, img.dataset.big === "1");
    }
  }, true);

  // ---------- 화면 전환 ----------
  function show(view) {
    ["main", "detail", "order", "manage", "edit"].forEach((v) => {
      $("view-" + v).hidden = v !== view;
    });
    currentView = view;
    updateBar();
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (currentView === "detail" || currentView === "edit") {
      const to = prevView;
      prevView = "main";
      if (to === "manage") return openManage();
      if (to === "order") { renderOrder(); return show("order"); }
      if (to === "detail" && editingId && byId(editingId)) return openDetail(editingId, "main");
      return showMain();
    }
    if (currentView === "manage" || currentView === "order") return showMain();
    showMain();
  }

  document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", goBack));

  function showMain() {
    renderMain();
    show("main");
  }

  // ---------- 검색 ----------
  function matches(s, q) {
    if (!q) return true;
    const hay = [s.nameKo, s.nameEn, ...(s.symptoms || [])].join(" ").toLowerCase();
    return hay.includes(q);
  }

  // ---------- 치료 순서 계산 ----------
  // 선택한 항목을 우선순위 숫자 순서로 정렬하고, 숫자가 같으면 한 묶음으로 만든다
  function orderGroups() {
    const items = data
      .filter((s) => selected.has(s.id))
      .sort((a, b) => a.priority - b.priority);
    const groups = [];
    items.forEach((s) => {
      const last = groups[groups.length - 1];
      if (last && last.priority === s.priority) last.items.push(s);
      else groups.push({ priority: s.priority, items: [s] });
    });
    return groups;
  }

  function rankLabel(i) { return circled[i] || (i + 1) + "."; }

  function orderHtml() {
    return orderGroups().map((g, i) => `
      <li class="group">
        <div class="group-head">
          <span class="num">${rankLabel(i)}</span>
          <span class="badge ${priorityClass(g.priority)}">${priorityLabel(g.priority)}</span>
          ${g.items.length > 1 ? `<span class="together">동시에 처리</span>` : ""}
        </div>
        ${g.items.map((s) => `
          <button class="order-item ${priorityClass(s.priority)}b" data-open="${esc(s.id)}">
            <strong>${esc(s.nameKo)}${s.nameEn ? ` (${esc(s.nameEn)})` : ""}</strong>
            <span class="arrow">→</span> ${esc(s.summary)}
          </button>`).join("")}
      </li>`).join("");
  }

  // ---------- 메인 화면 ----------
  function renderMain() {
    const q = $("search").value.trim().toLowerCase();
    const list = data.filter((s) => matches(s, q));

    // 선택한 항목들의 치료 순서 번호
    const rank = {};
    orderGroups().forEach((g, i) => g.items.forEach((s) => { rank[s.id] = i; }));

    $("grid").innerHTML = list.map((s) => {
      const on = selected.has(s.id);
      const pc = priorityClass(s.priority);
      return `
        <div class="card${on ? " selected" : ""}" data-toggle="${esc(s.id)}"
             role="button" tabindex="0" aria-pressed="${on}">
          <button class="info" data-open="${esc(s.id)}" title="자세한 정보" aria-label="자세한 정보">i</button>
          ${on ? `<span class="check" aria-hidden="true">✓</span>` : ""}
          ${iconHtml(s, false)}
          <div class="name-ko">${esc(s.nameKo)}</div>
          <div class="name-en">${esc(s.nameEn)}</div>
          <span class="badge ${pc}">우선순위 ${esc(s.priority)} · ${priorityLabel(s.priority)}</span>
          ${on ? `<div class="rank ${pc}t">치료 순서 ${rankLabel(rank[s.id])}</div>` : ""}
        </div>`;
    }).join("");
    $("empty").hidden = list.length > 0 || data.length === 0;

    $("quick-order").hidden = selected.size === 0;
    $("quick-order-list").innerHTML = orderHtml();
  }

  $("search").addEventListener("input", renderMain);

  // ---------- 상세 화면 ----------
  function renderDetail(id) {
    const s = byId(id);
    if (!s) return;
    const on = selected.has(s.id);
    const li = (arr) => (arr || []).map((t) => `<li>${esc(t)}</li>`).join("") || "<li class=\"muted\">(없음)</li>";
    $("detail").innerHTML = `
      <div class="detail" data-id="${esc(s.id)}">
        <div class="detail-head">
          ${iconHtml(s, true)}
          <div>
            <h2>${esc(s.nameKo)}${s.nameEn ? ` (${esc(s.nameEn)})` : ""}</h2>
            <span class="badge ${priorityClass(s.priority)}">
              우선순위 ${esc(s.priority)} · ${priorityLabel(s.priority)}
            </span>
          </div>
        </div>
        <h3>증상</h3>
        <ul>${li(s.symptoms)}</ul>
        <h3>치료법</h3>
        <ul>${li(s.treatment)}</ul>
        <div class="form-actions">
          <button class="btn${on ? " on" : ""}" data-toggle="${esc(s.id)}">
            ${on ? "✓ 선택됨 (해제)" : "+ 선택하기"}
          </button>
          <button class="btn" data-edit="${esc(s.id)}">수정</button>
        </div>
      </div>`;
  }

  function openDetail(id, from) {
    if (currentView !== "detail") prevView = from || currentView;
    renderDetail(id);
    show("detail");
  }

  // ---------- 치료 순서 화면 ----------
  function renderOrder() { $("order").innerHTML = orderHtml(); }

  // ---------- 선택 / 하단 바 ----------
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    refresh();
  }

  function refresh() {
    renderMain();
    if (currentView === "detail") {
      const id = $("detail").querySelector(".detail")?.dataset.id;
      if (id && byId(id)) renderDetail(id);
    }
    if (currentView === "order") renderOrder();
    updateBar();
  }

  function updateBar() {
    const n = selected.size;
    const showBar = n > 0 && (currentView === "main" || currentView === "detail");
    $("bar").hidden = !showBar;
    $("bar-open").textContent = `선택 ${n}개 · 치료 순서 보기`;
    document.body.classList.toggle("has-bar", showBar);
    $("fab").hidden = currentView === "manage" || currentView === "edit";
  }

  $("bar-open").addEventListener("click", () => { renderOrder(); show("order"); });
  $("bar-clear").addEventListener("click", () => { selected.clear(); refresh(); });

  // ---------- 내용 관리 화면 ----------
  function openManage() {
    $("manage-list").innerHTML = [...data]
      .sort((a, b) => a.priority - b.priority)
      .map((s) => `
        <li class="manage-item">
          <span class="badge ${priorityClass(s.priority)}">${esc(s.priority)}</span>
          <span class="manage-name">${esc(s.nameKo)} <small>${esc(s.nameEn)}</small></span>
          <button class="btn small" data-edit="${esc(s.id)}">수정</button>
          <button class="btn small danger" data-delete="${esc(s.id)}">삭제</button>
        </li>`).join("") || `<li class="muted">등록된 상태이상이 없습니다.</li>`;
    show("manage");
  }

  $("fab").addEventListener("click", () => openManage());
  $("add-new").addEventListener("click", () => openEdit(null));

  function deleteItem(id) {
    const s = byId(id);
    if (!s) return false;
    if (!confirm(`'${s.nameKo}' 항목을 삭제할까요?`)) return false;
    data = data.filter((x) => x.id !== id);
    selected.delete(id);
    saveData();
    renderMain();
    return true;
  }

  $("export").addEventListener("click", () => {
    const text =
`/*
  C:U 상태이상 응급 매뉴얼 - 데이터 파일 (앱에서 내보냄)

  ■ 새 상태이상 추가하는 방법
    1. 아래 { ... } 묶음 하나를 복사해서 마지막 묶음의 } 뒤에 쉼표(,)를 찍고 붙여넣는다.
    2. 각 칸을 고친다. priority 는 1이 가장 급함 (1=긴급, 2=빠르게, 3 이상=여유).
    3. 저장하고 브라우저를 새로고침(F5)한다.
    ※ 앱 안에서 바꾼 내용이 있으면 그 내용이 먼저 보인다. 이 파일 내용을 보려면
      앱의 [내용 관리 → 처음 데이터로 되돌리기]를 누른다.
*/

const STATUS_EFFECTS = ${JSON.stringify(data, null, 2)};
`;
    const blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $("reset").addEventListener("click", () => {
    if (!confirm("앱에서 바꾼 내용을 모두 지우고 data.js의 처음 내용으로 되돌릴까요?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    data = cloneDefault();
    [...selected].forEach((id) => { if (!byId(id)) selected.delete(id); });
    renderMain();
    openManage();
  });

  // ---------- 추가/수정 입력 화면 ----------
  const form = $("edit-form");

  function openEdit(id) {
    const s = id ? byId(id) : null;
    editingId = s ? s.id : null;
    if (currentView !== "edit") prevView = currentView;
    $("edit-title").textContent = s ? `수정: ${s.nameKo}` : "상태이상 추가";
    form.nameKo.value = s ? s.nameKo || "" : "";
    form.nameEn.value = s ? s.nameEn || "" : "";
    form.priority.value = s ? s.priority : 1;
    form.symptoms.value = s ? (s.symptoms || []).join("\n") : "";
    form.treatment.value = s ? (s.treatment || []).join("\n") : "";
    form.summary.value = s ? s.summary || "" : "";
    form.icon.value = s ? s.icon || "" : "";
    $("edit-delete").hidden = !s;
    $("form-error").hidden = true;
    show("edit");
    form.nameKo.focus();
  }

  function lines(text) {
    return text.split("\n").map((t) => t.trim()).filter(Boolean);
  }

  function makeId(nameEn) {
    let base = String(nameEn || "").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!base) base = "item";
    let id = base, n = 2;
    while (byId(id)) id = `${base}-${n++}`;
    return id;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameKo = form.nameKo.value.trim();
    const priority = Number(form.priority.value);
    let err = "";
    if (!nameKo) err = "한국어 이름을 입력해주세요.";
    else if (!Number.isInteger(priority) || priority < 1) err = "치료 우선순위는 1 이상의 정수로 입력해주세요.";
    if (err) {
      $("form-error").textContent = err;
      $("form-error").hidden = false;
      return;
    }

    const item = {
      id: editingId || makeId(form.nameEn.value),
      nameKo,
      nameEn: form.nameEn.value.trim(),
      icon: form.icon.value.trim(),
      priority,
      symptoms: lines(form.symptoms.value),
      treatment: lines(form.treatment.value),
      summary: form.summary.value.trim()
    };

    if (editingId) data = data.map((s) => (s.id === editingId ? item : s));
    else data.push(item);
    saveData();
    renderMain();
    goBack();
  });

  $("edit-cancel").addEventListener("click", goBack);
  $("edit-delete").addEventListener("click", () => {
    if (editingId && deleteItem(editingId)) {
      editingId = null;
      if (prevView === "detail") prevView = "main";
      goBack();
    }
  });

  // ---------- 클릭 처리 (한 곳에서) ----------
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");      // ⓘ 버튼, 치료 순서 항목
    if (open) { openDetail(open.dataset.open); return; }
    const edit = e.target.closest("[data-edit]");
    if (edit) { openEdit(edit.dataset.edit); return; }
    const del = e.target.closest("[data-delete]");
    if (del) { if (deleteItem(del.dataset.delete)) openManage(); return; }
    const t = e.target.closest("[data-toggle]");       // 카드 누르기 = 선택/해제
    if (t) toggle(t.dataset.toggle);
  });

  // 키보드로도 카드 선택 (Enter / Space)
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("card")) {
      e.preventDefault();
      toggle(e.target.dataset.toggle);
    }
  });

  // ---------- 시작 ----------
  if (typeof STATUS_EFFECTS !== "undefined") $("load-error").hidden = true;
  showMain();
})();
