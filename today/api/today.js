
// notion-today-summary/api/today.js

export default async function handler(req, res) {
  try {
    // ✅ 캐시 방지 (브라우저/프록시)
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // ✅ 필수(노션)
    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DAILY_DB_ID = process.env.NOTION_DAILY_DB_ID; // 일일업무기록(DB_일일업무기록)
    const TODO_DB_ID = process.env.NOTION_TODO_DB_ID;   // 투두리스트(DB_투두리스트)

    // ✅ 선택(속성명): 안 넣으면 기본값으로 동작
    const DAILY_DATE_PROP = process.env.DAILY_DATE_PROP || "날짜";
    const DAILY_TODO_REL_PROP = process.env.DAILY_TODO_REL_PROP || "투두리스트";

    const TODO_DATE_PROP = process.env.TODO_DATE_PROP || "마감일";
    const TODO_DAILY_REL_PROP = process.env.TODO_DAILY_REL_PROP || "업무일지";

    const TODO_STATUS_PROP = process.env.TODO_STATUS_PROP || "진행상황";
    const HOLD_STATUS_NAME = process.env.HOLD_STATUS_NAME || "보류";

    if (!NOTION_TOKEN || !DAILY_DB_ID || !TODO_DB_ID) {
      return res.status(500).json({
        error: "Missing env",
        need: ["NOTION_TOKEN", "NOTION_DAILY_DB_ID", "NOTION_TODO_DB_ID"],
      });
    }

    const headers = {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    // ✅ Asia/Seoul 기준 오늘(yyyy-mm-dd)
    const getKSTDateISO = () => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());

      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      return `${y}-${m}-${d}`;
    };

    const addDaysISO = (iso, days) => {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };

    const todayISO = getKSTDateISO();
    const tomorrowISO = addDaysISO(todayISO, 1);

    const queryAll = async (dbId, body) => {
      let results = [];
      let has_more = true;
      let start_cursor = undefined;

      while (has_more) {
        const payload = { ...body, page_size: 100 };
        if (start_cursor) payload.start_cursor = start_cursor;

        const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const j = await r.json();
        if (!r.ok) return { ok: false, status: r.status, detail: j };

        results = results.concat(j.results || []);
        has_more = !!j.has_more;
        start_cursor = j.next_cursor || undefined;

        if (results.length > 5000) break;
      }

      return { ok: true, results };
    };

    // ✅ STATUS/SELECT 둘 다 대응: 상태 이름 가져오기
    const getStatusName = (page, propName) => {
      const p = page?.properties?.[propName];
      if (!p) return "";
      if (p.type === "status") return p.status?.name || "";
      if (p.type === "select") return p.select?.name || "";
      return "";
    };

    const getRelationIds = (page, propName) => {
      const p = page?.properties?.[propName];
      const rel = p?.relation || [];
      if (!Array.isArray(rel)) return [];
      return rel.map((x) => x?.id).filter(Boolean);
    };

    const getRelationLength = (page, propName) => {
      const p = page?.properties?.[propName];
      const rel = p?.relation || [];
      return Array.isArray(rel) ? rel.length : 0;
    };

    // 1) 오늘 Daily(업무일지) 조회
    const dailyQuery = await queryAll(DAILY_DB_ID, {
      filter: {
        and: [
          { property: DAILY_DATE_PROP, date: { on_or_after: todayISO } },
          { property: DAILY_DATE_PROP, date: { before: tomorrowISO } },
        ],
      },
    });

    if (!dailyQuery.ok) {
      return res.status(dailyQuery.status).json({
        error: "Daily query error",
        detail: dailyQuery.detail,
      });
    }

    const dailyToday = dailyQuery.results;
    const doneLogTotal = dailyToday.length;

    // Daily(오늘)에서 연결된 Todo ID 모으기
    const doneTodoIdsToday = new Set();
    for (const row of dailyToday) {
      const ids = getRelationIds(row, DAILY_TODO_REL_PROP);
      for (const id of ids) doneTodoIdsToday.add(id);
    }

    // 2) 오늘 Todo 조회
    const todoQuery = await queryAll(TODO_DB_ID, {
      filter: {
        and: [
          { property: TODO_DATE_PROP, date: { on_or_after: todayISO } },
          { property: TODO_DATE_PROP, date: { before: tomorrowISO } },
        ],
      },
    });

    if (!todoQuery.ok) {
      return res.status(todoQuery.status).json({
        error: "Todo query error",
        detail: todoQuery.detail,
      });
    }

    const todosToday = todoQuery.results;
    const plannedTotal = todosToday.length;

    // 3) 완료 인정 로직:
    //    - (A) 오늘 Daily에 연결되어 있거나
    //    - (B) Todo 자체에 Daily relation이 있거나
    //    - (C) 상태가 "보류"이면 완료(=완료로 취급)
    let plannedDone = 0;
    let pendingToday = 0;
    let holdCount = 0;

    for (const t of todosToday) {
      const hasDailyRelation = getRelationLength(t, TODO_DAILY_REL_PROP) > 0;
      const isDoneByDaily = doneTodoIdsToday.has(t.id) || hasDailyRelation;

      const statusName = getStatusName(t, TODO_STATUS_PROP);
      const isHold = statusName === HOLD_STATUS_NAME;
      if (isHold) holdCount += 1;

      const isDone = isDoneByDaily || isHold;

      if (isDone) plannedDone += 1;
      else pendingToday += 1;
    }

    const plannedText = `${plannedDone}/${plannedTotal}`;

    return res.status(200).json({
      date: todayISO,
      doneLogTotal,
      plannedText,
      plannedDone,
      plannedTotal,
      pendingToday,
      holdCount,

      // ✅ 디버깅용(문제 생겼을 때 바로 확인 가능)
      meta: {
        envStandard: "NOTION_DAILY_DB_ID / NOTION_TODO_DB_ID",
        props: {
          DAILY_DATE_PROP,
          DAILY_TODO_REL_PROP,
          TODO_DATE_PROP,
          TODO_DAILY_REL_PROP,
          TODO_STATUS_PROP,
          HOLD_STATUS_NAME,
        },
        tz: "Asia/Seoul",
      },
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      message: e?.message || String(e),
    });
  }
}
