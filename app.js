(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };

  var form = $("#request-form");
  var deptSel = $("#dept");
  var nameSel = $("#name");
  var submitBtn = $("#submit-btn");
  var banner = $("#banner");
  var configNotice = $("#config-notice");

  var members = []; // [{name, dept}]

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

  function showBanner(type, message) {
    banner.textContent = message;
    banner.className = "banner is-" + type;
    banner.hidden = false;
  }

  function hideBanner() {
    banner.hidden = true;
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

  function onDeptChange() {
    var dept = deptSel.value;
    if (!dept) {
      fillSelect(nameSel, [], "소속을 먼저 선택");
      nameSel.disabled = true;
      return;
    }
    var names = uniqueSorted(
      members.filter(function (m) { return m.dept === dept; }).map(function (m) { return m.name; })
    );
    fillSelect(nameSel, names, "이름 선택");
    nameSel.disabled = false;
  }

  function loadMembers() {
    return fetch(APPS_SCRIPT_URL + "?action=members", { method: "GET" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "명부를 불러오지 못했습니다.");
        members = data.members || [];
        fillSelect(deptSel, uniqueSorted(members.map(function (m) { return m.dept; })), "소속 선택");
        deptSel.disabled = false;
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
        showBanner("success", data.round + "회차 신청이 완료되었습니다. — " + payload.title);
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
  form.addEventListener("input", function (ev) {
    if (ev.target.classList) setInvalid(ev.target, false);
  });
  deptSel.addEventListener("change", onDeptChange);

  // ---------- 초기화 ----------

  if (!APPS_SCRIPT_URL) {
    configNotice.hidden = false;
    fillSelect(deptSel, [], "설정 필요");
    form.querySelectorAll("input, select, button").forEach(function (el) { el.disabled = true; });
    return;
  }

  deptSel.disabled = true;
  loadMembers().catch(function (err) {
    fillSelect(deptSel, [], "불러오기 실패");
    showBanner("error", "명부를 불러오지 못했습니다: " + err.message);
  });
})();
