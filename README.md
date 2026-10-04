# 독서동호회 희망도서 신청

GitHub Pages(정적 사이트) + Google Apps Script(웹 앱) + 구글 스프레드시트(DB)로 동작하는
희망도서 신청 사이트입니다. 서버 비용 없이 무료로 운영됩니다.

```
[브라우저] → GitHub Pages(index.html) → fetch → Apps Script 웹 앱 → 구글 시트
```

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` / `style.css` / `app.js` | 사이트 화면과 동작 |
| `config.js` | Apps Script 웹 앱 URL 한 줄 |
| `apps-script/Code.gs` | 스프레드시트에 붙여넣는 서버 코드 |

## 스프레드시트 구조

| 탭 | 칼럼 |
| --- | --- |
| `도서신청내역` | 이름 \| 소속 \| 도서 \| 출판사 \| 가격 \| 회차 \| 단계 \| 신청일자 \| 링크 |
| `명부` | 이름 \| 소속 \| 위치 \| 지원금 |
| `설정` | A1 = `현재회차`, B1 = 숫자 (예: `3`) |

신청 시 `회차`는 `설정!B1`, `단계`는 `신청완료`, `신청일자`는 오늘 날짜(`yyyy.MM.dd`)가 자동 기록됩니다.

## 설치 순서

### 1. 시트에 `설정` 탭 추가
- 스프레드시트 하단 `+`로 새 탭을 만들고 이름을 `설정`으로 변경
- `A1`에 `현재회차`, `B1`에 현재 회차 숫자 입력

### 2. Apps Script 코드 넣기
1. 스프레드시트 메뉴 **확장 프로그램 → Apps Script**
2. 편집기의 기본 코드(`function myFunction() {}`)를 모두 지우고 `apps-script/Code.gs` 내용을 붙여넣기
3. `Cmd+S`(Mac) / `Ctrl+S`(Windows)로 저장. 좌측 상단 프로젝트 이름도 알아보기 쉽게 변경

### 3. 웹 앱으로 배포
1. 우측 상단 **배포 → 새 배포**
2. 톱니바퀴(유형 선택) → **웹 앱**
3. 설정
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
4. **배포** → 권한 승인 창에서 본인 계정 선택
   - "Google에서 확인하지 않은 앱" 경고가 나오면 **고급 → (프로젝트명)(안전하지 않음)으로 이동** → 허용. 본인이 만든 코드라서 나오는 경고입니다.
5. 발급된 **웹 앱 URL**(`https://script.google.com/macros/s/.../exec`) 복사

동작 확인: 그 URL을 브라우저 주소창에 넣으면 `{"ok":true}`가,
`URL?action=members`를 넣으면 명부 JSON이 보여야 합니다.

### 4. 사이트에 URL 연결
`config.js`를 열어 복사한 URL을 붙여넣습니다.

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

### 5. GitHub Pages 배포
1. GitHub에서 새 저장소 생성 (**Public**, README 등 추가 체크 없이 빈 저장소)
2. 터미널에서 이 폴더로 이동 후:
   ```bash
   git remote add origin https://github.com/<아이디>/<저장소명>.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/(root)** → Save
4. 1~2분 후 `https://<아이디>.github.io/<저장소명>/` 에서 접속

## 로컬에서 미리 보기

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

`config.js`에 URL이 들어가 있으면 로컬에서도 실제 시트와 연동됩니다.

## 운영 시 참고

- **회차 변경**: `설정!B1` 숫자만 바꾸면 됩니다. 재배포 불필요
- **명단 변경**: `명부` 탭을 수정하면 사이트 드롭다운에 바로 반영됩니다
- **Code.gs 수정 후**: **배포 → 배포 관리 → 연필 아이콘 → 버전: 새 버전 → 배포**.
  "새 배포"를 만들면 URL이 바뀌어 `config.js`도 고쳐야 하니 반드시 **배포 관리**를 사용하세요
- **사이트 수정 후**: `git push`만 하면 GitHub Pages에 자동 반영됩니다

## 다음 단계 (예정)

- 신청 도서 조회 (회차별 목록)
- 잔액 확인 (`명부`의 지원금 − 신청 도서 가격 합계)
