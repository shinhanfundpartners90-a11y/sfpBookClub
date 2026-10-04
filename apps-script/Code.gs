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

// 명부 탭 → [{name, dept}]
function readMembers() {
  var sheet = getSheet(SHEET_MEMBERS);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, 2).getValues();
  return rows
    .map(function (r) { return { name: String(r[0]).trim(), dept: String(r[1]).trim() }; })
    .filter(function (m) { return m.name && m.dept; });
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
    if (action === "members") {
      return json({ ok: true, members: readMembers() });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// ---------- POST ----------

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse(e.postData.contents);
    var payload = validate(data);
    var round = readCurrentRound();

    lock.waitLock(10000);
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

    return json({ ok: true, round: round });
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

  var exists = readMembers().some(function (m) { return m.name === name && m.dept === dept; });
  if (!exists) throw new Error("명부에 없는 소속/이름입니다.");

  return { name: name, dept: dept, title: title, publisher: publisher, price: Number(priceRaw), link: link };
}
