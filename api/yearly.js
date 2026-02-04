// api/yearly.js
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DAILY_DB_ID = process.env.NOTION_DAILY_DB_ID;

const DAILY_DATE_PROP = "날짜";
const NOTION_VERSION = "2022-06-28";
const API_BASE = "https://api.notion.com/v1";

function pad2(n){ return String(n).padStart(2,"0"); }

function currentYearSeoul(){
  const now = new Date();
  const seoul = new Date(now.getTime() + 9*60*60*1000);
  return seoul.getUTCFullYear();
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

// ✅ Notion date start를 YYYY-MM-DD로 뽑아오기
function getDateStart(page, propName){
  const p = page?.properties?.[propName];
  if(!p || p.type !== "date") return "";
  const start = p.date?.start || "";
  return start ? String(start).slice(0,10) : "";
}

// ✅ “겹침/이상치” 방지: startDate 기준으로 월 범위에 엄격히 포함되는 것만 카운트
function filterByStartDateStrict(pages, propName, startInclusive, endExclusive){
  const kept = [];
  for(const pg of pages){
    const start = getDateStart(pg, propName);
    if(!start) continue;
    if(start >= startInclusive && start < endExclusive) kept.push(pg);
  }
  return kept;
}

function pickMaxIndexAmong(totals, idxs){
  let best = idxs[0];
  for(const i of idxs){
    if(totals[i] > totals[best]) best = i;
  }
  return best;
}
function pickMinIndexAmong(totals, idxs){
  let best = idxs[0];
  for(const i of idxs){
    if(totals[i] < totals[best]) best = i;
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

    const months = Array.from({length:12}, (_,i)=>`${year}-${pad2(i+1)}`);

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

    const yearlyTotalWork = totals.reduce((a,b)=>a+b,0);

    // ✅ 데이터가 있는 달(>0)만 평균/최소/최대로 잡기
    const nonZeroIdx = [];
    for(let i=0;i<totals.length;i++){
      if(totals[i] > 0) nonZeroIdx.push(i);
    }

    const denom = nonZeroIdx.length; // 데이터 있는 달 수
    const monthlyAvg = denom === 0 ? 0 : Math.round((yearlyTotalWork / denom) * 10) / 10;

    let maxIdx, minIdx;
    if(denom === 0){
      // 1년 내내 0이면 그냥 1월로 처리(표시용)
      maxIdx = 0;
      minIdx = 0;
    }else{
      maxIdx = pickMaxIndexAmong(totals, nonZeroIdx);
      minIdx = pickMinIndexAmong(totals, nonZeroIdx);
    }

    return res.status(200).json({
      year,
      months,
      totals,
      kpi:{
        yearlyTotalWork,
        monthlyAvg,
        dataMonthsCount: denom, // ✅ 몇 달 기준인지 UI에서도 표시 가능
        max:{ month: months[maxIdx], value: totals[maxIdx] },
        min:{ month: months[minIdx], value: totals[minIdx] },
      },
      meta:{
        tz:"Asia/Seoul(+09:00)",
        prop:{ daily:{ date: DAILY_DATE_PROP } },
        env:{ NOTION_DAILY_DB_ID: NOTION_DAILY_DB_ID },
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
