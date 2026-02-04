// api/monthly.js
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DAILY_DB_ID = process.env.NOTION_DAILY_DB_ID;
const NOTION_TODO_DB_ID = process.env.NOTION_TODO_DB_ID;

const DAILY_DATE_PROP = "날짜";
const DAILY_WORK_PROP = "업무유형";
const DAILY_OUTCOME_PROP = "성과유형";

const TODO_DUE_PROP = "마감일";
const TODO_STATUS_PROP = "진행상황";

const DONE_STATUSES = ["완료", "보류"];
const TODO_STATUSES_ALL = ["예정", "진행 중", "완료", "보류"];

const NOTION_VERSION = "2022-06-28";
const API_BASE = "https://api.notion.com/v1";

function pad2(n){ return String(n).padStart(2,"0"); }

function currentMonthSeoul(){
  const now = new Date();
  const seoul = new Date(now.getTime() + 9*60*60*1000);
  const y = seoul.getUTCFullYear();
  const m = seoul.getUTCMonth() + 1;
  return `${y}-${pad2(m)}`;
}

function monthRangeSeoul(yyyyMm){
  const [yStr,mStr] = String(yyyyMm).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if(!y || !m) throw new Error("Invalid month format. Use YYYY-MM.");

  const startISO = `${y}-${pad2(m)}-01T00:00:00+09:00`;

  let ny=y, nm=m+1;
  if(nm===13){ ny=y+1; nm=1; }
  const endISO = `${ny}-${pad2(nm)}-01T00:00:00+09:00`;
  return { startISO, endISO, y, m };
}

function prevMonth(yyyyMm){
  const [yStr,mStr] = String(yyyyMm).split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  m -= 1;
  if(m===0){ m=12; y -= 1; }
  return `${y}-${pad2(m)}`;
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

async function getSelectOptionsInOrder(databaseId, propName){
  const db = await notionFetch(`/databases/${databaseId}`, "GET");
  const prop = db?.properties?.[propName];
  if(!prop) return [];

  if(prop.type === "select"){
    return (prop.select?.options || []).map(o=>o.name);
  }
  if(prop.type === "multi_select"){
    return (prop.multi_select?.options || []).map(o=>o.name);
  }
  if(prop.type === "status"){
    return (prop.status?.options || []).map(o=>o.name);
  }
  return [];
}

/**
 * select / multi_select / status 타입 모두 대응
 */
function pickSelectName(page, propName){
  const p = page?.properties?.[propName];
  if(!p) return null;

  if(p.type === "select") return p.select?.name || null;
  if(p.type === "multi_select") return p.multi_select?.[0]?.name || null;
  if(p.type === "status") return p.status?.name || null;

  return null;
}

function buildZeroMap(labels){
  const m = new Map();
  labels.forEach(l=>m.set(l,0));
  return m;
}

function applyCountsFromPages(map, pages, propName){
  for(const page of pages){
    const name = pickSelectName(page, propName);
    if(!name) continue;
    if(!map.has(name)) map.set(name,0);
    map.set(name, (map.get(name)||0) + 1);
  }
  return map;
}

function mapToArray(map, labels){
  const arr = [];
  const used = new Set();

  for(const l of labels){
    arr.push(map.get(l) ?? 0);
    used.add(l);
  }
  for(const [k,v] of map.entries()){
    if(!used.has(k)){
      labels.push(k);
      arr.push(v ?? 0);
    }
  }
  return arr;
}

// =========================
// ✅ 디버그 유틸 (날짜별 카운트 / min-max)
// =========================
function getDateStartYYYYMMDD(page, propName){
  const p = page?.properties?.[propName];
  if(!p || p.type !== "date") return "";
  const start = p.date?.start || "";
  return start ? String(start).slice(0,10) : "";
}

function countByDate(pages, propName){
  const m = new Map();
  for(const pg of pages){
    const d = getDateStartYYYYMMDD(pg, propName);
    if(!d) continue;
    m.set(d, (m.get(d) || 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
}

function minMaxDate(pages, propName){
  const dates = pages.map(p=>getDateStartYYYYMMDD(p, propName)).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length-1] || "" };
}

export default async function handler(req,res){
  // ✅ CORS: Notion 임베드(iframe)에서도 호출 가능하게
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.status(200).end();

  try{
    if(!NOTION_DAILY_DB_ID) throw new Error("Missing NOTION_DAILY_DB_ID");
    if(!NOTION_TODO_DB_ID) throw new Error("Missing NOTION_TODO_DB_ID");

    const month = (req.query?.month || currentMonthSeoul()).toString();
    const lastMonth = prevMonth(month);

    const thisRange = monthRangeSeoul(month);
    const lastRange = monthRangeSeoul(lastMonth);

    // 라벨 순서(노션 등록 순서)
    const workLabels = await getSelectOptionsInOrder(NOTION_DAILY_DB_ID, DAILY_WORK_PROP);
    const outLabels  = await getSelectOptionsInOrder(NOTION_DAILY_DB_ID, DAILY_OUTCOME_PROP);

    const safeWorkLabels = workLabels.length ? workLabels : [];
    const safeOutLabels  = outLabels.length  ? outLabels  : [];

    // =========================
    // 일일업무기록 집계(이번달/전월)
    // =========================
    const dailyThisPages = await queryAll(NOTION_DAILY_DB_ID,{
      filter:{ property: DAILY_DATE_PROP, date:{ on_or_after:thisRange.startISO, before:thisRange.endISO } },
      page_size:100,
    });

    const dailyLastPages = await queryAll(NOTION_DAILY_DB_ID,{
      filter:{ property: DAILY_DATE_PROP, date:{ on_or_after:lastRange.startISO, before:lastRange.endISO } },
      page_size:100,
    });

    // ✅ 디버그 데이터 생성 (문제 원인 확정용)
    const debugThisCountsByDate = countByDate(dailyThisPages, DAILY_DATE_PROP);
    const debugLastCountsByDate = countByDate(dailyLastPages, DAILY_DATE_PROP);
    const debugThisMinMax = minMaxDate(dailyThisPages, DAILY_DATE_PROP);
    const debugLastMinMax = minMaxDate(dailyLastPages, DAILY_DATE_PROP);

    const workThisMap = applyCountsFromPages(buildZeroMap(safeWorkLabels), dailyThisPages, DAILY_WORK_PROP);
    const workLastMap = applyCountsFromPages(buildZeroMap(safeWorkLabels), dailyLastPages, DAILY_WORK_PROP);

    const outThisMap  = applyCountsFromPages(buildZeroMap(safeOutLabels),  dailyThisPages, DAILY_OUTCOME_PROP);
    const outLastMap  = applyCountsFromPages(buildZeroMap(safeOutLabels),  dailyLastPages, DAILY_OUTCOME_PROP);

    const workLabelsFinal = [...safeWorkLabels];
    const outLabelsFinal  = [...safeOutLabels];

    const workThisArr = mapToArray(workThisMap, workLabelsFinal);
    const workLastArr = mapToArray(workLastMap, workLabelsFinal);

    const outThisArr  = mapToArray(outThisMap,  outLabelsFinal);
    const outLastArr  = mapToArray(outLastMap,  outLabelsFinal);

    // =========================
    // 투두(이번달 마감일 기준)
    // =========================
    const todoThisPages = await queryAll(NOTION_TODO_DB_ID,{
      filter:{ property: TODO_DUE_PROP, date:{ on_or_after:thisRange.startISO, before:thisRange.endISO } },
      page_size:100,
    });

    const statusCount = Object.fromEntries(TODO_STATUSES_ALL.map(s=>[s,0]));
    for(const p of todoThisPages){
      const st = pickSelectName(p, TODO_STATUS_PROP); // status/select 모두 대응
      if(!st) continue;
      if(statusCount[st] === undefined) statusCount[st] = 0;
      statusCount[st] += 1;
    }

    const plannedTotal   = todoThisPages.length;
    const plannedDone    = (statusCount["완료"]||0) + (statusCount["보류"]||0);
    const plannedPending = (statusCount["예정"]||0) + (statusCount["진행 중"]||0);

    const monthlyTotalWork = dailyThisPages.length;
    const unplanned = Math.max(0, monthlyTotalWork - plannedTotal);

    const planRate = plannedTotal === 0 ? 0 : Math.round((plannedDone / plannedTotal) * 100);

    const lastMonthlyTotalWork = dailyLastPages.length;
    const deltaTotal = monthlyTotalWork - lastMonthlyTotalWork;

    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");

    // ✅ 메타에 range(YYYY-MM-DD)도 같이 내려줌 (네가 확인하기 편하게)
    return res.status(200).json({
      kpi:{
        month,
        monthlyTotalWork,
        plannedTotal,
        plannedDone,
        plannedPending,
        unplanned,
        planRate,
        deltaTotal,
        lastMonthlyTotalWork,
        doneStatuses: DONE_STATUSES,
        statusCount,
      },
      work:{ labels: workLabelsFinal, last: workLastArr, this: workThisArr },
      outcome:{ labels: outLabelsFinal, last: outLastArr, this: outThisArr },
      meta:{
        month,
        lastMonth,
        tz:"Asia/Seoul(+09:00)",
        range:{
          this:{ startDate: thisRange.startISO.slice(0,10), endDate: thisRange.endISO.slice(0,10) },
          last:{ startDate: lastRange.startISO.slice(0,10), endDate: lastRange.endISO.slice(0,10) },
        },
        prop:{
          daily:{ date: DAILY_DATE_PROP, work: DAILY_WORK_PROP, outcome: DAILY_OUTCOME_PROP },
          todo:{ due: TODO_DUE_PROP, status: TODO_STATUS_PROP },
        },
        // ✅ 여기! 문제 확정용 디버그
        debug:{
          env:{
            NOTION_DAILY_DB_ID,
            NOTION_TODO_DB_ID
          },
          thisMinMax: debugThisMinMax,
          lastMinMax: debugLastMinMax,
          thisCountsByDate: debugThisCountsByDate,
          lastCountsByDate: debugLastCountsByDate
        }
      }
    });

  } catch(err){
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    return res.status(500).json({
      error:String(err?.message || err),
      hint:{
        requiredEnv:["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"],
        checkProps:{
          daily:["날짜","업무유형","성과유형"],
          todo:["마감일","진행상황"],
        },
      },
    });
  }
}
