(function(){
  const KEY = "BDR_MENU_MOBILE_SCROLL_X";

  function menu(){
    return document.querySelector(".bdr-sidebar");
  }

  function salvarPosicao(){
    const m = menu();
    if(!m || window.innerWidth > 1200) return;
    localStorage.setItem(KEY, String(m.scrollLeft || 0));
  }

  function restaurarPosicao(){
    const m = menu();
    if(!m || window.innerWidth > 1200) return;

    const pos = Number(localStorage.getItem(KEY) || 0);

    requestAnimationFrame(() => {
      m.scrollLeft = pos;
      setTimeout(() => { m.scrollLeft = pos; }, 50);
      setTimeout(() => { m.scrollLeft = pos; }, 200);
    });
  }

  document.addEventListener("pointerdown", function(e){
    if(e.target.closest(".bdr-menu-btn")){
      salvarPosicao();
    }
  }, true);

  document.addEventListener("click", function(e){
    if(e.target.closest(".bdr-menu-btn")){
      salvarPosicao();
    }
  }, true);

  document.addEventListener("DOMContentLoaded", function(){
    restaurarPosicao();

    const m = menu();
    if(m){
      m.addEventListener("scroll", salvarPosicao, { passive:true });
    }
  });

  window.addEventListener("pageshow", restaurarPosicao);
  window.addEventListener("beforeunload", salvarPosicao);
})();