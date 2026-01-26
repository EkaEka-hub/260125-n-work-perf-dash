# n-work-perf-dash
Notion **업무 성과 관리 템플릿**을 위한 임베드 위젯(오늘 + 월간 리포트)입니다.  
배포는 **Deploy to Vercel** 버튼으로 끝나며, 토큰/DB ID는 **사용자 본인 Vercel 환경변수**로만 저장됩니다.

---

## ✅ 3단계 퀵 가이드 (처음 1번만)
### 1) 아래 버튼 클릭 → Vercel 로그인 → Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FEkaEka-hub%2Fn-work-perf-dash&env=NOTION_TOKEN,NOTION_DAILY_DB_ID,NOTION_TODO_DB_ID&envDescription=Notion%20Integration%20Secret(NOTION_TOKEN)%EA%B3%BC%20DB%20ID%202%EA%B0%9C%EB%A5%BC%20%EC%9E%85%EB%A0%A5%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.&envLink=https%3A%2F%2Fwww.notion.so%2Fmy-integrations)

### 2) Vercel 환경변수 3개 입력 (필수)
- `NOTION_TOKEN` : Notion Integration Secret
- `NOTION_DAILY_DB_ID` : 일일업무 DB ID (32자리, 하이픈 제거)
- `NOTION_TODO_DB_ID` : 투두 DB ID (32자리, 하이픈 제거)

### 3) 배포된 주소를 Notion에 임베드
배포가 끝나면 아래 4개 페이지를 Notion에 임베드해서 사용합니다.

- `/today` : 오늘 요약
- `/kpi` : 월간 KPI 카드
- `/this-month` : 이번달 요약(막대)
- `/month-compare` : 전월 대비

예시:
- `https://YOUR-APP.vercel.app/today`
- `https://YOUR-APP.vercel.app/kpi`

---

## 제공 경로(Routes)
| 경로 | 설명 |
|---|---|
| `/today` | 오늘 업무/투두 요약 |
| `/kpi` | 월간 KPI 카드 |
| `/this-month` | 이번달(업무유형/성과유형) |
| `/month-compare` | 전월 대비(업무유형/성과유형) |
| `/api/today` | Today 데이터 API |
| `/api/monthly` | Monthly 데이터 API |

---

## 환경변수(필수)
| 이름 | 설명 |
|---|---|
| `NOTION_TOKEN` | Notion Integration Secret |
| `NOTION_DAILY_DB_ID` | 일일업무 DB ID |
| `NOTION_TODO_DB_ID` | 투두 DB ID |

## 환경변수(선택: Notion 속성명이 기본값과 다를 때만)
> 아래는 **속성명 커스텀용**입니다. 속성명이 기본값이면 입력 안 해도 됩니다.

| 이름 | 기본값 | 의미 |
|---|---:|---|
| `DAILY_DATE_PROP` | `날짜` | 일일업무 DB의 날짜 속성 |
| `DAILY_TODO_REL_PROP` | `투두리스트` | 일일업무 DB에서 투두로 연결된 관계형 속성 |
| `TODO_DAILY_REL_PROP` | `업무일지` | 투두 DB에서 일일업무로 연결된 관계형 속성 |
| `TODO_DATE_PROP` | `마감일` | 투두 DB의 마감일 속성 |
| `TODO_STATUS_PROP` | `진행상황` | 투두 DB의 진행상황(상태/선택) 속성 |
| `HOLD_STATUS_NAME` | `보류` | “보류” 상태 이름 |

---

## Notion 준비 체크(중요)
- Notion에서 **Integration 생성** 후 Secret 발급: `https://www.notion.so/my-integrations`
- 두 DB(일일업무/투두)를 열고 **Connections(연결)** 또는 **Share**에서 해당 Integration을 추가/허용해야 API가 접근 가능합니다.
- DB ID는 “DB 전체 페이지” 링크에서 32자리 ID를 사용합니다(하이픈 제거).

---

## 업데이트/운영
- 제작자(템플릿 제공자)는 사용자의 토큰을 알 수 없습니다.
- 코드 업데이트가 있어도 사용자는 필요 시 Vercel에서 **Redeploy**로 반영할 수 있습니다.

---

## Troubleshooting (자주 발생)
- `Missing NOTION_TOKEN/DB_ID` → Vercel 환경변수 입력 확인
- `Unauthorized` / `Could not find database` → Notion DB에 Integration 연결/권한 허용 확인
- 값이 안 바뀜 → Vercel Redeploy 또는 브라우저 캐시 새로고침
