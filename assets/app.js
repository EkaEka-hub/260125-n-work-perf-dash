// /assets/app.js (KPI + month-compare) + Missing env 안내 UI 유지
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
    return { t: "", c: "rgba(0,0,0,.45)" };
  }

  const COLOR_WORK = "rgba(59,130,246,0.78)";
  const COLOR_OUTCOME = "rgba(249,115,22,0.78)";
  const COLOR_ZERO = "rgba(0,0,0,0.18)";
  const COLOR_LAST = "rgba(0,0,0,0.18)";

  const API_URL = `/api/monthly${location.search || ""}`;

  function setupHtml(pageTitle){
    const origin = location.origin;
    const urls = [
      `${origin}/today`,
      `${origin}/kpi`,
      `${origin}/this-month`,
      `${origin}/month-compare`,
    ].join("\n");

    return `
      <div style="max-width:640px;margin:16px auto;padding:0 12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',Arial,sans-serif;">
        <div style="background:#fff7c9;border-radius:18px;padding:14px 14px;box-shadow:0 1px 2px rgba(0,0,0,.04);">
          <div style="font-size:12px;font-weight:700;color:rgba(0,0,0,.55);margin:0 0 10px;">${pageTitle} ·</div>
          <div style="display:flex;align-items:center;gap:8px;margin:0 0 12px;">
            <div style="font-size:18px;line-height:1;">⚠️</div>
            <div style="font-size:16px;font-weight:900;color:#d11;">설정이 필요해요</div>
          </div>

          <div style="background:rgba(255,255,255,.55);border-radius:14px;padding:12px 12px;">
            <div style="font-size:13px;font-weight:800;margin:0 0 8px;">1) Vercel 프로젝트에서 환경변수를 입력해야 위젯이 작동합니다.</div>
            <div style="font-size:13px;font-weight:900;margin:0 0 6px;">2) 필수 3개:</div>
            <ul style="margin:0 0 10px 18px;padding:0;font-size:13px;font-weight:800;">
              <li><code style="background:#fff;border:1px solid rgba(0,0,0,.12);padding:2px 6px;border-radius:999px;">NOTION_TOKEN</code></li>
              <li><code style="background:#fff;border:1px solid rgba(0,0,0,.12);padding:2px 6px;border-radius:999px;">NOTION_DAILY_DB_ID</code></li>
              <li><code style="background:#fff;border:1px solid rgba(0,0,0,.12);padding:2px 6px;border-radius:999px;">NOTION_TODO_DB_ID</code></li>
            </ul>
            <div style="font-size:13px;font-weight:800;margin:0 0 10px;">3) 배포 후 노션에는 아래 4개 주소를 임베드하세요.</div>

            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <button id="btnCopyEmbeds" style="border:0;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;background:#111;color:#fff;cursor:pointer;">4개 임베드 주소 복사</button>
              <button id="btnReload" style="border:0;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;background:rgba(0,0,0,.2);color:#111;cursor:pointer;">다시 불러오기</button>
            </div>
            <pre id="embedList" style="margin:10px 0 0;font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-all;background:transparent;border:0;color:rgba(0,0,0,.7);">${urls}</pre>
          </div>
        </div>
      </div>
    `;
  }

  function mountSetup(pageTitle){
    document.body.innerHTML = setupHtml(pageTitle);
    const btnCopy = document.getElementById("btnCopyEmbeds");
    const btnReload = document.getElementById("btnReload");
    const text = document.getElementById("embedList")?.textContent || "";

    if(btnCopy){
      btnCopy.addEventListener("click", async () => {
        try{
          await navigator.clipboard.writeText(text.trim());
          btnCopy.textContent = "복사됨!";
          setTimeout(()=>btnCopy.textContent="4개 임베드 주소 복사", 900);
        }catch(e){
          // 클립보드 실패 시 그냥 선택이라도 쉽게
          alert("복사가 안되면 아래 주소를 드래그해서 복사해줘.");
        }
      });
    }
    if(btnReload){
      btnReload.addEventListener("click", () => location.reload());
    }
  }

  async function getData(){
    const res = await fetch(API_URL, { cache:"no-store" });
    const data = await res.json();

    // monthly API가 500일 때도 json을 주니까 여기서 Missing env 잡기
    if(data?.error){
      const need = data?.hint?.requiredEnv || ["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"];
      const isMissing = String(data.error).includes("Missing NOTION_") || String(data.error).includes("Missing env");
      if(isMissing){
        const err = new Error("Missing env");
        err.code = "MISSING_ENV";
        err.need = need;
        throw err;
      }
      throw new Error(data.error);
    }

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
  // KPI 카드 렌더 (원래 기대하던 레이아웃)
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

    // ✅ % 두 번 곱하는 실수 방지: API의 planRate(정수 %) 그대로 표시
    setText("kpiPlanRate", kpi.planRate ?? 0);

    const done = Number(kpi.plannedDone ?? 0);
    const total = Number(kpi.plannedTotal ?? 0);
    setText("kpiDoneOverTotal", total ? `${done}/${total}` : "-/-");

    setText("kpiDoneRule", "완료 기준: 완료+보류");
    setText("kpiPendingRule", "기준: 예정+진행 중");
  }

  // =========================
  // 전월대비 세로막대 (month-compare) — 원래 기대하던 그래프
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

    // month-compare
    if($("chartWorkDelta") && data?.work){
      renderMonthCompareVertical("chartWorkDelta", data.work.labels || [], data.work.last || [], data.work.this || [], COLOR_WORK);
    }
    if($("chartOutcomeDelta") && data?.outcome){
      renderMonthCompareVertical("chartOutcomeDelta", data.outcome.labels || [], data.outcome.last || [], data.outcome.this || [], COLOR_OUTCOME);
    }

  } catch(e){
    if(e?.code === "MISSING_ENV"){
      // 페이지별 타이틀
      const t =
        $("kpiMonth") ? "Monthly KPI" :
        ($("chartWorkDelta") || $("chartOutcomeDelta")) ? "Month Compare" :
        "Setup";
      mountSetup(t);
      return;
    }

    const msg = String(e?.message || e);

    if($("kpiMonth")){
      setText("kpiMonth", "오류");
      setText("kpiTopWork", "최다 업무: -");
      setText("kpiTopOutcome", "최다 성과: -");
      setText("kpiLastTotal", "전월: -");
      setText("kpiDoneRule", msg);
    }

    ["chartWorkDelta","chartOutcomeDelta"].forEach(id=>{
      const el = $(id);
      if(el) el.innerHTML = `<div style="font-size:12px;font-weight:900;color:rgba(239,68,68,.9)">${msg}</div>`;
    });
  }
})();
