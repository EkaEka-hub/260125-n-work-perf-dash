// api/monthly.js

const CODE_VER = "monthly-20260204-2"; // ✅ 버전 올림(배포 확인)

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

// KST 기준 현재 월 (YYYY-MM)
function currentMonthSeoul(){
  const now = new Date();
  const seoul = new Date(now.getTime() + 9*60*60*1000);
  const y = seoul.getUTCFullYear();
  const m = seoul.getUTCMonth() + 1;
  return `${y}-${pad2(m)}`;
}

// 월 범위를 "YYYY-MM-DD" 문자열로 반환
function monthRangeYMD(yyyyMm){
  const [yStr,mStr] = String(yyyyMm).split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if(!y || !m) throw new Error("Invalid month format. Use YYYY-MM.");

  const startDate = `${y}-${pad2(m)}-01`;

  let ny=y, nm=m+1;
  if(nm===13){ ny=y+1; nm=1; }
  const endDate = `${ny}-${pad2(nm)}-01`;

  return { startDate, endDate, y, m };
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

// select / multi_select / status 타입 모두 대응
function pickSelectName(page, propName){
  const p = page?.properties?.[propName];
  if(!p) return null;

  if(p.type === "select") return p.select?.name || null;
  if(p.type === "multi_select") return p.multi_select?.[0]?.name || null;
  if(p.type === "status") return p.status?.name || null;

  return null;
}

// =========================
// ✅ 날짜 처리 (start/end)
// =========================
function getDateStartEnd(page, propName){
  const p = page?.properties?.[propName];
  if(!p || p.type !== "date") return { start:"", end:"" };
  const start = p.date?.start ? String(p.date.start).slice(0,10) : "";
  const end   = p.date?.end   ? String(p.date.end).slice(0,10)   : "";
  return { start, end };
}

// ✅ "start 날짜" 기준으로 월 범위에 들어오는 것만 남김
function filterByStartDateStrict(pages, propName, startDateInclusive, endDateExclusive){
  const excludedSamples = [];
  const kept = [];

  for(const pg of pages){
    const { start, end } = getDateStartEnd(pg, propName);

    // start가 없으면 제외
    if(!start){
      if(excludedSamples.length < 12){
        excludedSamples.push({ id: pg?.id || "", start:"", end:"" });
      }
      continue;
    }

    // start 기준으로만 판정
    if(start >= startDateInclusive && start < endDateExclusive){
      kept.push(pg);
    }else{
      if(excludedSamples.length < 12){
        excludedSamples.push({ id: pg?.id || "", start, end });
      }
    }
  }

  return { kept, excludedSamples };
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
// 디버그 유틸 (날짜별 카운트 / min-max) - start 기준
// =========================
function countByDateStart(pages, propName){
  const m = new Map();
  for(const pg of pages){
    const { start } = getDateStartEnd(pg, propName);
    if(!start) continue;
    m.set(start, (m.get(start) || 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
}
function minMaxDateStart(pages, propName){
  const dates = pages.map(p=>getDateStartEnd(p, propName).start).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length-1] || "" };
}

export default async function handler(req,res){
  // CORS (Notion iframe 임베드 대응)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.status(200).end();

  try{
    if(!NOTION_DAILY_DB_ID) throw new Error("Missing NOTION_DAILY_DB_ID");
    if(!NOTION_TODO_DB_ID) throw new Error("Missing NOTION_TODO_DB_ID");

    const month = (req.query?.month || currentMonthSeoul()).toString();
    const lastMonth = prevMonth(month);

    const thisRange = monthRangeYMD(month);
    const lastRange = monthRangeYMD(lastMonth);

    // 라벨 순서(노션 등록 순서)
    const workLabels = await getSelectOptionsInOrder(NOTION_DAILY_DB_ID, DAILY_WORK_PROP);
    const outLabels  = await getSelectOptionsInOrder(NOTION_DAILY_DB_ID, DAILY_OUTCOME_PROP);

    const safeWorkLabels = workLabels.length ? workLabels : [];
    const safeOutLabels  = outLabels.length  ? outLabels  : [];

    // =========================
    // 1) 노션에서 월 범위로 "대충" 가져온 뒤
    // 2) start 날짜 기준으로 "정확히" 다시 필터링
    // =========================
    const dailyThisRaw = await queryAll(NOTION_DAILY_DB_ID,{
      filter:{ property: DAILY_DATE_PROP, date:{ on_or_after:thisRange.startDate, before:thisRange.endDate } },
      page_size:100,
    });

    const dailyLastRaw = await queryAll(NOTION_DAILY_DB_ID,{
      filter:{ property: DAILY_DATE_PROP, date:{ on_or_after:lastRange.startDate, before:lastRange.endDate } },
      page_size:100,
    });

    const thisStrict = filterByStartDateStrict(dailyThisRaw, DAILY_DATE_PROP, thisRange.startDate, thisRange.endDate);
    const lastStrict = filterByStartDateStrict(dailyLastRaw, DAILY_DATE_PROP, lastRange.startDate, lastRange.endDate);

    const dailyThisPages = thisStrict.kept;
    const dailyLastPages = lastStrict.kept;

    // 디버그(후처리 기준)
    const debugThisCountsByDate = countByDateStart(dailyThisPages, DAILY_DATE_PROP);
    const debugLastCountsByDate = countByDateStart(dailyLastPages, DAILY_DATE_PROP);
    const debugThisMinMax = minMaxDateStart(dailyThisPages, DAILY_DATE_PROP);
    const debugLastMinMax = minMaxDateStart(dailyLastPages, DAILY_DATE_PROP);

    // 업무/성과 카운트
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
    // 투두(이번달 마감일)도 동일하게 "start" 기준 후처리
    // =========================
    const todoThisRaw = await queryAll(NOTION_TODO_DB_ID,{
      filter:{ property: TODO_DUE_PROP, date:{ on_or_after:thisRange.startDate, before:thisRange.endDate } },
      page_size:100,
    });

    const todoStrict = filterByStartDateStrict(todoThisRaw, TODO_DUE_PROP, thisRange.startDate, thisRange.endDate);
    const todoThisPages = todoStrict.kept;

    const statusCount = Object.fromEntries(TODO_STATUSES_ALL.map(s=>[s,0]));
    for(const p of todoThisPages){
      const st = pickSelectName(p, TODO_STATUS_PROP);
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
          this:{ startDate: thisRange.startDate, endDate: thisRange.endDate },
          last:{ startDate: lastRange.startDate, endDate: lastRange.endDate },
        },
        prop:{
          daily:{ date: DAILY_DATE_PROP, work: DAILY_WORK_PROP, outcome: DAILY_OUTCOME_PROP },
          todo:{ due: TODO_DUE_PROP, status: TODO_STATUS_PROP },
        },
        debug:{
          codeVer: CODE_VER,
          build:{
            commit: process.env.VERCEL_GIT_COMMIT_SHA || "",
            deployedAt: new Date().toISOString(),
          },
          env:{ NOTION_DAILY_DB_ID, NOTION_TODO_DB_ID },

          // ✅ 원본 vs 후처리 비교(핵심)
          preFilterCount:{
            dailyThis: dailyThisRaw.length,
            dailyLast: dailyLastRaw.length,
            todoThis: todoThisRaw.length,
          },
          postFilterCount:{
            dailyThis: dailyThisPages.length,
            dailyLast: dailyLastPages.length,
            todoThis: todoThisPages.length,
          },

          // ✅ 이번달/전월 min-max, 날짜별 카운트(start 기준)
          thisMinMax: debugThisMinMax,
          lastMinMax: debugLastMinMax,
          thisCountsByDate: debugThisCountsByDate,
          lastCountsByDate: debugLastCountsByDate,

          // ✅ 왜 빠졌는지 샘플(원인 확인용)
          excludedSamples:{
            dailyThis: thisStrict.excludedSamples,
            dailyLast: lastStrict.excludedSamples,
            todoThis: todoStrict.excludedSamples,
          }
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
