// /assets/setup-card.js
(function(){
  function copyText(text){
    try{
      if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    }catch(e){}
    try{
      const ta=document.createElement("textarea");
      ta.value=text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }catch(e){}
  }

  window.renderSetupCard = function(opts){
    const {
      mountId="setupRoot",
      title="Setup",
      requiredEnv=["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"],
      routes=null,
      warnText="설정이 필요해요",
    } = (opts||{});

    const root = document.getElementById(mountId);
    if(!root) return;

    const list = (Array.isArray(requiredEnv) && requiredEnv.length)
      ? requiredEnv
      : ["NOTION_TOKEN","NOTION_DAILY_DB_ID","NOTION_TODO_DB_ID"];

    const four = routes && Array.isArray(routes) && routes.length
      ? routes
      : ["/today","/kpi","/this-month","/month-compare"].map(p=>`${location.origin}${p}`);

    root.innerHTML = `
      <div class="setupWrap">
        <div class="setupTitle">${title}</div>
        <div class="setupBodyTitle"><span class="warnIcon">⚠️</span><span>${warnText}</span></div>
        <div class="setupBox">
          <div class="setupStep"><b>1)</b> Vercel 프로젝트에서 <b>환경변수</b>를 입력해야 위젯이 작동합니다.</div>
          <div class="setupStep"><b>2)</b> 필수 ${list.length}개:</div>
          <ul class="envList">${list.map(k=>`<li><span class="pill">${k}</span></li>`).join("")}</ul>
          <div class="setupStep" style="margin-top:10px;"><b>3)</b> 배포 후 노션에는 아래 <b>4개 주소</b>를 임베드하세요.</div>
          <div class="btnRow">
            <button class="btn" id="copyRoutes">4개 임베드 주소 복사</button>
            <button class="btn secondary" id="retry">다시 불러오기</button>
          </div>
        </div>
      </div>
    `;

    const routesText = four.join("\n");
    const btnCopy = document.getElementById("copyRoutes");
    const btnRetry = document.getElementById("retry");
    if(btnCopy) btnCopy.onclick = ()=>copyText(routesText);
    if(btnRetry) btnRetry.onclick = ()=>location.reload();
  };
})();
