// C:U 상태이상 응급 매뉴얼 - 동작 코드
// 내용 수정은 data.js 에서 한다. 이 파일은 고칠 필요 없다.

(function () {
  // data.js 를 못 불러왔으면 빈 화면 대신 안내문을 보여준다
  if (typeof STATUS_EFFECTS === "undefined" || !Array.isArray(STATUS_EFFECTS)) {
    document.getElementById("grid").innerHTML =
      '<p class="load-error">data.js 를 불러오지 못했습니다.<br>' +
      'index.html 과 data.js 가 같은 폴더에 있는지, data.js 에 문법 오류(쉼표, 따옴표 등)가 없는지 확인하세요.</p>';
    return;
  }
  const data = STATUS_EFFECTS;
  const selected = new Set();          // 담은 상태이상 id (새로고침하면 초기화)
  let prevView = "main";               // 상세 화면에서 돌아갈 화면

  const $ = (id) => document.getElementById(id);
  const byId = (id) => data.find((s) => s.id === id);
  const circled = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

  // ---------- 공통 도우미 ----------
  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
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
    // 이미지 파일을 못 찾으면 임시 아이콘으로 바꾼다
    return `<img class="icon${big ? " big" : ""}" src="${esc(s.icon)}" alt=""
             data-fallback="${esc(s.id)}" data-big="${big ? 1 : 0}">`;
  }

  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.fallback) {
      const s = byId(img.dataset.fallback);
      img.outerHTML = placeholderHtml(s, img.dataset.big === "1");
    }
  }, true);

  // ---------- 화면 전환 ----------
  function show(view) {
    ["main", "detail", "order"].forEach((v) => {
      $("view-" + v).hidden = v !== view;
    });
    currentView = view;
    window.scrollTo(0, 0);
  }
  let currentView = "main";

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentView === "detail") {
        if (prevView === "order") renderOrder();
        show(prevView);
      } else {
        show("main");
      }
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
          <span class="check${on ? " on" : ""}">${on ? "✓" : "+"}</span>
          ${iconHtml(s, false)}
          <div class="name-ko">${esc(s.nameKo)}</div>
          <div class="name-en">${esc(s.nameEn)}</div>
          <span class="badge ${priorityClass(s.priority)}">
            우선순위 ${esc(s.priority)} · ${priorityLabel(s.priority)}
          </span>
          <button class="info" data-open="${esc(s.id)}">상세 보기 ›</button>
        </div>`;
    }).join("");
    $("empty").hidden = list.length > 0;
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
      <h2>치료 순서 <span class="hint">(위에서부터 먼저)</span></h2>
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
      <div class="detail">
        <div class="detail-head">
          ${iconHtml(s, true)}
          <div>
            <h2>${esc(s.nameKo)} (${esc(s.nameEn)})</h2>
            <span class="badge ${priorityClass(s.priority)}">
              우선순위 ${esc(s.priority)} · ${priorityLabel(s.priority)}
            </span>
          </div>
        </div>
        <h3>증상</h3>
        <ul>${li(s.symptoms)}</ul>
        <h3>치료법</h3>
        <ul>${li(s.treatment)}</ul>
        <button class="btn${on ? " on" : ""}" data-toggle="${esc(s.id)}">
          ${on ? "✓ 담김 (빼기)" : "+ 담기"}
        </button>
      </div>`;
  }

  function openDetail(id) {
    prevView = currentView === "detail" ? prevView : currentView;
    renderDetail(id);
    show("detail");
  }

  // ---------- 치료 순서 화면 ----------
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

  // { 상태이상 id: "①" } 형태 - 카드에 몇 번째로 치료할지 표시할 때 사용
  function rankMap() {
    const map = {};
    orderGroups().forEach((g, i) => g.items.forEach((s) => { map[s.id] = rankLabel(i); }));
    return map;
  }

  function renderOrder() {
    $("order").innerHTML = orderHtml();
  }

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
            <strong>${esc(s.nameKo)} (${esc(s.nameEn)})</strong>
            <span class="arrow">→</span> ${esc(s.summary)}
          </button>`).join("")}
      </li>`).join("");
  }

  // ---------- 담기 / 하단 바 ----------
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    updateAll();
  }

  function updateBar() {
    const n = selected.size;
    $("bar").hidden = n === 0 || currentView === "order";
    $("bar-open").textContent = `선택 ${n}개 · 치료 순서 보기`;
  }

  function updateAll() {
    renderGrid();
    if (currentView === "detail") {
      const id = $("detail").querySelector("[data-toggle]")?.dataset.toggle;
      if (id) renderDetail(id);
    }
    if (currentView === "order") renderOrder();
    updateBar();
  }

  $("bar-open").addEventListener("click", () => {
    renderOrder();
    show("order");
    updateBar();
  });

  $("bar-clear").addEventListener("click", () => {
    selected.clear();
    updateAll();
  });

  // ---------- 클릭 처리 (한 곳에서) ----------
  document.addEventListener("click", (e) => {
    // "상세 보기" 버튼은 카드(선택) 안에 있으므로 먼저 확인한다
    const o = e.target.closest("[data-open]");
    if (o) { openDetail(o.dataset.open); updateBar(); return; }
    const t = e.target.closest("[data-toggle]");
    if (t) toggle(t.dataset.toggle);
  });

  // 뒤로가기 버튼 누른 뒤에도 하단 바 상태 갱신
  document.querySelectorAll("[data-back]").forEach((btn) =>
    btn.addEventListener("click", updateBar));

  // ---------- 시작 ----------
  renderGrid();
  updateBar();
})();
