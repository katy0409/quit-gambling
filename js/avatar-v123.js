/* Restart V12.3.1 layered avatar preview
   Uses the real user-provided PNG layers. This preview intentionally supports
   the assets currently available: shared body/head, male/female default face,
   and male hairstyle 001 front/back. */
(function(){
  const ASSET_ROOT='assets/avatar';
  const layer=(src,name)=>`<img class="avatar-png-layer ${name}" src="${ASSET_ROOT}/${src}" alt="">`;

  window.avatarV123Markup=function(gender='male',size='full'){
    const female=gender==='female';
    return `<div class="avatar-png avatar-png-${size}" data-gender="${female?'female':'male'}">
      ${female?'':layer('hair/male/male_hair_001_back.png','layer-hair-back')}
      ${layer('body/body_base.png','layer-body')}
      ${layer('head/head_base.png','layer-head')}
      ${layer(`face/${female?'female':'male'}_face_default.png`,'layer-face')}
      ${female?'':layer('hair/male/male_hair_001_front.png','layer-hair-front')}
    </div>`;
  };

  // Replace the temporary SVG renderer with the real layered PNG renderer.
  avatarSvg=function(size='full'){
    const char=(typeof STARTER_CHARACTERS!=='undefined'&&STARTER_CHARACTERS.find(x=>x.id===state.game.character))||{gender:'male'};
    return window.avatarV123Markup(char.gender,size);
  };

  avatarSvgForStarter=function(char){
    return window.avatarV123Markup(char.gender,'select');
  };

  renderCharacterChoices=function(){
    const box=$('characterChoices');
    if(!box)return;
    box.innerHTML=`
      <div class="v123-preview-note">
        <strong>V12.3.1 比例修正版</strong>
        <span>已修正頭部、表情與前後髮共用定位點；身體保持原尺寸，頭部群組縮放為 72%。</span>
      </div>
      <section class="starter-group">
        <h3>♂ 男生角色</h3>
        <div class="starter-grid v123-starter-grid">
          <button class="starter-character ${state.game.pendingCharacter==='male-1'?'selected':''}" onclick="previewCharacter('male-1')">
            <span>男生初始 1</span>${window.avatarV123Markup('male','select')}
          </button>
        </div>
      </section>
      <section class="starter-group">
        <h3>♀ 女生角色</h3>
        <div class="starter-grid v123-starter-grid">
          <button class="starter-character ${state.game.pendingCharacter==='female-1'?'selected':''}" onclick="previewCharacter('female-1')">
            <span>女生初始表情預覽</span>${window.avatarV123Markup('female','select')}
            <small class="v123-missing">女生髮型尚未加入</small>
          </button>
        </div>
      </section>`;
  };

  // V12.3 currently has one real hairstyle. Starter 2–5 remain hidden until assets exist.
  const originalConfirm=confirmCharacter;
  confirmCharacter=function(){
    originalConfirm();
    if(state.game.character){
      state.game.avatarEngine='v12.3.1-anchored-png';
      save();
      renderGame();
      renderGameHome();
    }
  };

  function refreshV123(){
    try{
      if(state&&state.game&&state.game.character){renderGameHome();}
    }catch(e){console.warn('V12.3.1 avatar refresh skipped',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshV123);
  else refreshV123();
})();
