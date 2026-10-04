(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };

  var form = $("#request-form");
  var deptSel = $("#dept");
  var nameSel = $("#name");
  var submitBtn = $("#submit-btn");
  var banner = $("#banner");
  var configNotice = $("#config-notice");

  var listForm = $("#list-form");
  var listDeptSel = $("#list-dept");
  var listNameSel = $("#list-name");
  var listBtn = $("#list-btn");
  var listBanner = $("#list-banner");
  var listResult = $("#list-result");

  var members = []; // [{name, dept}]

  // 소속→이름 연동 드롭다운 쌍. 신청 폼과 조회 폼이 같은 구조를 공유한다.
  var selectPairs = [
    { dept: deptSel, name: nameSel },
    { dept: listDeptSel, name: listNameSel },
  ];

  // ---------- 네비게이션 (hash 기반) ----------

  var SECTIONS = ["request", "list", "balance"];

  function showSection(key) {
    if (SECTIONS.indexOf(key) === -1) key = "request";
    document.querySelectorAll(".section").forEach(function (sec) {
      sec.hidden = sec.dataset.section !== key;
    });
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.classList.toggle("is-active", item.dataset.section === key);
    });
  }

  window.addEventListener("hashchange", function () {
    showSection(location.hash.replace("#", ""));
  });
  showSection(location.hash.replace("#", ""));

  // ---------- 배너 ----------

  function showBanner(type, message, el) {
    el = el || banner;
    el.textContent = message;
    el.className = "banner is-" + type;
    el.hidden = false;
  }

  function hideBanner(el) {
    (el || banner).hidden = true;
  }

  function won(n) {
    return Number(n).toLocaleString("ko-KR") + "원";
  }

  // ---------- 명부 로드 → 드롭다운 ----------

  function fillSelect(select, values, placeholder) {
    select.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    select.appendChild(ph);
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function uniqueSorted(arr) {
    // 코드포인트 순 정렬: 숫자 → 영문 → 한글(가나다) 순. 구글 시트의 오름차순 정렬과 같다.
    return Array.from(new Set(arr)).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }

  function onDeptChange(pair) {
    var dept = pair.dept.value;
    if (!dept) {
      fillSelect(pair.name, [], "소속을 먼저 선택");
      pair.name.disabled = true;
      return;
    }
    var names = uniqueSorted(
      members.filter(function (m) { return m.dept === dept; }).map(function (m) { return m.name; })
    );
    fillSelect(pair.name, names, "이름 선택");
    pair.name.disabled = false;
  }

  function isMember(dept, name) {
    return members.some(function (m) { return m.dept === dept && m.name === name; });
  }

  function loadMembers() {
    return fetch(APPS_SCRIPT_URL + "?action=members", { method: "GET" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "명부를 불러오지 못했습니다.");
        members = data.members || [];
        var depts = uniqueSorted(members.map(function (m) { return m.dept; }));
        selectPairs.forEach(function (pair) {
          fillSelect(pair.dept, depts, "소속 선택");
          pair.dept.disabled = false;
        });
      });
  }

  // ---------- 검증 ----------

  function setInvalid(el, invalid) {
    el.classList.toggle("is-invalid", invalid);
  }

  function validateForm() {
    var fields = [
      { el: deptSel, msg: "소속을 선택해 주세요." },
      { el: nameSel, msg: "이름을 선택해 주세요." },
      { el: $("#title"), msg: "도서명을 입력해 주세요." },
      { el: $("#publisher"), msg: "출판사를 입력해 주세요." },
      { el: $("#price"), msg: "가격을 입력해 주세요." },
    ];

    var firstError = null;
    fields.forEach(function (f) {
      var empty = !f.el.value.trim();
      setInvalid(f.el, empty);
      if (empty && !firstError) firstError = f;
    });
    if (firstError) {
      firstError.el.focus();
      return firstError.msg;
    }

    // 소속·이름 조합이 명부에 있는지 확인 (서버에서도 다시 검사한다)
    if (!isMember(deptSel.value, nameSel.value)) {
      setInvalid(deptSel, true);
      setInvalid(nameSel, true);
      deptSel.focus();
      return "소속과 이름을 확인하세요.";
    }

    var price = $("#price");
    if (!/^\d+$/.test(price.value.trim()) || Number(price.value) <= 0) {
      setInvalid(price, true);
      price.focus();
      return "가격은 0보다 큰 정수로 입력해 주세요.";
    }

    var link = $("#link");
    var linkVal = link.value.trim();
    if (linkVal && !/^https?:\/\//i.test(linkVal)) {
      setInvalid(link, true);
      link.focus();
      return "링크는 http:// 또는 https:// 로 시작해야 합니다.";
    }
    setInvalid(link, false);

    return null;
  }

  // ---------- 제출 ----------

  function setSubmitting(on) {
    submitBtn.disabled = on;
    if (on) {
      submitBtn.innerHTML = '<span>신청 중…</span>';
    } else {
      submitBtn.innerHTML = '<span>신청하기</span><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>';
    }
    form.querySelectorAll("input, select").forEach(function (el) {
      if (el === nameSel && !deptSel.value) return; // 이름은 소속 미선택 시 원래 비활성
      el.disabled = on;
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    hideBanner();

    var error = validateForm();
    if (error) {
      showBanner("error", error);
      return;
    }

    var payload = {
      dept: deptSel.value,
      name: nameSel.value,
      title: $("#title").value.trim(),
      publisher: $("#publisher").value.trim(),
      price: $("#price").value.trim(),
      link: $("#link").value.trim(),
    };

    setSubmitting(true);

    // Apps Script는 text/plain으로 보내야 CORS preflight 없이 응답한다.
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "신청에 실패했습니다.");
        var msg = data.round + "회차 신청이 완료되었습니다. — " + payload.title;
        if (typeof data.remaining === "number") {
          msg += " (남은 지원금 " + data.remaining.toLocaleString("ko-KR") + "원)";
        }
        showBanner("success", msg);
        // 소속·이름은 유지, 나머지만 초기화
        ["#title", "#publisher", "#price", "#link"].forEach(function (sel) { $(sel).value = ""; });
        $("#title").focus();
      })
      .catch(function (err) {
        showBanner("error", err.message || "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(function () {
        setSubmitting(false);
      });
  });

  // 입력 시 에러 표시 해제
  [form, listForm].forEach(function (f) {
    f.addEventListener("input", function (ev) {
      if (ev.target.classList) setInvalid(ev.target, false);
    });
  });
  selectPairs.forEach(function (pair) {
    pair.dept.addEventListener("change", function () { onDeptChange(pair); });
  });

  // ---------- 신청 도서 조회 ----------

  function setListLoading(on) {
    listBtn.disabled = on;
    listBtn.querySelector("span").textContent = on ? "조회 중…" : "조회하기";
    listDeptSel.disabled = on;
    listNameSel.disabled = on || !listDeptSel.value;
  }

  function cell(text, cls) {
    var td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function renderList(data, dept, name) {
    var body = $("#list-body");
    body.innerHTML = "";

    if (data.items.length === 0) {
      var tr = document.createElement("tr");
      var td = cell("신청한 도서가 없습니다.", "empty-row");
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
    }

    data.items.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(it.title));
      tr.appendChild(cell(it.publisher));
      tr.appendChild(cell(won(it.price), "num"));
      tr.appendChild(cell(it.round ? it.round + "회차" : "", "num"));
      var linkTd = document.createElement("td");
      if (it.link) {
        var a = document.createElement("a");
        a.href = it.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "table-link";
        a.textContent = "열기";
        linkTd.appendChild(a);
      } else {
        linkTd.textContent = "–";
        linkTd.className = "muted";
      }
      tr.appendChild(linkTd);
      body.appendChild(tr);
    });

    $("#list-result-title").textContent = dept + " · " + name;
    $("#list-result-count").textContent = data.items.length + "건";
    $("#list-used").textContent = won(data.used);
    $("#list-remaining").textContent = won(data.remaining);
    $("#list-budget").textContent = "지원금 " + won(data.budget);
    listResult.classList.toggle("is-over", data.remaining < 0);
    listResult.hidden = false;
  }

  listForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    hideBanner(listBanner);

    var dept = listDeptSel.value;
    var name = listNameSel.value;
    setInvalid(listDeptSel, !dept);
    setInvalid(listNameSel, !name);
    if (!dept) { listDeptSel.focus(); showBanner("error", "소속을 선택해 주세요.", listBanner); return; }
    if (!name) { listNameSel.focus(); showBanner("error", "이름을 선택해 주세요.", listBanner); return; }
    if (!isMember(dept, name)) {
      setInvalid(listDeptSel, true);
      setInvalid(listNameSel, true);
      showBanner("error", "소속과 이름을 확인하세요.", listBanner);
      return;
    }

    setListLoading(true);
    listResult.hidden = true;

    var url = APPS_SCRIPT_URL + "?action=list&dept=" + encodeURIComponent(dept) + "&name=" + encodeURIComponent(name);
    fetch(url, { method: "GET" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
        // 서버가 재배포되지 않아 구버전 Code.gs가 응답하면 items가 없다.
        if (!Array.isArray(data.items)) {
          throw new Error("서버가 조회 기능을 지원하지 않습니다. Apps Script를 최신 Code.gs로 재배포해 주세요.");
        }
        renderList(data, dept, name);
      })
      .catch(function (err) {
        showBanner("error", err.message || "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", listBanner);
      })
      .finally(function () {
        setListLoading(false);
      });
  });

    if (ev.target.classList) setInvalid(ev.target, false);
  });
  deptSel.addEventListener("change", onDeptChange);

  // ---------- 초기화 ----------

  if (!APPS_SCRIPT_URL) {
    configNotice.hidden = false;
    selectPairs.forEach(function (pair) { fillSelect(pair.dept, [], "설정 필요"); });
    [form, listForm].forEach(function (f) {
      f.querySelectorAll("input, select, button").forEach(function (el) { el.disabled = true; });
    });
    return;
  }

  selectPairs.forEach(function (pair) { pair.dept.disabled = true; });
  loadMembers().catch(function (err) {
    selectPairs.forEach(function (pair) { fillSelect(pair.dept, [], "불러오기 실패"); });
    showBanner("error", "명부를 불러오지 못했습니다: " + err.message);
    showBanner("error", "명부를 불러오지 못했습니다: " + err.message, listBanner);
  });
})();
