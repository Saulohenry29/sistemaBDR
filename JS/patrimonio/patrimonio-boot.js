/* ATLAS Patrimônio — inicialização de sessão */
verificarLogin();


/* =========================================================
   ATLAS PATRIMÔNIO — BLOQUEIO DE CARET FORA DOS CAMPOS
   O navegador não deve exibir cursor de digitação em textos,
   títulos, cards ou áreas vazias. Inputs e textareas permanecem
   editáveis e com cursor normal.
========================================================= */
(function configurarCursorPatrimonio(){
  const seletorEditavel = 'input, textarea, [contenteditable="true"]';

  document.addEventListener('selectstart', function(evento){
    if(!evento.target.closest(seletorEditavel)){
      evento.preventDefault();
    }
  }, true);

  document.addEventListener('mousedown', function(evento){
    if(evento.target.closest(seletorEditavel)) return;

    const ativo = document.activeElement;
    if(ativo && ativo.matches && ativo.matches(seletorEditavel)){
      ativo.blur();
    }
  }, true);
})();
