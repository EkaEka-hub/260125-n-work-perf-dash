// /assets/app.js (통합: KPI + this-month + month-compare)
(async function(){
  const $ = (id) => document.getElementById(id);

  function setText(id, text){
    const el = $(id);
    if(el) el.textContent = text;
  }

  function hideAppSections(){
    document.querySelectorAll("[data-app-section]").forEach(el => { el.style.display = "none"; });
  }

  function showSetup(title, need){
    hideAppSections();
    if(typeof window.renderSetupCard === "function"){
      window.renderSetupCard({
        mountId: "setupRoot",
        title,
        requiredEnv: need || ["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"],
      });
    }else{
      const r = $("setupRoot");
      if(r) r.innerHTML = `<div style="padding:14px;font-weight:900;color:rgba(180,35,24,1)">⚠️ 설정이 필요해요</div>`;
    }
  }

  function fmtDelta(n){
    const x = Number(n || 0);
    if(x > 0) return { t: `▲ ${x}`, c: "rgba(34,197,94,1)" };
    if(x < 0) return { t: `▼ ${Math.abs(x)}`, c: "rgba(239,68,68,1)" };
    return { t: "", c: "rgba(0,0,0,.45)" };
  }

  const COLOR_WORK = "rgba(59,130,246,0.78)";
  const COLOR_OUTCOME = "rgba(249,115,22,0.78)";
  const COLOR_ZERO = "rgba(0,0,0,0.18)";
  const COLOR_LAST = "rgba(0,0,0,0.18)";

  const API_URL = `/api/monthly${location.search || ""}`;

  async function getData(){
    const res = await fetch(API_URL, { cache:"no-store" });
    const data = await res.json().catch(()=> ({}));

    if(!res.ok || data?.error){
      const err = new Error(String(data?.error || `HTTP ${res.status}`));
      err.need = data?.hint?.requiredEnv || ["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"];
      err.raw = data;
      throw err;
    }
    return data;
  }

  function topLabel(labels, values){
    if(!Array.isArray(labels) || !Array.isArray(values) || labels.length === 0) return "-";
    let maxV = -Infinity, maxIdx = -1;
    for(let i=0;i<values.length;i++){
      const v = Number(values[i] ?? 0);
      if(v > maxV){ maxV = v; maxIdx = i; }
    }
    if(maxIdx < 0) return "-";
    const name = labels[maxIdx] ?? "-";
    const v = Number(values[maxIdx] ?? 0);
    return `${name}(${v})`;
  }

  // =========================
  // KPI 카드 렌더
  // =========================
  function renderKpi(kpi, data){
    if(!$("kpiMonth")) return;

    setText("kpiMonth", kpi.month ?? "-");

    const topWork = topLabel(data?.work?.labels || [], data?.work?.this || []);
    const topOutcome = topLabel(data?.outcome?.labels || [], data?.outcome?.this || []);
    setText("kpiTopWork", `최다 업무: ${topWork}`);
    setText("kpiTopOutcome", `최다 성과: ${topOutcome}`);

    setText("kpiTotalWork", kpi.monthlyTotalWork ?? 0);
    setText("kpiLastTotal", `전월: ${kpi.lastMonthlyTotalWork ?? "-"}건`);

    const d = fmtDelta(Number(kpi.deltaTotal ?? 0));
    const deltaEl = $("kpiDelta");
    if(deltaEl){
      deltaEl.textContent = d.t;
      deltaEl.style.color = d.c;
    }

    setText("kpiPlannedDone", kpi.plannedDone ?? 0);
    setText("kpiPlannedPending", kpi.plannedPending ?? 0);
    setText("kpiUnplanned", kpi.unplanned ?? 0);

    // ✅ api/monthly의 planRate는 이미 % 정수(예: 91)
    setText("kpiPlanRate", (kpi.planRate ?? 0));

    const done = Number(kpi.plannedDone ?? 0);
    const total = Number(kpi.plannedTotal ?? 0);
    setText("kpiDoneOverTotal", total ? `${done}/${total}` : "-/-");

    setText("kpiDoneRule", "완료 기준: 완료+보류");
    setText("kpiPendingRule", "기준: 예정+진행 중");
  }

  // =========================
  // this-month 가로 막대
  // ✅ 수정: 값 레이블을 “배경 없는 글씨만” + “괄호 제거”
  // =========================
  function renderThisMonthBars(containerId, labels, values, fillColor){
    const root = $(containerId);
    if(!root) return;

    root.innerHTML = "";

    // 값이 "(27)" 같은 문자열로 들어와도 숫자만 추출
    const nums = (values || []).map(v => {
      const s = String(v ?? "");
      const cleaned = s.replace(/[^\d.-]/g, ""); // 괄호/문자 제거
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    });

    const max = Math.max(1, ...nums);

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "10px";

    labels.forEach((name, i) => {
      const v = nums[i] || 0;
      const pct = Math.max(0, Math.min(100, (v / max) * 100));

      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "140px 1fr";
      row.style.gap = "10px";
      row.style.alignItems = "center";

      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.fontWeight = "900";
      label.style.color = "rgba(0,0,0,.85)";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.title = name;
      label.textContent = name;

      const track = document.createElement("div");
      track.style.height = "16px";
      track.style.borderRadius = "999px";
      track.style.background = "rgba(0,0,0,0.08)";
      track.style.position = "relative";
      track.style.overflow = "hidden";

      // fill (막대)
      const fill = document.createElement("div");
      fill.style.height = "100%";
      fill.style.width = pct.toFixed(2) + "%";
      fill.style.background = (v === 0 ? "rgba(0,0,0,0.14)" : fillColor);
      fill.style.borderRadius = "999px";
      fill.style.position = "absolute";
      fill.style.left = "0";
      fill.style.top = "0";
      fill.style.bottom = "0";
      // ✅ 숫자 영역 때문에 “덩어리” 생기지 않게: 최소폭 강제 X
      // fill.style.minWidth = ...

      track.appendChild(fill);

      // ✅ 값 레이블: 배경/패딩/라운드 없이 “글씨만”
      const valText = document.createElement("div");
      valText.textContent = String(v); // 괄호 없이 숫자만
      valText.style.position = "absolute";
      valText.style.left = "10px";
      valText.style.top = "50%";
      valText.style.transform = "translateY(-50%)";
      valText.style.fontSize = "11px";
      valText.style.fontWeight = "900";
      valText.style.lineHeight = "1";
      valText.style.background = "transparent";     // ✅ 배경 없음
      valText.style.padding = "0";                  // ✅ 패딩 없음
      valText.style.borderRadius = "0";             // ✅ 라운드 없음
      valText.style.pointerEvents = "none";

      // ✅ 정답 느낌: 막대 위의 텍스트처럼 (색은 너무 튀지 않게)
      // - 막대가 0이면 회색 트랙 위라 조금 더 진한 회색
      // - 막대가 있으면 파랑/주황 위라 흰색이 가독성 좋음
      valText.style.color = (v === 0 ? "rgba(0,0,0,.55)" : "rgba(255,255,255,0.95)");

      track.appendChild(valText);

      row.appendChild(label);
      row.appendChild(track);
      wrap.appendChild(row);
    });

    root.appendChild(wrap);
  }

  // =========================
  // month-compare 세로 막대
  // =========================
  function renderMonthCompareVertical(containerId, labels, lastArr, thisArr, thisColor) {
    const el = $(containerId);
    if (!el) return;

    el.innerHTML = "";
    el.style.overflow = "visible";

    const lastVals = (lastArr || []).map(v => Number(v) || 0);
    const thisVals = (thisArr || []).map(v => Number(v) || 0);
    const max = Math.max(1, ...lastVals, ...thisVals);

    const BAR_W = 30;
    const BAR_GAP = 1;
    const COL_W = 94;

    const BAR_H = 170;
    const TOP_SAFE = 28;
    const AREA_H = BAR_H + TOP_SAFE;

    const wrap = document.createElement("div");
    wrap.style.display = "inline-flex";
    wrap.style.width = "fit-content";
    wrap.style.gap = "4px";
    wrap.style.alignItems = "flex-end";
    wrap.style.justifyContent = "flex-start";
    wrap.style.flexWrap = "nowrap";

    labels.forEach((name, i) => {
      const vLast = Number(lastVals[i] || 0);
      const vThis = Number(thisVals[i] || 0);
      const diff = vThis - vLast;

      const col = document.createElement("div");
      col.style.width = COL_W + "px";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.alignItems = "center";
      col.style.gap = "8px";
      col.style.flex = "0 0 auto";

      const chartArea = document.createElement("div");
      chartArea.style.position = "relative";
      chartArea.style.height = AREA_H + "px";
      chartArea.style.width = "100%";
      chartArea.style.display = "flex";
      chartArea.style.alignItems = "flex-end";
      chartArea.style.justifyContent = "center";
      chartArea.style.gap = BAR_GAP + "px";
      chartArea.style.paddingTop = TOP_SAFE + "px";

      const mkBar = (value, color) => {
        const barWrap = document.createElement("div");
        barWrap.style.width = BAR_W + "px";
        barWrap.style.height = "100%";
        barWrap.style.display = "flex";
        barWrap.style.alignItems = "flex-end";
        barWrap.style.position = "relative";

        const bar = document.createElement("div");
        bar.style.width = "100%";
        bar.style.height = "0px";
        bar.style.transition = "height .25s ease";
        bar.style.background = (value === 0 ? COLOR_ZERO : color);
        bar.style.borderRadius = "6px";
        bar.style.position = "relative";

        const val = document.createElement("div");
        val.style.position = "absolute";
        val.style.left = "50%";
        val.style.transform = "translateX(-50%)";
        val.style.fontSize = "11px";
        val.style.fontWeight = "900";
        val.textContent = String(value);
        bar.appendChild(val);

        barWrap.appendChild(bar);

        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        requestAnimationFrame(() => {
          const h = (pct / 100) * BAR_H;
          bar.style.height = h.toFixed(1) + "px";

          if (h < 26) {
            val.style.top = "-16px";
            val.style.color = "rgba(0,0,0,.55)";
            barWrap.__valOutside = true;
          } else {
            val.style.top = "6px";
            val.style.color = "rgba(0,0,0,.60)";
            barWrap.__valOutside = false;
          }

          barWrap.__barH = h;
        });

        return { barWrap };
      };

      const lastBar = mkBar(vLast, COLOR_LAST);
      const thisBar = mkBar(vThis, thisColor);

      chartArea.appendChild(lastBar.barWrap);
      chartArea.appendChild(thisBar.barWrap);

      if (diff !== 0) {
        const delta = document.createElement("div");
        delta.style.position = "absolute";
        delta.style.width = BAR_W + "px";
        delta.style.textAlign = "center";
        delta.style.whiteSpace = "nowrap";
        delta.style.overflow = "hidden";
        delta.style.textOverflow = "ellipsis";
        delta.style.fontSize = "11px";
        delta.style.fontWeight = "900";
        delta.style.pointerEvents = "none";

        delta.textContent = diff > 0 ? `▲ ${diff}` : `▼ ${Math.abs(diff)}`;
        delta.style.color = diff > 0 ? "rgba(34,197,94,1)" : "rgba(239,68,68,1)";

        requestAnimationFrame(() => {
          const h = Number(thisBar.barWrap.__barH || 0);
          const valOutside = !!thisBar.barWrap.__valOutside;

          const leftPx = thisBar.barWrap.offsetLeft + (BAR_W / 2);
          delta.style.left = leftPx + "px";
          delta.style.transform = "translateX(-50%)";

          let bottom = h + 6;
          if (valOutside) bottom = h + 24;

          const maxBottom = BAR_H + TOP_SAFE - 8;
          if (bottom > maxBottom) bottom = maxBottom;
          if (bottom < 10) bottom = 10;

          delta.style.bottom = bottom + "px";
        });

        chartArea.appendChild(delta);
      }

      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.fontWeight = "900";
      label.style.color = "rgba(0,0,0,.85)";
      label.style.textAlign = "center";
      label.style.whiteSpace = "normal";
      label.style.lineHeight = "1.1";
      label.style.maxWidth = "100%";
      label.style.display = "-webkit-box";
      label.style.webkitBoxOrient = "vertical";
      label.style.webkitLineClamp = "2";
      label.style.overflow = "hidden";
      label.title = name;
      label.textContent = String(name).replace(/·/g, "·\u200b");

      col.appendChild(chartArea);
      col.appendChild(label);
      wrap.appendChild(col);
    });

    el.appendChild(wrap);
  }

  try{
    const data = await getData();

    // KPI
    if(data?.kpi) renderKpi(data.kpi, data);

    // this-month
    if($("chartWorkThis") && data?.work){
      renderThisMonthBars("chartWorkThis", data.work.labels || [], data.work.this || [], COLOR_WORK);
    }
    if($("chartOutcomeThis") && data?.outcome){
      renderThisMonthBars("chartOutcomeThis", data.outcome.labels || [], data.outcome.this || [], COLOR_OUTCOME);
    }

    // month-compare
    if($("chartWorkDelta") && data?.work){
      renderMonthCompareVertical("chartWorkDelta", data.work.labels || [], data.work.last || [], data.work.this || [], COLOR_WORK);
    }
    if($("chartOutcomeDelta") && data?.outcome){
      renderMonthCompareVertical("chartOutcomeDelta", data.outcome.labels || [], data.outcome.last || [], data.outcome.this || [], COLOR_OUTCOME);
    }

  } catch(e){
    const msg = String(e?.message || e);

    // ✅ “Missing …” 류면 setup 카드 유지
    if(msg.includes("Missing")){
      showSetup(
        $("kpiMonth") ? "Monthly KPI" : ($("chartWorkThis") ? "This Month" : "Month Compare"),
        e?.need
      );
      return;
    }

    // 그 외 에러는 화면에 표시
    if($("kpiMonth")){
      setText("kpiMonth", "오류");
      setText("kpiTopWork", "최다 업무: -");
      setText("kpiTopOutcome", "최다 성과: -");
      setText("kpiLastTotal", "전월: -");
      setText("kpiDoneRule", msg);
    }

    ["chartWorkThis","chartOutcomeThis","chartWorkDelta","chartOutcomeDelta"].forEach(id=>{
      const el = $(id);
      if(el) el.innerHTML = `<div style="font-size:12px;font-weight:900;color:rgba(239,68,68,.9)">${msg}</div>`;
    });
  }
})();
