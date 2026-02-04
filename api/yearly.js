// api/yearly.js
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DAILY_DB_ID = process.env.NOTION_DAILY_DB_ID;

const DAILY_DATE_PROP = "날짜";
const NOTION_VERSION = "2022-06-28";
const API_BASE = "https://api.notion.com/v1";

function pad2(n){ return String(n).padStart(2,"0"); }

function seoulNow(){
  const now = new Date();
  return new Date(now.getTime() + 9*60*60*1000);
}

function currentYearSeoul(){
  return seoulNow().getUTCFullYear();
}

function currentMonthSeoul(){ // 1~12
  return seoulNow().getUTCMonth() + 1;
}

function monthRangeYMD(year, month){
  const y = Number(year);
  const m = Number(month);
  if(!y || !m || m < 1 || m > 12) throw new Error("Invalid year/month");

  const startDate = `${y}-${pad2(m)}-01`;
  let ny = y, nm = m + 1;
  if(nm === 13){ ny = y + 1; nm = 1; }
  const endDate = `${ny}-${pad2(nm)}-01`;
  return { startDate, endDate };
}

async function notionFetch(path, method="GET", body){
  if(!NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
  const res = await fetch(`${API_BASE}${path}`,{
    method,
    headers:{
      "Authorization":`Bearer ${NOTION_TOKEN}`,
      "Notion-Version":NOTION_VERSION,
      "Content-Type":"application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try{ json = text ? JSON.parse(text) : {}; } catch { json = { raw:text }; }

  if(!res.ok){
    const msg = json?.message || json?.error || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function queryAll(databaseId, queryBody){
  let hasMore = true;
  let startCursor = undefined;
  const results = [];

  while(hasMore){
    const body = { ...queryBody };
    if(startCursor) body.start_cursor = startCursor;

    const data = await notionFetch(`/databases/${databaseId}/query`, "POST", body);
    results.push(...(data.results || []));
    hasMore = Boolean(data.has_more);
    startCursor = data.next_cursor || undefined;
  }
  return results;
}

// ✅ Notion date start를 YYYY-MM-DD로 뽑기
function getDateStart(page, propName){
  const p = page?.properties?.[propName];
  if(!p || p.type !== "date") return "";
  const start = p.date?.start || "";
  return start ? String(start).slice(0,10) : "";
}

// ✅ 월 범위에 “엄격히” 포함되는 start만 카운트(겹침/이상치 방지)
function filterByStartDateStrict(pages, propName, startInclusive, endExclusive){
  const kept = [];
  for(const pg of pages){
    const start = getDateStart(pg, propName);
    if(!start) continue;
    if(start >= startInclusive && start < endExclusive) kept.push(pg);
  }
  return kept;
}

// ✅ 그 해의 “첫 기록(가장 이른 날짜)”을 1개만 가져와서 startMonth를 구함
async function findFirstRecordMonthInYear(dbId, year){
  const startYear = `${year}-01-01`;
  const nextYear = `${year+1}-01-01`;

  const data = await notionFetch(`/databases/${dbId}/query`, "POST", {
    filter: {
      property: DAILY_DATE_PROP,
      date: { on_or_after: startYear, before: nextYear },
    },
    sorts: [{ property: DAILY_DATE_PROP, direction: "ascending" }],
    page_size: 1,
  });

  const first = (data.results || [])[0];
  if(!first) return null;

  const iso = getDateStart(first, DAILY_DATE_PROP); // YYYY-MM-DD
  if(!iso || iso.slice(0,4) !== String(year)) return null;

  const m = Number(iso.slice(5,7)); // 1~12
  return (m >= 1 && m <= 12) ? m : null;
}

function sum(arr, fromIdx, toIdxInclusive){
  let s = 0;
  for(let i=fromIdx;i<=toIdxInclusive;i++){
    s += Number(arr[i] || 0);
  }
  return s;
}

function pickMaxIndexInRange(totals, fromIdx, toIdx){
  let best = fromIdx;
  for(let i=fromIdx;i<=toIdx;i++){
    if(Number(totals[i]||0) > Number(totals[best]||0)) best = i;
  }
  return best;
}

function pickMinIndexInRange(totals, fromIdx, toIdx){
  let best = fromIdx;
  for(let i=fromIdx;i<=toIdx;i++){
    if(Number(totals[i]||0) < Number(totals[best]||0)) best = i;
  }
  return best;
}

export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.status(200).end();

  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");

  try{
    if(!NOTION_DAILY_DB_ID) throw new Error("Missing NOTION_DAILY_DB_ID");

    const year = Number(req.query?.year || currentYearSeoul());
    if(!year || year < 1970 || year > 2100) throw new Error("Invalid year");

    const nowY = currentYearSeoul();
    const nowM = currentMonthSeoul(); // 1~12

    // ✅ 12개월 라벨/배열은 항상 고정(0 포함 표시를 위해)
    const months = Array.from({length:12}, (_,i)=>`${year}-${pad2(i+1)}`);

    // 12개월 totals 집계
    const totals = [];
    for(let m=1; m<=12; m++){
      const { startDate, endDate } = monthRangeYMD(year, m);

      const raw = await queryAll(NOTION_DAILY_DB_ID,{
        filter:{ property: DAILY_DATE_PROP, date:{ on_or_after:startDate, before:endDate } },
        page_size:100,
      });

      const strict = filterByStartDateStrict(raw, DAILY_DATE_PROP, startDate, endDate);
      totals.push(strict.length);
    }

    // ✅ 연도별 “시작월(첫 기록월)” 찾기
    const firstMonth = await findFirstRecordMonthInYear(NOTION_DAILY_DB_ID, year); // 1~12 or null

    // ✅ 종료월 결정
    // - 과거 연도: 12월
    // - 현재 연도: 현재월
    // - 미래 연도: (활성구간 없음)
    let endMonth;
    if(year < nowY) endMonth = 12;
    else if(year === nowY) endMonth = nowM;
    else endMonth = null;

    // ✅ 유효 구간(평균/최소/최대 계산용)
    // startMonth는 firstMonth, endMonth는 위에서 결정
    // 그래프는 12개월 그대로 두고, 계산만 여기 구간으로!
    let activeStart = null; // 1~12
    let activeEnd   = null; // 1~12
    if(firstMonth && endMonth && endMonth >= firstMonth){
      activeStart = firstMonth;
      activeEnd = endMonth;
    }

    // ✅ 유효 구간이 없으면(미래 연도 or 기록 없음) 평균/최소/최대는 0 처리
    let monthlyAvg = 0;
    let yearlyTotalWork = 0;
    let maxIdx = 0;
    let minIdx = 0;
    let dataMonthsCount = 0;

    if(activeStart && activeEnd){
      const sIdx = activeStart - 1;
      const eIdx = activeEnd - 1;

      yearlyTotalWork = sum(totals, sIdx, eIdx);
      dataMonthsCount = (eIdx - sIdx + 1);

      monthlyAvg = dataMonthsCount === 0 ? 0 : Math.round((yearlyTotalWork / dataMonthsCount) * 10) / 10;

      maxIdx = pickMaxIndexInRange(totals, sIdx, eIdx);
      minIdx = pickMinIndexInRange(totals, sIdx, eIdx);
    }else{
      // 기록이 없거나 미래 연도면 연간총업무=0, 평균=0
      yearlyTotalWork = 0;
      monthlyAvg = 0;
      dataMonthsCount = 0;

      // 표시용(의미는 없음): 1월로 통일
      maxIdx = 0;
      minIdx = 0;
    }

    return res.status(200).json({
      year,
      months,
      totals, // ✅ 12개월 고정(0 포함)
      kpi:{
        yearlyTotalWork,      // ✅ 유효 구간 합
        monthlyAvg,           // ✅ 유효 구간 개월 수로 나눈 평균
        dataMonthsCount,      // ✅ 유효 구간 개월 수(=분모)
        activeRange: activeStart && activeEnd ? {
          startMonth: months[activeStart-1],
          endMonth: months[activeEnd-1],
        } : null,
        max:{ month: months[maxIdx], value: totals[maxIdx] },
        min:{ month: months[minIdx], value: totals[minIdx] },
      },
      meta:{
        tz:"Asia/Seoul(+09:00)",
        prop:{ daily:{ date: DAILY_DATE_PROP } },
      }
    });

  }catch(err){
    return res.status(500).json({
      error:String(err?.message || err),
      hint:{
        requiredEnv:["NOTION_TOKEN","NOTION_DAILY_DB_ID"],
        checkProps:{ daily:["날짜"] }
      }
    });
  }
}
