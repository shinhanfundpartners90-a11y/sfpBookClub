/**
 * 독서동호회 희망도서 신청 — Google Apps Script 웹 앱
 *
 * 이 파일의 내용을 스프레드시트의 [확장 프로그램 → Apps Script] 편집기에 붙여넣고
 * [배포 → 새 배포 → 웹 앱] (실행 사용자: 나 / 액세스: 모든 사용자)로 배포한다.
 *
 * 시트 구조
 *  - 도서신청내역: 이름 | 소속 | 도서 | 출판사 | 가격 | 회차 | 단계 | 신청일자 | 링크
 *  - 명부:         이름 | 소속 | 위치 | 지원금
 *  - 설정:         A1="현재회차", B1=숫자
 */

var SHEET_REQUESTS = "도서신청내역";
var SHEET_MEMBERS = "명부";
var SHEET_CONFIG = "설정";
var SHEET_MEETINGS = "자율 모임 일정";   // 일자 | 인원 | 대표인
var MEETING_SUPPORT_PER_PERSON = 15000; // 자율 모임 1인당 지원금(원)
var MAX_LEN = 200;

// ---------- 공통 ----------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("'" + name + "' 탭을 찾을 수 없습니다.");
  return sheet;
}

// "19,800" / 19800 / "" → 숫자
function toAmount(v) {
  var n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// 명부 탭 → [{name, dept, budget}]  (budget = D열 지원금)
function readMembers() {
  var sheet = getSheet(SHEET_MEMBERS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 4).getValues();
  return rows
    .map(function (r) {
      return { name: String(r[0]).trim(), dept: String(r[1]).trim(), budget: toAmount(r[3]) };
    })
    .filter(function (m) { return m.name && m.dept; });
}

function findMember(name, dept) {
  var found = null;
  readMembers().some(function (m) {
    if (m.name === name && m.dept === dept) { found = m; return true; }
    return false;
  });
  return found;
}

// 도서신청내역에서 해당 회원의 신청 행 전체 (전 회차)
// A=이름 B=소속 C=도서 D=출판사 E=가격 F=회차 G=단계 H=신청일자 I=링크
// row = 시트 행 번호. 본인 신청 수정·삭제 시 식별자로 쓴다.
function rowToRequest(r, row) {
  return {
    row: row,
    name: String(r[0]).trim(),
    dept: String(r[1]).trim(),
    title: String(r[2]).trim(),
    publisher: String(r[3]).trim(),
    price: toAmount(r[4]),
    round: toAmount(r[5]),
    status: String(r[6]).trim(),
    date: r[7] instanceof Date ? formatDate(r[7]) : String(r[7]).trim(),
    link: String(r[8]).trim(),
  };
}

// 도서신청내역 전체 (빈 행 제외)
function readAllRequests() {
  var sheet = getSheet(SHEET_REQUESTS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 9).getValues()
    .map(function (r, i) { return rowToRequest(r, i + 2); })
    .filter(function (it) { return it.name || it.dept || it.title; });
}

function readRequests(name, dept) {
  return readAllRequests().filter(function (it) { return it.name === name && it.dept === dept; });
}

// 전 회차 신청 가격 합계
function readUsedAmount(name, dept) {
  return readRequests(name, dept).reduce(function (sum, it) { return sum + it.price; }, 0);
}

function won(n) {
  return n.toLocaleString("ko-KR") + "원";
}

// 설정!B1 → 현재 회차
function readCurrentRound() {
  var value = getSheet(SHEET_CONFIG).getRange("B1").getValue();
  var round = Number(value);
  if (!value || isNaN(round)) throw new Error("'설정' 탭 B1에 현재 회차 숫자를 입력해 주세요.");
  return round;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy.MM.dd");
}

// ---------- GET ----------

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action === "list") {
      // 본인 신청 내역 + 잔액. 소속·이름 조합이 명부에 있을 때만 응답한다.
      var name = String(e.parameter.name || "").trim();
      var dept = String(e.parameter.dept || "").trim();
      var member = findMember(name, dept);
      if (!member) throw new Error("소속과 이름을 확인하세요.");
      var items = readRequests(name, dept);
      var used = items.reduce(function (sum, it) { return sum + it.price; }, 0);
      // 현재 회차의 '신청완료' 건만 본인이 수정·삭제할 수 있다.
      var currentRound = null;
      try { currentRound = readCurrentRound(); } catch (ignored) {}
      items.forEach(function (it) { it.editable = isEditableByOwner(it, currentRound); });
      return json({ ok: true, items: items, budget: member.budget, used: used, remaining: member.budget - used });
    }
    if (action === "meetings") {
      // 기간(yyyyMMdd, 양끝 포함) 안의 자율 모임 일정. from/to가 없으면 오늘 이후 전체.
      var from = normalizeYmd(e.parameter.from) || todayYmd();
      var to = normalizeYmd(e.parameter.to) || "99991231";
      var today = todayYmd();
      var meetings = readMeetings()
        .filter(function (m) { return m.date >= from && m.date <= to; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      meetings.forEach(function (m) { m.editable = m.date >= today; });
      return json({ ok: true, items: meetings, supportPerPerson: MEETING_SUPPORT_PER_PERSON, today: today });
    }
    if (action === "members") {
      // 지원금은 외부에 노출하지 않고 이름·소속만 내려준다.
      var members = readMembers().map(function (m) { return { name: m.name, dept: m.dept }; });
      return json({ ok: true, members: members });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ---------- POST ----------

// 관리자 비밀번호는 코드에 두지 않고 스크립트 속성 ADMIN_PASSWORD에 저장한다.
// (Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성)
function checkAdminPassword(password) {
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!expected) throw new Error("스크립트 속성 ADMIN_PASSWORD가 설정되지 않았습니다.");
  return String(password || "") === expected;
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  if (data.action === "auth") {
    try {
      if (!checkAdminPassword(data.password)) throw new Error("비밀번호가 올바르지 않습니다.");
      return json({ ok: true });
    } catch (err) {
      return json({ ok: false, error: err.message });
    }
  }

  if (data.action === "admin") {
    try {
      return json(handleAdmin(data));
    } catch (err) {
      return json({ ok: false, error: err.message });
    }
  }

  if (data.action === "meeting.create" || data.action === "meeting.update" || data.action === "meeting.delete") {
    try {
      return json(handleMeeting(data));
    } catch (err) {
      return json({ ok: false, error: err.message });
    }
  }

  if (data.action === "request.update" || data.action === "request.delete") {
    try {
      return json(handleOwnRequest(data));
    } catch (err) {
      return json({ ok: false, error: err.message });
    }
  }

  return submitRequest(data);
}

// ---------- 본인 신청 수정·삭제 ----------

var OWNER_EDITABLE_STATUS = "신청완료";

function isEditableByOwner(it, currentRound) {
  return currentRound !== null && it.round === currentRound && it.status === OWNER_EDITABLE_STATUS;
}

// 목록을 받은 뒤 시트가 바뀌어 행이 밀렸는지, 아직 수정 가능한 상태인지 확인한다.
function getOwnRequestChecked(row, orig, currentRound) {
  var sheet = getSheet(SHEET_REQUESTS);
  row = Number(row);
  if (!row || row < 2 || row > sheet.getLastRow()) {
    throw new Error("대상 신청을 찾을 수 없습니다. 다시 조회해 주세요.");
  }
  var it = rowToRequest(sheet.getRange(row, 1, 1, 9).getValues()[0], row);
  var o = orig || {};
  if (it.name !== String(o.name || "").trim() || it.dept !== String(o.dept || "").trim() ||
      it.title !== String(o.title || "").trim() || it.price !== toAmount(o.price)) {
    throw new Error("신청 내역이 변경되어 대상이 일치하지 않습니다. 다시 조회해 주세요.");
  }
  if (!isEditableByOwner(it, currentRound)) {
    throw new Error("현재 회차의 '" + OWNER_EDITABLE_STATUS + "' 상태인 신청만 수정·삭제할 수 있습니다.");
  }
  return { sheet: sheet, item: it };
}

function handleOwnRequest(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var currentRound = readCurrentRound();
    var found = getOwnRequestChecked(data.row, data.orig, currentRound);
    var it = found.item;

    if (data.action === "request.delete") {
      found.sheet.deleteRow(it.row);
      var member = findMember(it.name, it.dept);
      var usedAfter = readUsedAmount(it.name, it.dept);
      return { ok: true, remaining: member ? member.budget - usedAfter : null };
    }

    // request.update: 도서명·출판사·가격·링크만 바꾼다. 이름·소속·회차·단계·신청일자는 유지.
    var book = validateBookFields(data);
    var m = findMember(it.name, it.dept);
    if (!m) throw new Error("소속과 이름을 확인하세요.");
    var usedOthers = readUsedAmount(it.name, it.dept) - it.price;
    if (usedOthers + book.price > m.budget) {
      throw new Error(
        "잔액이 부족합니다. 지원금 " + won(m.budget) + " 중 " + won(usedOthers) + " 사용, 잔액 " +
        won(m.budget - usedOthers) + " (변경 가격 " + won(book.price) + ")"
      );
    }
    found.sheet.getRange(it.row, 3, 1, 3).setValues([[book.title, book.publisher, book.price]]);
    found.sheet.getRange(it.row, 9).setValue(book.link);
    return { ok: true, remaining: m.budget - usedOthers - book.price };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

// ---------- 관리자: 회원 관리 ----------

// 명부 탭의 모든 행 (빈 행 제외). row = 시트 행 번호 → 수정·삭제 시 식별자로 쓴다.
function readMemberRows() {
  var sheet = getSheet(SHEET_MEMBERS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 4).getValues();
  var out = [];
  rows.forEach(function (r, i) {
    var name = String(r[0]).trim(), dept = String(r[1]).trim(), location = String(r[2]).trim();
    if (!name && !dept && !location && String(r[3]).trim() === "") return;
    out.push({ row: i + 2, name: name, dept: dept, location: location, budget: toAmount(r[3]) });
  });
  return out;
}

function validateMember(data) {
  var str = function (v) { return (v === undefined || v === null) ? "" : String(v).trim(); };
  var name = str(data.name), dept = str(data.dept), location = str(data.location), budgetRaw = str(data.budget);

  if (!name) throw new Error("이름을 입력해 주세요.");
  if (!dept) throw new Error("소속을 입력해 주세요.");
  [name, dept, location].forEach(function (v) {
    if (v.length > MAX_LEN) throw new Error("입력값이 너무 깁니다. (최대 " + MAX_LEN + "자)");
  });
  if (!/^\d+$/.test(budgetRaw)) throw new Error("지원금은 0 이상의 정수로 입력해 주세요.");

  return { name: name, dept: dept, location: location, budget: Number(budgetRaw) };
}

function assertNoDuplicate(name, dept, excludeRow) {
  var dup = readMemberRows().some(function (m) {
    return m.row !== excludeRow && m.name === name && m.dept === dept;
  });
  if (dup) throw new Error("이미 같은 소속에 같은 이름의 회원이 있습니다.");
}

// 목록을 받은 뒤 시트가 바뀌어 행이 밀렸는지 확인하고, 맞으면 시트를 돌려준다.
function getMemberSheetChecked(row, orig) {
  var sheet = getSheet(SHEET_MEMBERS);
  row = Number(row);
  if (!row || row < 2 || row > sheet.getLastRow()) {
    throw new Error("대상 행을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
  }
  var cur = sheet.getRange(row, 1, 1, 2).getValues()[0];
  if (String(cur[0]).trim() !== String(orig.name).trim() || String(cur[1]).trim() !== String(orig.dept).trim()) {
    throw new Error("명부가 변경되어 대상이 일치하지 않습니다. 목록을 새로고침해 주세요.");
  }
  return sheet;
}

// 이름·소속이 바뀌면 도서신청내역의 해당 회원 행도 같이 바꾼다. 바꾼 행 수를 돌려준다.
function renameInRequests(oldName, oldDept, newName, newDept) {
  if (oldName === newName && oldDept === newDept) return 0;
  var sheet = getSheet(SHEET_REQUESTS);
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var range = sheet.getRange(2, 1, last - 1, 2);
  var rows = range.getValues();
  var changed = 0;
  rows.forEach(function (r) {
    if (String(r[0]).trim() === oldName && String(r[1]).trim() === oldDept) {
      r[0] = newName; r[1] = newDept; changed++;
    }
  });
  if (changed) range.setValues(rows);
  return changed;
}

function handleAdmin(data) {
  if (!checkAdminPassword(data.password)) throw new Error("비밀번호가 올바르지 않습니다.");
  var op = String(data.op || "");

  if (op === "members.list") {
    return { ok: true, members: readMemberRows() };
  }

  if (op === "requests.list") {
    // 전체 신청 내역에 신청자의 위치·지원금·현재 잔액을 붙여 돌려준다.
    var memberByKey = {};
    readMemberRows().forEach(function (m) { memberByKey[m.name + "\u0000" + m.dept] = m; });

    var all = readAllRequests();
    var usedByKey = {};
    all.forEach(function (it) {
      var k = it.name + "\u0000" + it.dept;
      usedByKey[k] = (usedByKey[k] || 0) + it.price;
    });

    var items = all.map(function (it) {
      var k = it.name + "\u0000" + it.dept;
      var m = memberByKey[k];
      it.location = m ? m.location : "";
      it.budget = m ? m.budget : null;
      it.used = usedByKey[k] || 0;
      it.remaining = m ? m.budget - it.used : null;
      return it;
    });
    return { ok: true, items: items };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (op === "members.create") {
      var m = validateMember(data);
      assertNoDuplicate(m.name, m.dept, -1);
      getSheet(SHEET_MEMBERS).appendRow([m.name, m.dept, m.location, m.budget]);
      return { ok: true };
    }

    if (op === "members.update") {
      var orig = data.orig || {};
      var sheet = getMemberSheetChecked(data.row, orig);
      var u = validateMember(data);
      assertNoDuplicate(u.name, u.dept, Number(data.row));
      sheet.getRange(Number(data.row), 1, 1, 4).setValues([[u.name, u.dept, u.location, u.budget]]);
      var renamed = renameInRequests(String(orig.name).trim(), String(orig.dept).trim(), u.name, u.dept);
      return { ok: true, renamedRequests: renamed };
    }

    if (op === "members.delete") {
      var sheetD = getMemberSheetChecked(data.row, data.orig || {});
      sheetD.deleteRow(Number(data.row));
      return { ok: true };
    }

    throw new Error("알 수 없는 작업입니다: " + op);
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function submitRequest(data) {
  var lock = LockService.getScriptLock();
  try {
    var payload = validate(data);
    var round = readCurrentRound();

    // 잔액 검사는 동시 신청으로 한도를 넘지 않도록 락 안에서 수행한다.
    lock.waitLock(10000);
    var used = readUsedAmount(payload.name, payload.dept);
    var budget = payload.member.budget;
    var remaining = budget - used;
    if (used + payload.price > budget) {
      throw new Error(
        "잔액이 부족합니다. 지원금 " + won(budget) + " 중 " + won(used) + " 사용, 잔액 " +
        won(remaining) + " (신청 가격 " + won(payload.price) + ")"
      );
    }

    getSheet(SHEET_REQUESTS).appendRow([
      payload.name,
      payload.dept,
      payload.title,
      payload.publisher,
      payload.price,
      round,
      "신청완료",
      formatDate(new Date()),
      payload.link,
    ]);

    return json({ ok: true, round: round, remaining: remaining - payload.price });
  } catch (err) {
    return json({ ok: false, error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

// ---------- 자율 모임 신청 ----------

function todayYmd() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
}

// Date / 20260428 / "2026-04-28" / "2026.04.28" → "20260428". 아니면 "".
function normalizeYmd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyyMMdd");
  var d = String(v === undefined || v === null ? "" : v).replace(/\D/g, "");
  return d.length === 8 ? d : "";
}

function isValidYmd(ymd) {
  if (!/^\d{8}$/.test(ymd)) return false;
  var y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  var dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// "3명" / 3 → 3
function toCount(v) {
  var n = Number(String(v === undefined || v === null ? "" : v).replace(/\D/g, ""));
  return isNaN(n) ? 0 : n;
}

// 자율 모임 일정 탭 → [{row, date, count, leader}] (빈 행 제외)
function readMeetings() {
  var sheet = getSheet(SHEET_MEETINGS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  var out = [];
  rows.forEach(function (r, i) {
    var date = normalizeYmd(r[0]), count = toCount(r[1]), leader = String(r[2]).trim();
    if (!date && !count && !leader) return;
    out.push({ row: i + 2, date: date, count: count, leader: leader });
  });
  return out;
}

function validateMeeting(data) {
  var date = normalizeYmd(data.date);
  var countRaw = str(data.count);
  var leaderName = str(data.leaderName);
  var leaderDept = str(data.leaderDept);

  if (!leaderDept) throw new Error("소속을 선택해 주세요.");
  if (!leaderName) throw new Error("대표인을 선택해 주세요.");
  if (!date) throw new Error("일자를 입력해 주세요.");
  if (!isValidYmd(date)) throw new Error("일자가 올바르지 않습니다.");
  if (date < todayYmd()) throw new Error("오늘 이후 날짜만 신청할 수 있습니다.");
  if (!/^\d+$/.test(countRaw) || Number(countRaw) < 1) throw new Error("인원은 1명 이상의 정수로 입력해 주세요.");
  if (Number(countRaw) > 999) throw new Error("인원이 너무 많습니다.");

  if (!findMember(leaderName, leaderDept)) throw new Error("소속과 이름을 확인하세요.");

  return { date: date, count: Number(countRaw), leader: leaderName };
}

function assertNoDuplicateMeeting(date, leader, excludeRow) {
  var dup = readMeetings().some(function (m) {
    return m.row !== excludeRow && m.date === date && m.leader === leader;
  });
  if (dup) throw new Error("같은 날짜에 이미 신청한 모임이 있습니다.");
}

// 목록을 받은 뒤 시트가 바뀌어 행이 밀렸는지, 대표인 본인인지, 아직 지나지 않은 모임인지 확인한다.
function getMeetingChecked(row, orig, leaderName, leaderDept) {
  var sheet = getSheet(SHEET_MEETINGS);
  row = Number(row);
  if (!row || row < 2 || row > sheet.getLastRow()) {
    throw new Error("대상 모임을 찾을 수 없습니다. 다시 조회해 주세요.");
  }
  var r = sheet.getRange(row, 1, 1, 3).getValues()[0];
  var cur = { date: normalizeYmd(r[0]), count: toCount(r[1]), leader: String(r[2]).trim() };
  var o = orig || {};
  if (cur.date !== normalizeYmd(o.date) || cur.leader !== str(o.leader)) {
    throw new Error("모임 일정이 변경되어 대상이 일치하지 않습니다. 다시 조회해 주세요.");
  }
  if (!findMember(str(leaderName), str(leaderDept)) || str(leaderName) !== cur.leader) {
    throw new Error("대표인 본인만 수정·삭제할 수 있습니다.");
  }
  if (cur.date < todayYmd()) {
    throw new Error("이미 지난 모임은 수정·삭제할 수 없습니다.");
  }
  return { sheet: sheet, item: cur };
}

function handleMeeting(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (data.action === "meeting.create") {
      var m = validateMeeting(data);
      assertNoDuplicateMeeting(m.date, m.leader, -1);
      getSheet(SHEET_MEETINGS).appendRow([m.date, m.count + "명", m.leader]);
      return { ok: true, support: m.count * MEETING_SUPPORT_PER_PERSON };
    }

    var found = getMeetingChecked(data.row, data.orig, data.leaderName, data.leaderDept);

    if (data.action === "meeting.delete") {
      found.sheet.deleteRow(Number(data.row));
      return { ok: true };
    }

    // meeting.update: 일자·인원만 바꾼다. 대표인은 유지.
    var u = validateMeeting(data);
    assertNoDuplicateMeeting(u.date, u.leader, Number(data.row));
    found.sheet.getRange(Number(data.row), 1, 1, 3).setValues([[u.date, u.count + "명", u.leader]]);
    return { ok: true, support: u.count * MEETING_SUPPORT_PER_PERSON };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function str(v) {
  return (v === undefined || v === null) ? "" : String(v).trim();
}

// 도서명·출판사·가격·링크 검증 (신규 신청과 본인 수정이 공유)
function validateBookFields(data) {
  var title = str(data.title);
  var publisher = str(data.publisher);
  var link = str(data.link);
  var priceRaw = str(data.price);

  if (!title) throw new Error("도서명을 입력해 주세요.");
  if (!publisher) throw new Error("출판사를 입력해 주세요.");
  if (!priceRaw) throw new Error("가격을 입력해 주세요.");

  [title, publisher].forEach(function (v) {
    if (v.length > MAX_LEN) throw new Error("입력값이 너무 깁니다. (최대 " + MAX_LEN + "자)");
  });
  if (link.length > 1000) throw new Error("링크가 너무 깁니다.");

  if (!/^\d+$/.test(priceRaw) || Number(priceRaw) <= 0) {
    throw new Error("가격은 0보다 큰 정수로 입력해 주세요.");
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw new Error("링크는 http:// 또는 https:// 로 시작해야 합니다.");
  }

  return { title: title, publisher: publisher, price: Number(priceRaw), link: link };
}

function validate(data) {
  var name = str(data.name);
  var dept = str(data.dept);

  if (!dept) throw new Error("소속을 선택해 주세요.");
  if (!name) throw new Error("이름을 선택해 주세요.");
  [name, dept].forEach(function (v) {
    if (v.length > MAX_LEN) throw new Error("입력값이 너무 깁니다. (최대 " + MAX_LEN + "자)");
  });

  var book = validateBookFields(data);

  var member = findMember(name, dept);
  if (!member) throw new Error("소속과 이름을 확인하세요.");

  return {
    name: name, dept: dept, title: book.title, publisher: book.publisher,
    price: book.price, link: book.link, member: member,
  };
}
