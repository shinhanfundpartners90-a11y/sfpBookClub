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
function rowToRequest(r) {
  return {
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
    .map(rowToRequest)
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
      return json({ ok: true, items: items, budget: member.budget, used: used, remaining: member.budget - used });
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

  return submitRequest(data);
}
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

function validate(data) {
  var str = function (v) { return (v === undefined || v === null) ? "" : String(v).trim(); };

  var name = str(data.name);
  var dept = str(data.dept);
  var title = str(data.title);
  var publisher = str(data.publisher);
  var link = str(data.link);
  var priceRaw = str(data.price);

  if (!dept) throw new Error("소속을 선택해 주세요.");
  if (!name) throw new Error("이름을 선택해 주세요.");
  if (!title) throw new Error("도서명을 입력해 주세요.");
  if (!publisher) throw new Error("출판사를 입력해 주세요.");
  if (!priceRaw) throw new Error("가격을 입력해 주세요.");

  [name, dept, title, publisher].forEach(function (v) {
    if (v.length > MAX_LEN) throw new Error("입력값이 너무 깁니다. (최대 " + MAX_LEN + "자)");
  });
  if (link.length > 1000) throw new Error("링크가 너무 깁니다.");

  if (!/^\d+$/.test(priceRaw) || Number(priceRaw) <= 0) {
    throw new Error("가격은 0보다 큰 정수로 입력해 주세요.");
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw new Error("링크는 http:// 또는 https:// 로 시작해야 합니다.");
  }

  var member = findMember(name, dept);
  if (!member) throw new Error("소속과 이름을 확인하세요.");

  return {
    name: name, dept: dept, title: title, publisher: publisher,
    price: Number(priceRaw), link: link, member: member,
  };
}
