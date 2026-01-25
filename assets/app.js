// /assets/app.js (통합: KPI + this-month + month-compare)
(async function(){
  const $ = (id) => document.getElementById(id);

  function setText(id, text){
    const el = $(id);
    if(el) el.textContent = text;
  }

  function fmtDelta(n){
    const x = Number(n || 0);
    if(x > 0) return { t: `▲ ${x}`, c: "rgba(34,197,94,1)" };
    if(x < 0) return { t: `▼ ${Math.abs(x)}`, c: "rgba(239,68,68,1)" };
    return { t: "", c: "rgba(0,0,0,.45)" }; // 0이면 표시 안함
  }

  const COLOR_WORK = "rgba(59,130,246,0.78)";     // 업무: 파랑
  const COLOR_OUTCOME = "rgba(249,115,22,0.78)";  // 성과: 주황
  const COLOR_ZERO = "rgba(0,0,0,0.18)";
  const COLOR_LAST = "rgba(0,0,0,0.18)";

  const API_URL = `/api/monthly${location.search || ""}`;

  async function getData(){
    const res = await fetch(API_URL, { cache:"no-store" });
    const data = await res.json();
    if(data?.error) throw new Error(data.error);
    return data;
  }

  // ✅ 최다 라벨(건수 포함) — "일반행정(26)" 형태
  function topLabel(labels, values){
    if(!Array.isArray(labels) || !Array.isArray(values) || labels.length === 0) return "-";
    let maxV = -Infinity;
    let maxIdx = -1;
    for(let i=0;i<values.length;i++){
      const v = Number(values[i] ?? 0);
      if(v > maxV){
        maxV = v;
        maxIdx = i;
      }
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
    if(!$("kpiMonth")) return; // KPI 페이지 아니면 스킵

    setText("kpiMonth", kpi.month ?? "-");

    // ✅ ‘업무유형/성과유형’이 아니라 ‘최다 업무/최다 성과’
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
    setText("kpiPlanRate", kpi.planRate ?? 0);

    const done = Number(kpi.plannedDone ?? 0);
    const total = Number(kpi.plannedTotal ?? 0);
    setText("kpiDoneOverTotal", total ? `${done}/${total}` : "-/-");

    setText("kpiDoneRule", "완료 기준: 완료+보류");
    setText("kpiPendingRule", "기준: 예정+진행 중");
  }

  // =========================
  // 이번달 가로막대 (this-month)
  // =========================
  function renderThisMonthBars(containerId, labels, values, fillColor){
    const root = $(containerId);
    if(!root) return;

    root.innerHTML = "";

    const vals = (values || []).map(Number);
    const max = Math.max(1, ...vals);

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "10px";

    labels.forEach((name, i) => {
      const v = Number(vals[i] || 0);
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
      track.style.borderRadius = "8px";
      track.style.background = "rgba(0,0,0,0.06)";
      track.style.position = "relative";
      track.style.overflow = "hidden";

      const fill = document.createElement("div");
      fill.style.height = "100%";
      fill.style.width = pct.toFixed(2) + "%";
      fill.style.background = (v === 0 ? COLOR_ZERO : fillColor);
      fill.style.borderRadius = "8px";
      fill.style.position = "relative";
      fill.style.minWidth = v === 0 ? "10px" : "0px";

      // ✅ 값 레이블: 흰색, 막대 시작점
      const val = document.createElement("div");
      val.textContent = String(v);
      val.style.position = "absolute";
      val.style.left = "10px";
      val.style.top = "50%";
      val.style.transform = "translateY(-50%)";
      val.style.fontSize = "11px";
      val.style.fontWeight = "900";
      val.style.color = (v === 0 ? "rgba(0,0,0,.55)" : "rgba(255,255,255,0.95)");
      val.style.pointerEvents = "none";
      fill.appendChild(val);

      track.appendChild(fill);

      row.appendChild(label);
      row.appendChild(track);
      wrap.appendChild(row);
    });

    root.appendChild(wrap);
  }

  // =========================
  // 전월대비 세로막대 (month-compare)
  // =========================
  function renderMonthCompareVertical(containerId, labels, lastArr, thisArr, thisColor) {
    const el = $(containerId);
    if (!el) return;

    el.innerHTML = "";
    el.style.overflow = "visible";

    const lastVals = (lastArr || []).map(Number);
    const thisVals = (thisArr || []).map(Number);
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
    wrap.style.gap = "4px";               // ✅ [요청] 유형별(카테고리) 간격 최소화
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

          // ✅ 값 레이블 기존 규칙 유지
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

      // ✅ 변동 레이블: (가로) 이번달 막대 중앙 / (세로) 막대 바로 위 / (폭) 막대 폭 안에서만
      if (diff !== 0) {
        const delta = document.createElement("div");
        delta.style.position = "absolute";
        delta.style.width = BAR_W + "px";         // ✅ 막대 폭 안에만
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

          // ✅ 가로: 이번달 막대 중앙
          const leftPx = thisBar.barWrap.offsetLeft + (BAR_W / 2);
          delta.style.left = leftPx + "px";
          delta.style.transform = "translateX(-50%)";

          // ✅ 세로: 막대 바로 위 (값 레이블이 밖이면 겹침 방지)
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
