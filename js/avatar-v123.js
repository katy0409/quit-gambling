/* Restart V12.4 — layered PNG paper-doll avatar (MapleStory-style dress-up)
   ------------------------------------------------------------------------
   Every wardrobe slot maps to a transparent PNG layer that is stacked on the
   shared 1024px canvas. Clothes / shoes / hand items are drawn on the BODY
   canvas (1:1); hair / face / hat / glasses / earrings are drawn on the HEAD
   canvas (auto-scaled to 72% and shifted up 13.2% by the CSS, so head-body
   ratio stays correct). Missing art is skipped automatically, so you can drop
   new PNGs into assets/avatar/<slot>/... and they appear with no code change.

   ---- Asset naming convention (drop-in, auto-detected) --------------------
   Body   (shared)   assets/avatar/body/body_base.png
   Head   (shared)   assets/avatar/head/head_base.png
   Face   (default)  assets/avatar/face/<gender>_face_default.png   gender = male|female
   Hair              assets/avatar/hair/<gender>/<itemId>_front.png
                     assets/avatar/hair/<gender>/<itemId>_back.png
       colored hair  assets/avatar/hair/<gender>/<itemId>__<hairColorId>_front.png  (optional, tried first)
   Expression        assets/avatar/face/<gender>/<expressionId>.png   (overrides default face)
   Eye shape         assets/avatar/eye/<eyeShapeId>.png               (optional overlay)
   Eye color         assets/avatar/eyecolor/<eyeColorId>.png          (optional overlay)
   Top               assets/avatar/top/<itemId>.png        \
   Bottom            assets/avatar/bottom/<itemId>.png      | drawn on BODY canvas
   Set (one-piece)   assets/avatar/set/<itemId>.png         | (aligned to body_base)
   Shoes             assets/avatar/shoes/<itemId>.png       |
   Hand accessory    assets/avatar/handAccessory/<itemId>.png
   Handheld          assets/avatar/handheld/<itemId>.png   /
   Face accessory    assets/avatar/faceAccessory/<itemId>.png  \  drawn on HEAD canvas
   Earrings          assets/avatar/earrings/<itemId>.png        | (aligned to head_base)
   Head accessory    assets/avatar/headAccessory/<itemId>.png  /
   <itemId> is the wardrobe item id from GAME_ITEMS in app.js (e.g. top-hoodie).
*/
(function(){
  const ROOT='assets/avatar';

  // Bridge wardrobe ids -> existing on-disk hair basenames (keeps current art).
  const HAIR_ALIAS={'hair-m1':'male_hair_001'};

  // Defaults that are already baked into the base art -> no override layer needed.
  const DEFAULT_HAIR_COLOR='hair-brown';
  const DEFAULT_EXPRESSION='expression-soft';
  const DEFAULT_EYE_SHAPE='eye-round';
  const DEFAULT_EYE_COLOR='eye-brown';

  // Build one <img> layer from an ordered candidate list. First file that loads
  // wins; if a file 404s we fall back to the next; if all fail the layer hides.
  window.avatarLayerFallback=function(img){
    const fb=(img.getAttribute('data-fallback')||'').split('|').filter(Boolean);
    if(fb.length){img.setAttribute('data-fallback',fb.slice(1).join('|'));img.src=fb[0];}
    else{img.onerror=null;img.style.display='none';}
  };
  function layer(cls,candidates){
    const list=(candidates||[]).filter(Boolean);
    if(!list.length)return '';
    const [first,...rest]=list.map(s=>`${ROOT}/${s}`);
    const fb=rest.length?` data-fallback="${rest.join('|')}" onerror="avatarLayerFallback(this)"`:` onerror="avatarLayerFallback(this)"`;
    return `<img class="avatar-png-layer ${cls}" src="${first}"${fb} alt="">`;
  }

  function hairNames(hairId,colorId){
    const base=HAIR_ALIAS[hairId]||hairId;
    const names=[];
    if(colorId&&colorId!==DEFAULT_HAIR_COLOR)names.push(`${base}__${colorId}`);
    names.push(base);
    return names;
  }

  function genderOfCharacter(charId){
    const c=(typeof STARTER_CHARACTERS!=='undefined')&&STARTER_CHARACTERS.find(x=>x.id===charId);
    return c&&c.gender==='female'?'female':'male';
  }

  // Compose the full paper-doll markup for one set of equipped items.
  window.avatarPngMarkup=function(eq,gender,size){
    eq=eq||{};
    const g=gender==='female'?'female':'male';
    const s=size||'full';
    const hairId=eq.hair||'';
    const set=eq.set||'';
    const top=set?'':(eq.top||'');
    const bottom=set?'':(eq.bottom||'');
    const shoes=eq.shoes||'';
    const expression=eq.expression&&eq.expression!==DEFAULT_EXPRESSION?eq.expression:'';
    const eyeShape=eq.eyeShape&&eq.eyeShape!==DEFAULT_EYE_SHAPE?eq.eyeShape:'';
    const eyeColor=eq.eyeColor&&eq.eyeColor!==DEFAULT_EYE_COLOR?eq.eyeColor:'';

    const hairFront=hairNames(hairId,eq.hairColor).map(n=>`hair/${g}/${n}_front.png`);
    const hairBack =hairNames(hairId,eq.hairColor).map(n=>`hair/${g}/${n}_back.png`);
    const face=[expression?`face/${g}/${expression}.png`:'',`face/${g}_face_default.png`];

    return `<div class="avatar-png avatar-png-${s}" data-gender="${g}">
      ${hairId?layer('layer-hair-back',hairBack):''}
      ${layer('layer-body',['body/body_base.png'])}
      ${bottom?layer('layer-bottom',[`bottom/${bottom}.png`]):''}
      ${set?layer('layer-set',[`set/${set}.png`]):''}
      ${top?layer('layer-top',[`top/${top}.png`]):''}
      ${shoes?layer('layer-shoes',[`shoes/${shoes}.png`]):''}
      ${eq.handAccessory?layer('layer-hand',[`handAccessory/${eq.handAccessory}.png`]):''}
      ${layer('layer-head',['head/head_base.png'])}
      ${layer('layer-face',face)}
      ${eyeShape?layer('layer-eyeshape',[`eye/${eyeShape}.png`]):''}
      ${eyeColor?layer('layer-eyecolor',[`eyecolor/${eyeColor}.png`]):''}
      ${eq.faceAccessory?layer('layer-faceacc',[`faceAccessory/${eq.faceAccessory}.png`]):''}
      ${hairId?layer('layer-hair-front',hairFront):''}
      ${eq.earrings?layer('layer-earrings',[`earrings/${eq.earrings}.png`]):''}
      ${eq.headAccessory?layer('layer-headacc',[`headAccessory/${eq.headAccessory}.png`]):''}
      ${eq.handheld?layer('layer-handheld',[`handheld/${eq.handheld}.png`]):''}
    </div>`;
  };

  // ---- Wire the PNG engine into the existing game UI ----------------------
  // app.js calls avatarSvg(size, equippedOverride) for the home avatar, the
  // studio avatar, every wardrobe/shop thumbnail and the character select.
  // Overriding it here makes all of those render the layered PNG paper-doll,
  // so equipping / trying on an item changes the avatar live.
  avatarSvg=function(size='full',equippedOverride=null){
    if(typeof ensureGameState==='function')ensureGameState();
    const eq=equippedOverride||(state&&state.game&&state.game.equipped)||{};
    const gender=genderOfCharacter(state&&state.game&&state.game.character);
    return window.avatarPngMarkup(eq,gender,size);
  };

  function refreshAvatar(){
    try{if(typeof state!=='undefined'&&state.game&&state.game.character&&typeof renderGameHome==='function')renderGameHome();}
    catch(e){console.warn('V12.4 avatar refresh skipped',e);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshAvatar);
  else refreshAvatar();
})();
