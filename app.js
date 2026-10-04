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
  var mtDeptSel = $("#mt-dept");
  var mtNameSel = $("#mt-name");

  var selectPairs = [
    { dept: deptSel, name: nameSel },
    { dept: listDeptSel, name: listNameSel },
    { dept: mtDeptSel, name: mtNameSel },
  ];

  // ---------- 네비게이션 (hash 기반) ----------

  var SECTIONS = ["request", "list", "meeting", "admin"];
  var ADMIN_SESSION_KEY = "bookclub.admin";
  var currentSection = "request";

  function showSection(key) {
    if (SECTIONS.indexOf(key) === -1) key = "request";
    currentSection = key;
    document.querySelectorAll(".section").forEach(function (sec) {
      sec.hidden = sec.dataset.section !== key;
    });
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.classList.toggle("is-active", item.dataset.section === key);
    });
  }

  // 관리자 요청마다 서버가 비밀번호를 재검사하므로, 탭이 살아있는 동안 sessionStorage에 보관한다.
  function getAdminPassword() {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY) || ""; } catch (e) { return ""; }
  }

  function isAdminAuthed() {
    return !!getAdminPassword();
  }

  function setAdminAuthed(password) {
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, password); } catch (e) {}
  }

  function clearAdminAuthed() {
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {}
  }

  // 관리자 페이지는 인증된 세션(탭)에서만 열린다. 아니면 모달을 띄우고 현재 페이지에 머문다.
  function route() {
    var key = location.hash.replace("#", "");
    if (key === "admin" && !isAdminAuthed()) {
      openAdminModal();
      return;
    }
    showSection(key);
    if (key === "admin" && !adminMembersLoaded) loadAdminMembers();
    if (key === "meeting" && !meetingsLoaded) loadMeetingsDefault();
  }

  window.addEventListener("hashchange", route);
  // 첫 route()는 모달 요소가 준비된 뒤(아래 관리자 인증 모달 섹션 끝)에서 호출한다.

  // ---------- 배너 ----------

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showBanner(type, message, el) {
    el = el || banner;
    el.className = "banner is-" + type;

    var iconSvg = "";
    if (type === "success") {
      iconSvg = '<svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === "error") {
      iconSvg = '<svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    var htmlContent = "";
    var remainingMatch = message.match(/\(남은 지원금 ([^\)]+)\)/);

    if (remainingMatch) {
      var mainMsg = message.replace(remainingMatch[0], "").trim();
      var parts = mainMsg.split(" — ");
      var primaryText = parts[0];
      var subText = parts[1] ? ' <span class="banner-subtext">— ' + escapeHtml(parts[1]) + '</span>' : "";

      var remainingVal = remainingMatch[1];
      var isMinus = remainingVal.indexOf("-") !== -1;
      var badgeClass = isMinus ? "banner-badge is-over" : "banner-badge";
      var walletIcon = '<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="18" y1="12" x2="14" y2="12"/></svg>';

      htmlContent = '<div class="banner-body">' +
        '<div class="banner-title"><span class="banner-main-text">' + escapeHtml(primaryText) + '</span>' + subText + '</div>' +
        '<div class="' + badgeClass + '">' + walletIcon + '남은 지원금 <strong>' + escapeHtml(remainingVal) + '</strong></div>' +
        '</div>';
    } else {
      var parts = message.split(" — ");
      if (parts.length > 1) {
        htmlContent = '<div class="banner-body"><div class="banner-title"><span class="banner-main-text">' + escapeHtml(parts[0]) + '</span> <span class="banner-subtext">— ' + escapeHtml(parts[1]) + '</span></div></div>';
      } else {
        htmlContent = '<div class="banner-body"><div class="banner-title"><span class="banner-main-text">' + escapeHtml(message) + '</span></div></div>';
      }
    }

    var closeBtn = '<button type="button" class="banner-close" aria-label="닫기" title="닫기">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
      '</button>';

    el.innerHTML = '<div class="banner-icon-wrap">' + iconSvg + '</div>' + htmlContent + closeBtn;

    var btn = el.querySelector(".banner-close");
    if (btn) {
      btn.onclick = function () {
        el.hidden = true;
      };
    }

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

  // ---------- 신청 도서 확인 ----------

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

  var lastListQuery = null; // {dept, name} — 수정·삭제 후 다시 조회할 때 쓴다

  function renderList(data, dept, name) {
    var body = $("#list-body");
    body.innerHTML = "";

    if (data.items.length === 0) {
      var tr = document.createElement("tr");
      var td = cell("신청한 도서가 없습니다.", "empty-row");
      td.colSpan = 7;
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
      tr.appendChild(cell(it.status || "–", it.status ? "" : "muted"));

      var actTd = document.createElement("td");
      actTd.className = "actions";
      if (it.editable) {
        var edit = iconButton("", "수정", ICON_EDIT);
        edit.addEventListener("click", function () { openRequestModal(it, dept, name); });
        var del = iconButton("is-danger", "삭제", ICON_DELETE);
        del.addEventListener("click", function () {
          openConfirm({
            title: "신청 삭제",
            desc: "'" + it.title + "' 신청을 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.",
            okLabel: "삭제",
            run: function () {
              return postJson({ action: "request.delete", row: it.row, orig: { name: name, dept: dept, title: it.title, price: it.price } });
            },
            done: function () {
              showBanner("success", "신청을 삭제했습니다. — " + it.title, listBanner);
              refetchList();
            },
          });
        });
        actTd.appendChild(edit);
        actTd.appendChild(del);
      } else {
        actTd.textContent = "–";
        actTd.classList.add("muted");
        actTd.title = "현재 회차의 '신청완료' 상태인 신청만 수정·삭제할 수 있습니다.";
      }
      tr.appendChild(actTd);
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

  function fetchList(dept, name) {
    setListLoading(true);
    var url = APPS_SCRIPT_URL + "?action=list&dept=" + encodeURIComponent(dept) + "&name=" + encodeURIComponent(name);
    return fetch(url, { method: "GET" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
        // 서버가 재배포되지 않아 구버전 Code.gs가 응답하면 items가 없다.
        if (!Array.isArray(data.items)) {
          throw new Error("서버가 조회 기능을 지원하지 않습니다. Apps Script를 최신 Code.gs로 재배포해 주세요.");
        }
        lastListQuery = { dept: dept, name: name };
        renderList(data, dept, name);
      })
      .catch(function (err) {
        showBanner("error", err.message || "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", listBanner);
      })
      .finally(function () {
        setListLoading(false);
      });
  }

  function refetchList() {
    if (lastListQuery) fetchList(lastListQuery.dept, lastListQuery.name);
  }

  // Apps Script는 text/plain으로 보내야 CORS preflight 없이 응답한다.
  function postJson(body) {
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "요청에 실패했습니다.");
        return data;
      });
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

    listResult.hidden = true;
    fetchList(dept, name);
  });

  // --- 본인 신청 수정 모달 ---

  var requestModal = $("#request-modal");
  var requestForm = $("#request-edit-form");
  var requestError = $("#request-error");
  var requestSave = $("#request-save");
  var editingRequest = null; // {item, dept, name}

  function openRequestModal(it, dept, name) {
    editingRequest = { item: it, dept: dept, name: name };
    $("#request-modal-desc").textContent = dept + " " + name + " · " + it.round + "회차";
    $("#rq-title").value = it.title;
    $("#rq-publisher").value = it.publisher;
    $("#rq-price").value = String(it.price);
    $("#rq-link").value = it.link || "";
    requestError.hidden = true;
    requestForm.querySelectorAll("input").forEach(function (el) { setInvalid(el, false); });
    requestModal.hidden = false;
    setTimeout(function () { $("#rq-title").focus(); }, 0);
  }

  function closeRequestModal() {
    requestModal.hidden = true;
    editingRequest = null;
  }

  function showRequestError(msg, el) {
    requestError.textContent = msg;
    requestError.hidden = false;
    if (el) { setInvalid(el, true); el.focus(); }
  }

  function setRequestSaving(on) {
    requestSave.disabled = on;
    requestSave.querySelector("span").textContent = on ? "저장 중…" : "저장";
    requestForm.querySelectorAll("input").forEach(function (el) { el.disabled = on; });
  }

  $("#request-cancel").addEventListener("click", closeRequestModal);
  requestModal.addEventListener("click", function (ev) { if (ev.target === requestModal) closeRequestModal(); });
  requestForm.addEventListener("input", function (ev) {
    requestError.hidden = true;
    if (ev.target.classList) setInvalid(ev.target, false);
  });

  requestForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!editingRequest) return;
    var title = $("#rq-title").value.trim();
    var publisher = $("#rq-publisher").value.trim();
    var price = $("#rq-price").value.trim();
    var link = $("#rq-link").value.trim();

    if (!title) return showRequestError("도서명을 입력해 주세요.", $("#rq-title"));
    if (!publisher) return showRequestError("출판사를 입력해 주세요.", $("#rq-publisher"));
    if (!/^\d+$/.test(price) || Number(price) <= 0) return showRequestError("가격은 0보다 큰 정수로 입력해 주세요.", $("#rq-price"));
    if (link && !/^https?:\/\//i.test(link)) return showRequestError("링크는 http:// 또는 https:// 로 시작해야 합니다.", $("#rq-link"));

    var r = editingRequest;
    setRequestSaving(true);
    postJson({
      action: "request.update",
      row: r.item.row,
      orig: { name: r.name, dept: r.dept, title: r.item.title, price: r.item.price },
      title: title, publisher: publisher, price: price, link: link,
    })
      .then(function () {
        closeRequestModal();
        showBanner("success", "신청을 수정했습니다. — " + title, listBanner);
        refetchList();
      })
      .catch(function (err) {
        showRequestError(err.message);
      })
      .finally(function () { setRequestSaving(false); });
  });

  // ---------- 자율 모임 신청 ----------

  var SUPPORT_PER_PERSON = 15000;
  var meetingForm = $("#meeting-form");
  var mtDate = $("#mt-date");
  var mtCount = $("#mt-count");
  var mtBtn = $("#mt-btn");
  var mtBanner = $("#mt-banner");
  var mtBody = $("#mt-body");
  var mrFrom = $("#mr-from");
  var mrTo = $("#mr-to");

  var meetings = [];
  var meetingsLoaded = false;
  var lastMeetingRange = null; // {from, to} yyyyMMdd

  // "2026-04-28"(date input) ↔ "20260428"(시트) ↔ "2026.04.28"(표시)
  function inputToYmd(v) { return String(v || "").replace(/\D/g, ""); }
  function ymdToInput(ymd) { return ymd ? ymd.slice(0, 4) + "-" + ymd.slice(4, 6) + "-" + ymd.slice(6, 8) : ""; }
  function ymdDisplay(ymd) {
    if (!ymd) return "–";
    var d = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
    var day = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return ymd.slice(0, 4) + "." + ymd.slice(4, 6) + "." + ymd.slice(6, 8) + " (" + day + ")";
  }
  function todayInput() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function updateSupportPreview() {
    var n = Number(mtCount.value);
    $("#mt-support").textContent = won(n > 0 ? n * SUPPORT_PER_PERSON : 0);
  }
  mtCount.addEventListener("input", updateSupportPreview);

  function loadMeetings(from, to) {
    if (!APPS_SCRIPT_URL) return Promise.resolve();
    hideBanner(mtBanner);
    mtBody.innerHTML = '<tr><td class="empty-row" colspan="5">불러오는 중…</td></tr>';
    var url = APPS_SCRIPT_URL + "?action=meetings&from=" + encodeURIComponent(from || "") + "&to=" + encodeURIComponent(to || "");
    return fetch(url, { method: "GET" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
        if (!Array.isArray(data.items)) {
          throw new Error("서버가 자율 모임 기능을 지원하지 않습니다. Apps Script를 최신 Code.gs로 재배포해 주세요.");
        }
        meetings = data.items;
        if (data.supportPerPerson) SUPPORT_PER_PERSON = data.supportPerPerson;
        meetingsLoaded = true;
        lastMeetingRange = { from: from, to: to };
        renderMeetings();
      })
      .catch(function (err) {
        mtBody.innerHTML = '<tr><td class="empty-row" colspan="5">불러오지 못했습니다.</td></tr>';
        showBanner("error", err.message || "네트워크 오류가 발생했습니다.", mtBanner);
      });
  }

  function loadMeetingsDefault() {
    mrFrom.value = todayInput();
    mrTo.value = "";
    return loadMeetings(inputToYmd(mrFrom.value), "");
  }

  function reloadMeetings() {
    if (lastMeetingRange) loadMeetings(lastMeetingRange.from, lastMeetingRange.to);
  }

  function renderMeetings() {
    var me = mtNameSel.value;
    var totalPeople = meetings.reduce(function (s, m) { return s + m.count; }, 0);
    mtBody.innerHTML = "";
    $("#mt-count-label").textContent = meetings.length + "건";
    $("#mt-sum").textContent = "총 " + totalPeople + "명 · " + won(totalPeople * SUPPORT_PER_PERSON);

    if (meetings.length === 0) {
      mtBody.innerHTML = '<tr><td class="empty-row" colspan="5">해당 기간에 신청된 모임이 없습니다.</td></tr>';
      return;
    }

    meetings.forEach(function (m) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(ymdDisplay(m.date)));
      tr.appendChild(cell(m.count + "명", "num"));
      tr.appendChild(cell(m.leader || "–", m.leader ? "" : "muted"));
      tr.appendChild(cell(won(m.count * SUPPORT_PER_PERSON), "num"));

      var actTd = document.createElement("td");
      actTd.className = "actions";
      var mine = me && m.leader === me;
      if (m.editable && mine) {
        var edit = iconButton("", "수정", ICON_EDIT);
        edit.addEventListener("click", function () { openMeetingModal(m); });
        var del = iconButton("is-danger", "삭제", ICON_DELETE);
        del.addEventListener("click", function () {
          openConfirm({
            title: "모임 삭제",
            desc: ymdDisplay(m.date) + " " + m.count + "명 모임 신청을 삭제합니다.",
            okLabel: "삭제",
            run: function () {
              return postJson({
                action: "meeting.delete", row: m.row,
                orig: { date: m.date, leader: m.leader },
                leaderName: mtNameSel.value, leaderDept: mtDeptSel.value,
              });
            },
            done: function () {
              showBanner("success", "모임 신청을 삭제했습니다. — " + ymdDisplay(m.date), mtBanner);
              reloadMeetings();
            },
          });
        });
        actTd.appendChild(edit);
        actTd.appendChild(del);
      } else {
        actTd.textContent = "–";
        actTd.classList.add("muted");
        actTd.title = m.editable ? "대표인 본인만 수정·삭제할 수 있습니다." : "이미 지난 모임입니다.";
      }
      tr.appendChild(actTd);
      mtBody.appendChild(tr);
    });
  }

  // 대표인을 바꾸면 작업 버튼 표시가 달라진다
  mtNameSel.addEventListener("change", function () { if (meetingsLoaded) renderMeetings(); });
  mtDeptSel.addEventListener("change", function () { if (meetingsLoaded) renderMeetings(); });

  $("#meeting-range").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var from = inputToYmd(mrFrom.value), to = inputToYmd(mrTo.value);
    if (from && to && from > to) {
      showBanner("error", "시작일이 종료일보다 늦습니다.", mtBanner);
      return;
    }
    loadMeetings(from, to);
  });
  $("#mr-reset").addEventListener("click", loadMeetingsDefault);

  function setMeetingSubmitting(on) {
    mtBtn.disabled = on;
    mtBtn.querySelector("span").textContent = on ? "신청 중…" : "신청하기";
    meetingForm.querySelectorAll("input, select").forEach(function (el) {
      if (el === mtNameSel && !mtDeptSel.value) return;
      el.disabled = on;
    });
  }

  meetingForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    hideBanner(mtBanner);

    var date = inputToYmd(mtDate.value);
    var count = mtCount.value.trim();
    var dept = mtDeptSel.value, name = mtNameSel.value;

    var fail = function (el, msg) { setInvalid(el, true); el.focus(); showBanner("error", msg, mtBanner); };
    if (!date) return fail(mtDate, "일자를 선택해 주세요.");
    if (date < inputToYmd(todayInput())) return fail(mtDate, "오늘 이후 날짜만 신청할 수 있습니다.");
    if (!/^\d+$/.test(count) || Number(count) < 1) return fail(mtCount, "인원은 1명 이상의 정수로 입력해 주세요.");
    if (!dept) return fail(mtDeptSel, "대표인 소속을 선택해 주세요.");
    if (!name) return fail(mtNameSel, "대표인을 선택해 주세요.");
    if (!isMember(dept, name)) { setInvalid(mtDeptSel, true); return fail(mtNameSel, "소속과 이름을 확인하세요."); }

    setMeetingSubmitting(true);
    postJson({ action: "meeting.create", date: date, count: count, leaderName: name, leaderDept: dept })
      .then(function (data) {
        showBanner("success", ymdDisplay(date) + " " + count + "명 모임을 신청했습니다. (지원 금액 " + won(data.support || Number(count) * SUPPORT_PER_PERSON) + ")", mtBanner);
        mtDate.value = "";
        mtCount.value = "";
        updateSupportPreview();
        reloadMeetings();
      })
      .catch(function (err) {
        showBanner("error", err.message || "네트워크 오류가 발생했습니다.", mtBanner);
      })
      .finally(function () { setMeetingSubmitting(false); });
  });
  meetingForm.addEventListener("input", function (ev) { if (ev.target.classList) setInvalid(ev.target, false); });

  // --- 모임 수정 모달 ---

  var meetingModal = $("#meeting-modal");
  var meetingEditForm = $("#meeting-edit-form");
  var meetingError = $("#meeting-error");
  var meetingSave = $("#meeting-save");
  var editingMeeting = null;

  function openMeetingModal(m) {
    editingMeeting = m;
    $("#meeting-modal-desc").textContent = "대표인 " + m.leader;
    $("#me-date").value = ymdToInput(m.date);
    $("#me-date").min = todayInput();
    $("#me-count").value = String(m.count);
    meetingError.hidden = true;
    meetingEditForm.querySelectorAll("input").forEach(function (el) { setInvalid(el, false); });
    meetingModal.hidden = false;
    setTimeout(function () { $("#me-count").focus(); }, 0);
  }

  function closeMeetingModal() {
    meetingModal.hidden = true;
    editingMeeting = null;
  }

  function showMeetingError(msg, el) {
    meetingError.textContent = msg;
    meetingError.hidden = false;
    if (el) { setInvalid(el, true); el.focus(); }
  }

  $("#meeting-cancel").addEventListener("click", closeMeetingModal);
  meetingModal.addEventListener("click", function (ev) { if (ev.target === meetingModal) closeMeetingModal(); });
  meetingEditForm.addEventListener("input", function (ev) {
    meetingError.hidden = true;
    if (ev.target.classList) setInvalid(ev.target, false);
  });

  meetingEditForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!editingMeeting) return;
    var m = editingMeeting;
    var date = inputToYmd($("#me-date").value);
    var count = $("#me-count").value.trim();
    if (!date) return showMeetingError("일자를 선택해 주세요.", $("#me-date"));
    if (date < inputToYmd(todayInput())) return showMeetingError("오늘 이후 날짜만 가능합니다.", $("#me-date"));
    if (!/^\d+$/.test(count) || Number(count) < 1) return showMeetingError("인원은 1명 이상의 정수로 입력해 주세요.", $("#me-count"));

    meetingSave.disabled = true;
    meetingSave.querySelector("span").textContent = "저장 중…";
    postJson({
      action: "meeting.update", row: m.row,
      orig: { date: m.date, leader: m.leader },
      date: date, count: count, leaderName: mtNameSel.value, leaderDept: mtDeptSel.value,
    })
      .then(function () {
        closeMeetingModal();
        showBanner("success", "모임 신청을 수정했습니다. — " + ymdDisplay(date) + " " + count + "명", mtBanner);
        reloadMeetings();
      })
      .catch(function (err) { showMeetingError(err.message); })
      .finally(function () {
        meetingSave.disabled = false;
        meetingSave.querySelector("span").textContent = "저장";
      });
  });

  // ---------- 관리자 인증 모달 ----------

  var adminModal = $("#admin-modal");
  var adminForm = $("#admin-form");
  var adminPw = $("#admin-password");
  var adminError = $("#admin-error");
  var adminSubmit = $("#admin-submit");

  function openAdminModal() {
    adminPw.value = "";
    adminError.hidden = true;
    setInvalid(adminPw, false);
    adminModal.hidden = false;
    setTimeout(function () { adminPw.focus(); }, 0);
  }

  function closeAdminModal() {
    adminModal.hidden = true;
    // 해시는 #admin으로 바뀌어 있으므로 머물던 페이지로 되돌린다.
    if (location.hash.replace("#", "") === "admin") {
      history.replaceState(null, "", "#" + currentSection);
    }
    showSection(currentSection);
  }

  function showAdminError(msg) {
    adminError.textContent = msg;
    adminError.hidden = false;
    setInvalid(adminPw, true);
    adminPw.focus();
    adminPw.select();
  }

  $("#admin-cancel").addEventListener("click", closeAdminModal);
  adminModal.addEventListener("click", function (ev) {
    if (ev.target === adminModal) closeAdminModal();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !adminModal.hidden) closeAdminModal();
  });
  adminPw.addEventListener("input", function () {
    adminError.hidden = true;
    setInvalid(adminPw, false);
  });

  adminForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var password = adminPw.value;
    if (!password) { showAdminError("비밀번호를 입력해 주세요."); return; }

    adminSubmit.disabled = true;
    adminPw.disabled = true;

    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "auth", password: password }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "인증에 실패했습니다.");
        setAdminAuthed(password);
        adminModal.hidden = true;
        showSection("admin");
        loadAdminMembers();
      })
      .catch(function (err) {
        showAdminError(err.message || "네트워크 오류가 발생했습니다.");
      })
      .finally(function () {
        adminSubmit.disabled = false;
        adminPw.disabled = false;
      });
  });

  // ---------- 관리자: 탭 ----------

  document.querySelectorAll(".admin-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var key = tab.dataset.tab;
      document.querySelectorAll(".admin-tab").forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      document.querySelectorAll(".admin-panel").forEach(function (p) { p.hidden = p.dataset.panel !== key; });
      if (key === "requests" && !adminRequestsLoaded) loadAdminRequests();
    });
  });

  // ---------- 관리자: 회원 관리 ----------

  var adminBanner = $("#admin-banner");
  var memberBody = $("#member-body");
  var mfDept = $("#mf-dept");
  var mfName = $("#mf-name");
  var mfLocation = $("#mf-location");

  var adminMembers = [];      // [{row, name, dept, location, budget}]
  var adminMembersLoaded = false;

  // 관리자 API 호출. 비밀번호가 틀리면(바뀌었으면) 인증을 지우고 다시 묻는다.
  function adminFetch(op, payload) {
    var body = Object.assign({ action: "admin", op: op, password: getAdminPassword() }, payload || {});
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === "비밀번호가 올바르지 않습니다.") {
            clearAdminAuthed();
            openAdminModal();
          }
          throw new Error(data.error || "요청에 실패했습니다.");
        }
        return data;
      });
  }

  function fillOptions(select, values, keepValue) {
    var prev = keepValue ? select.value : "";
    select.innerHTML = "";
    var all = document.createElement("option");
    all.value = "";
    all.textContent = "전체";
    select.appendChild(all);
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if (prev && values.indexOf(prev) !== -1) select.value = prev;
  }

  function fillDatalist(id, values) {
    var dl = $("#" + id);
    dl.innerHTML = "";
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
  }

  function loadAdminMembers() {
    if (!isAdminAuthed()) return;
    hideBanner(adminBanner);
    memberBody.innerHTML = '<tr><td class="empty-row" colspan="5">불러오는 중…</td></tr>';
    return adminFetch("members.list")
      .then(function (data) {
        adminMembers = data.members || [];
        adminMembersLoaded = true;
        var depts = uniqueSorted(adminMembers.map(function (m) { return m.dept; }).filter(Boolean));
        var locs = uniqueSorted(adminMembers.map(function (m) { return m.location; }).filter(Boolean));
        fillOptions(mfDept, depts, true);
        fillOptions(mfLocation, locs, true);
        fillDatalist("dept-options", depts);
        fillDatalist("location-options", locs);
        renderMembers();
      })
      .catch(function (err) {
        memberBody.innerHTML = '<tr><td class="empty-row" colspan="5">불러오지 못했습니다.</td></tr>';
        showBanner("error", err.message, adminBanner);
      });
  }

  function filteredMembers() {
    var dept = mfDept.value;
    var name = mfName.value.trim();
    var loc = mfLocation.value;
    return adminMembers.filter(function (m) {
      if (dept && m.dept !== dept) return false;
      if (loc && m.location !== loc) return false;
      if (name && m.name.indexOf(name) === -1) return false;
      return true;
    });
  }

  function iconButton(cls, title, svg) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn-icon-only " + cls;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = svg;
    return b;
  }

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

  function renderMembers() {
    var list = filteredMembers();
    memberBody.innerHTML = "";
    $("#member-count").textContent = list.length + "명" + (list.length !== adminMembers.length ? " / 전체 " + adminMembers.length + "명" : "");

    if (list.length === 0) {
      memberBody.innerHTML = '<tr><td class="empty-row" colspan="5">' +
        (adminMembers.length ? "조건에 맞는 회원이 없습니다." : "등록된 회원이 없습니다.") + "</td></tr>";
      return;
    }

    list.forEach(function (m) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(m.name));
      tr.appendChild(cell(m.dept));
      tr.appendChild(cell(m.location || "–", m.location ? "" : "muted"));
      tr.appendChild(cell(won(m.budget), "num"));
      var td = document.createElement("td");
      td.className = "actions";
      var edit = iconButton("", "수정", ICON_EDIT);
      edit.addEventListener("click", function () { openMemberModal(m); });
      var del = iconButton("is-danger", "삭제", ICON_DELETE);
      del.addEventListener("click", function () {
        openConfirm({
          title: "회원 삭제",
          desc: m.dept + " " + m.name + " 회원을 명부에서 삭제합니다. 이 회원의 신청 내역은 남습니다.",
          okLabel: "삭제",
          run: function () { return adminFetch("members.delete", { row: m.row, orig: { name: m.name, dept: m.dept } }); },
          done: function () {
            showBanner("success", "회원을 삭제했습니다. — " + m.dept + " " + m.name, adminBanner);
            loadAdminMembers();
          },
        });
      });
      td.appendChild(edit);
      td.appendChild(del);
      tr.appendChild(td);
      memberBody.appendChild(tr);
    });
  }

  mfDept.addEventListener("change", renderMembers);
  mfLocation.addEventListener("change", renderMembers);
  mfName.addEventListener("input", renderMembers);
  $("#member-filter").addEventListener("submit", function (ev) { ev.preventDefault(); });
  $("#mf-reset").addEventListener("click", function () {
    mfDept.value = "";
    mfName.value = "";
    mfLocation.value = "";
    renderMembers();
  });
  $("#member-reload").addEventListener("click", loadAdminMembers);

  // --- 회원 추가/수정 모달 ---

  var memberModal = $("#member-modal");
  var memberForm = $("#member-form");
  var memberError = $("#member-error");
  var memberSave = $("#member-save");
  var editingMember = null; // null이면 추가, 아니면 수정 대상

  function openMemberModal(member) {
    editingMember = member || null;
    $("#member-modal-title").textContent = member ? "회원 수정" : "회원 추가";
    $("#mm-name").value = member ? member.name : "";
    $("#mm-dept").value = member ? member.dept : "";
    $("#mm-location").value = member ? member.location : "";
    $("#mm-budget").value = member ? String(member.budget) : "";
    memberError.hidden = true;
    memberForm.querySelectorAll("input").forEach(function (el) { setInvalid(el, false); });
    memberModal.hidden = false;
    setTimeout(function () { $("#mm-name").focus(); }, 0);
  }

  function closeMemberModal() {
    memberModal.hidden = true;
    editingMember = null;
  }

  function showMemberError(msg, el) {
    memberError.textContent = msg;
    memberError.hidden = false;
    if (el) { setInvalid(el, true); el.focus(); }
  }

  function setMemberSaving(on) {
    memberSave.disabled = on;
    memberSave.querySelector("span").textContent = on ? "저장 중…" : "저장";
    memberForm.querySelectorAll("input").forEach(function (el) { el.disabled = on; });
  }

  $("#member-add").addEventListener("click", function () { openMemberModal(null); });
  $("#member-cancel").addEventListener("click", closeMemberModal);
  memberModal.addEventListener("click", function (ev) { if (ev.target === memberModal) closeMemberModal(); });
  memberForm.addEventListener("input", function (ev) {
    memberError.hidden = true;
    if (ev.target.classList) setInvalid(ev.target, false);
  });

  memberForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("#mm-name").value.trim();
    var dept = $("#mm-dept").value.trim();
    var location = $("#mm-location").value.trim();
    var budget = $("#mm-budget").value.trim();

    if (!name) return showMemberError("이름을 입력해 주세요.", $("#mm-name"));
    if (!dept) return showMemberError("소속을 입력해 주세요.", $("#mm-dept"));
    if (!/^\d+$/.test(budget)) return showMemberError("지원금은 0 이상의 정수로 입력해 주세요.", $("#mm-budget"));

    var dup = adminMembers.some(function (m) {
      return m.name === name && m.dept === dept && (!editingMember || m.row !== editingMember.row);
    });
    if (dup) return showMemberError("이미 같은 소속에 같은 이름의 회원이 있습니다.", $("#mm-name"));

    var payload = { name: name, dept: dept, location: location, budget: budget };
    var op = "members.create";
    if (editingMember) {
      op = "members.update";
      payload.row = editingMember.row;
      payload.orig = { name: editingMember.name, dept: editingMember.dept };
    }

    setMemberSaving(true);
    adminFetch(op, payload)
      .then(function (data) {
        var msg = editingMember ? "회원 정보를 수정했습니다." : "회원을 추가했습니다.";
        if (data.renamedRequests) msg += " (신청 내역 " + data.renamedRequests + "건의 이름·소속도 함께 변경)";
        closeMemberModal();
        showBanner("success", msg + " — " + dept + " " + name, adminBanner);
        return loadAdminMembers();
      })
      .catch(function (err) {
        if (!memberModal.hidden) showMemberError(err.message);
      })
      .finally(function () { setMemberSaving(false); });
  });

  // --- 삭제 확인 모달 (회원 삭제 · 본인 신청 삭제 공용) ---

  var confirmModal = $("#confirm-modal");
  var confirmError = $("#confirm-error");
  var confirmOk = $("#confirm-ok");
  var confirmPending = null; // {title, desc, okLabel, run(): Promise, done(data)}

  function openConfirm(opts) {
    confirmPending = opts;
    $("#confirm-title").textContent = opts.title;
    $("#confirm-desc").textContent = opts.desc;
    confirmOk.querySelector("span").textContent = opts.okLabel || "삭제";
    confirmError.hidden = true;
    confirmModal.hidden = false;
    setTimeout(function () { confirmOk.focus(); }, 0);
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
    confirmPending = null;
  }

  $("#confirm-cancel").addEventListener("click", closeConfirmModal);
  confirmModal.addEventListener("click", function (ev) { if (ev.target === confirmModal) closeConfirmModal(); });

  confirmOk.addEventListener("click", function () {
    if (!confirmPending) return;
    var p = confirmPending;
    var label = p.okLabel || "삭제";
    confirmOk.disabled = true;
    confirmOk.querySelector("span").textContent = label + " 중…";
    p.run()
      .then(function (data) {
        closeConfirmModal();
        if (p.done) p.done(data);
      })
      .catch(function (err) {
        confirmError.textContent = err.message;
        confirmError.hidden = false;
      })
      .finally(function () {
        confirmOk.disabled = false;
        confirmOk.querySelector("span").textContent = label;
      });
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!memberModal.hidden) closeMemberModal();
    if (!meetingModal.hidden) closeMeetingModal();
    if (!requestModal.hidden) closeRequestModal();
    if (!confirmModal.hidden) closeConfirmModal();
  });

  // ---------- 관리자: 신청도서 관리 ----------

  var reqBanner = $("#req-banner");
  var reqBody = $("#req-body");
  var rf = {
    dept: $("#rf-dept"),
    name: $("#rf-name"),
    location: $("#rf-location"),
    round: $("#rf-round"),
    status: $("#rf-status"),
    book: $("#rf-book"),
  };

  var adminRequests = [];
  var adminRequestsLoaded = false;

  function loadAdminRequests() {
    if (!isAdminAuthed()) return;
    hideBanner(reqBanner);
    reqBody.innerHTML = '<tr><td class="empty-row" colspan="11">불러오는 중…</td></tr>';
    return adminFetch("requests.list")
      .then(function (data) {
        if (!Array.isArray(data.items)) {
          throw new Error("서버가 신청도서 관리를 지원하지 않습니다. Apps Script를 최신 Code.gs로 재배포해 주세요.");
        }
        adminRequests = data.items;
        adminRequestsLoaded = true;
        var pick = function (key) { return uniqueSorted(adminRequests.map(function (it) { return it[key]; }).filter(Boolean)); };
        fillOptions(rf.dept, pick("dept"), true);
        fillOptions(rf.location, pick("location"), true);
        fillOptions(rf.status, pick("status"), true);
        // 회차는 숫자 내림차순
        var rounds = Array.from(new Set(adminRequests.map(function (it) { return it.round; }).filter(Boolean)))
          .sort(function (a, b) { return b - a; })
          .map(String);
        fillOptions(rf.round, rounds, true);
        renderRequests();
      })
      .catch(function (err) {
        reqBody.innerHTML = '<tr><td class="empty-row" colspan="11">불러오지 못했습니다.</td></tr>';
        showBanner("error", err.message, reqBanner);
      });
  }

  function filteredRequests() {
    var dept = rf.dept.value, name = rf.name.value.trim(), loc = rf.location.value;
    var round = rf.round.value, status = rf.status.value, book = rf.book.value.trim();
    return adminRequests.filter(function (it) {
      if (dept && it.dept !== dept) return false;
      if (loc && it.location !== loc) return false;
      if (round && String(it.round) !== round) return false;
      if (status && it.status !== status) return false;
      if (name && it.name.indexOf(name) === -1) return false;
      if (book && it.title.indexOf(book) === -1 && it.publisher.indexOf(book) === -1) return false;
      return true;
    }).sort(function (a, b) {
      // 최신 회차 → 최신 신청일자 순
      if (b.round !== a.round) return b.round - a.round;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }

  function activeFilterSummary() {
    var parts = [];
    if (rf.dept.value) parts.push("소속: " + rf.dept.value);
    if (rf.name.value.trim()) parts.push("이름: " + rf.name.value.trim());
    if (rf.location.value) parts.push("위치: " + rf.location.value);
    if (rf.round.value) parts.push("회차: " + rf.round.value + "회차");
    if (rf.status.value) parts.push("단계: " + rf.status.value);
    if (rf.book.value.trim()) parts.push("도서/출판사: " + rf.book.value.trim());
    return parts.length ? parts.join(" · ") : "전체";
  }

  function renderRequests() {
    var list = filteredRequests();
    var total = list.reduce(function (s, it) { return s + it.price; }, 0);
    reqBody.innerHTML = "";
    $("#req-count").textContent = list.length + "건" + (list.length !== adminRequests.length ? " / 전체 " + adminRequests.length + "건" : "");
    $("#req-sum").textContent = "합계 " + won(total);

    if (list.length === 0) {
      reqBody.innerHTML = '<tr><td class="empty-row" colspan="11">' +
        (adminRequests.length ? "조건에 맞는 신청이 없습니다." : "신청 내역이 없습니다.") + "</td></tr>";
      return;
    }

    list.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(it.name));
      tr.appendChild(cell(it.dept));
      tr.appendChild(cell(it.location || "–", it.location ? "" : "muted"));
      tr.appendChild(cell(it.title));
      tr.appendChild(cell(it.publisher));
      tr.appendChild(cell(won(it.price), "num"));
      tr.appendChild(cell(it.round ? it.round + "회차" : "–", "num"));
      tr.appendChild(cell(it.status || "–", it.status ? "" : "muted"));
      tr.appendChild(cell(it.date || "–", it.date ? "" : "muted"));

      var linkTd = document.createElement("td");
      if (it.link) {
        var a = document.createElement("a");
        a.href = it.link; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.className = "table-link"; a.textContent = "열기";
        linkTd.appendChild(a);
        var pt = document.createElement("span");
        pt.className = "print-only";
        pt.textContent = "있음";
        linkTd.appendChild(pt);
      } else {
        linkTd.textContent = "–";
        linkTd.className = "muted";
      }
      tr.appendChild(linkTd);

      if (it.remaining === null || it.remaining === undefined) {
        tr.appendChild(cell("명부 없음", "num muted"));
      } else {
        var over = it.remaining < 0;
        tr.appendChild(cell(won(it.remaining) + (over ? " (초과)" : ""), "num" + (over ? " cell-over" : "")));
      }
      reqBody.appendChild(tr);
    });
  }

  Object.keys(rf).forEach(function (k) {
    rf[k].addEventListener(rf[k].tagName === "SELECT" ? "change" : "input", renderRequests);
  });
  $("#req-filter").addEventListener("submit", function (ev) { ev.preventDefault(); });
  $("#rf-reset").addEventListener("click", function () {
    Object.keys(rf).forEach(function (k) { rf[k].value = ""; });
    renderRequests();
  });
  $("#req-reload").addEventListener("click", loadAdminRequests);

  // --- PDF 생성 (jsPDF). 인쇄 창을 거치지 않아 모바일에서도 파일로 내려받을 수 있다. ---

  var PDF_LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js",
  ];
  var PDF_FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf";
  var PDF_FONT_NAME = "NanumGothic";
  var loadedScripts = {};
  var pdfFontBase64 = null;

  function loadScriptOnce(url) {
    if (!loadedScripts[url]) {
      loadedScripts[url] = new Promise(function (resolve, reject) {
        var el = document.createElement("script");
        el.src = url;
        el.onload = resolve;
        el.onerror = function () { delete loadedScripts[url]; reject(new Error("라이브러리를 불러오지 못했습니다: " + url)); };
        document.head.appendChild(el);
      });
    }
    return loadedScripts[url];
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var chunk = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(""));
  }

  function loadPdfFont() {
    if (pdfFontBase64) return Promise.resolve(pdfFontBase64);
    return fetch(PDF_FONT_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("한글 글꼴을 불러오지 못했습니다.");
        return res.arrayBuffer();
      })
      .then(function (buf) {
        pdfFontBase64 = arrayBufferToBase64(buf);
        return pdfFontBase64;
      });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function buildRequestsPdf(fontBase64) {
    var list = filteredRequests();
    var total = list.reduce(function (s, it) { return s + it.price; }, 0);
    var now = new Date();
    var stamp = now.getFullYear() + "." + pad2(now.getMonth() + 1) + "." + pad2(now.getDate()) + " " + pad2(now.getHours()) + ":" + pad2(now.getMinutes());

    var doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.addFileToVFS(PDF_FONT_NAME + ".ttf", fontBase64);
    doc.addFont(PDF_FONT_NAME + ".ttf", PDF_FONT_NAME, "normal");
    doc.setFont(PDF_FONT_NAME);

    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 12;

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text("희망도서 신청 내역", margin, 16);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text("출력일시 " + stamp + "  |  조건: " + activeFilterSummary() + "  |  " + list.length + "건, 합계 " + won(total), margin, 22);

    var body = list.map(function (it) {
      var remaining = (it.remaining === null || it.remaining === undefined)
        ? "명부 없음"
        : won(it.remaining) + (it.remaining < 0 ? " (초과)" : "");
      return [
        it.name, it.dept, it.location || "–", it.title, it.publisher,
        won(it.price), it.round ? it.round + "회차" : "–", it.status || "–",
        it.date || "–", it.link ? "있음" : "–", remaining,
      ];
    });

    doc.autoTable({
      head: [["이름", "소속", "위치", "도서", "출판사", "가격", "회차", "단계", "신청일자", "링크", "잔액"]],
      body: body,
      startY: 27,
      margin: { left: margin, right: margin, bottom: 14 },
      styles: { font: PDF_FONT_NAME, fontSize: 8, cellPadding: 1.8, lineColor: [187, 187, 187], lineWidth: 0.2, textColor: 0, overflow: "linebreak" },
      headStyles: { fillColor: [238, 238, 238], textColor: 0, fontStyle: "normal" },
      columnStyles: {
        3: { cellWidth: 70 },
        5: { halign: "right" },
        6: { halign: "right" },
        10: { halign: "right" },
      },
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index === 10 && /초과/.test(data.cell.raw)) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: function () {
        var n = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(String(n), pageW - margin, pageH - 7, { align: "right" });
      },
    });

    // 전체 페이지 수가 확정된 뒤 "n / N" 형식으로 다시 쓴다.
    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(255, 255, 255);
      doc.rect(pageW - margin - 20, pageH - 11, 20, 6, "F");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(i + " / " + pages, pageW - margin, pageH - 7, { align: "right" });
    }

    var fileName = "희망도서_신청내역_" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + ".pdf";
    return { doc: doc, fileName: fileName };
  }

  function setPdfBusy(on) {
    var btn = $("#req-print");
    btn.disabled = on;
    btn.querySelector("span").textContent = on ? "PDF 만드는 중…" : "PDF 저장";
  }

  $("#req-print").addEventListener("click", function () {
    if (!adminRequestsLoaded) return;
    hideBanner(reqBanner);
    setPdfBusy(true);

    Promise.all([
      loadScriptOnce(PDF_LIBS[0]).then(function () { return loadScriptOnce(PDF_LIBS[1]); }),
      loadPdfFont(),
    ])
      .then(function (results) {
        var out = buildRequestsPdf(results[1]);
        try {
          out.doc.save(out.fileName);
        } catch (e) {
          // 앱 내 브라우저 등 다운로드가 막힌 환경: 새 탭으로 열어 공유/저장하게 한다.
          window.open(out.doc.output("bloburl"), "_blank");
        }
        showBanner("success", "PDF를 만들었습니다. — " + out.fileName, reqBanner);
      })
      .catch(function (err) {
        showBanner("error", "PDF를 만들지 못했습니다: " + (err.message || err), reqBanner);
      })
      .finally(function () { setPdfBusy(false); });
  });

  route();

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
