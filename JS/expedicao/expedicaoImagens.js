/* ATLAS EXPEDIÇÃO — IMAGENS V1 (reservado para evolução futura)
   Este módulo será carregado sob demanda quando fotos forem ativadas.
   Não executa consultas nem afeta a performance atual. */
(function(global){
  'use strict';
  global.AtlasExpedicaoImagens=global.AtlasExpedicaoImagens||{
    __loaded:true,
    url(item){ return item?.foto_url||item?.imagem_url||''; },
    possui(item){ return Boolean(this.url(item)); }
  };
})(window);
