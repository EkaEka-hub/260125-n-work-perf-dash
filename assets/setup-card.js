export function renderSetupCard({ mountId="app", title="Notion Widget", need, routes=[] } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const req = Array.isArray(need) && need.length
    ? need
    : ["NOTION_TOKEN", "NOTION_DAILY_DB_ID", "NOTION_TODO_DB_ID"];

  const routeText = routes.length
    ? routes.map(p => `${location.origin}${p}`).join("\n")
    : `${location.origin}/today`;

  const copy = (text) => { try{ navigator.clipboard.writeText(text); }catch(e){} };

  mount.innerHTML = `
    <div class="setupWrap">
      <div class="setupCard">
        <div class="setupTitleRow">
          <div class="setupTitle">${title}</div>
        </div>

        <div class="setupBodyTitle">설정이 필요해요</div>

        <div class="setupBox">
          <div class="setupStep"><b>1)</b> Vercel 프로젝트에서 <b>환경변수</b>를 입력해야 위젯이 작동합니다.</div>
          <div class="setupStep"><b>2)</b> 필수 3개:</div>
          <ul class="envList">
            ${req.map(k => `<li><span class="pill">${k}</span></li>`).join("")}
          </ul>
          <div class="setupStep" style="margin-top:10px;">
            <b>3)</b> 배포 후 노션에는 아래 경로를 임베드하세요.
          </div>

          <div class="btnRow">
            <button class="btn" id="copyRoutes">임베드 주소 복사</button>
            <button class="btn secondary" id="retry">다시 불러오기</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("copyRoutes").onclick = () => copy(routeText);
  document.getElementById("retry").onclick = () => location.reload();
}
