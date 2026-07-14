(function(){
  'use strict';

  const STORAGE_KEY = 'atlas_etiqueta_config_v1';

  const DEFAULTS = Object.freeze({
    larguraMm: 55,
    alturaMm: 35,
    paddingMm: 2,
    bordaMm: 0.45,
    raioMm: 2,
    logoEngrenagemMm: 8,
    logoBdrMm: 10.2,
    logoSubMm: 2.5,
    qrMm: 12.5,
    topoAlturaMm: 13.5,
    fonteInfoMm: 2.75,
    fonteCodigoMm: 4,
    espacoLinhas: 1.18,
    moverConteudoXmm: 0,
    moverConteudoYmm: 0,
    moverEngrenagemXmm: 0,
    moverEngrenagemYmm: 0,
    moverBdrXmm: 0,
    moverBdrYmm: 0,
    moverSubXmm: 0,
    moverSubYmm: 0,
    moverQrXmm: 0,
    moverQrYmm: 0,
    moverInfoXmm: 0,
    moverInfoYmm: 0,
    moverCodigoXmm: 0,
    moverCodigoYmm: 0,
    limiteLocal: 27,
    limiteItem: 29
  });

  function numero(valor, fallback){
    const n = Number(valor);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizar(config){
    const origem = config && typeof config === 'object' ? config : {};
    const resultado = {...DEFAULTS};
    Object.keys(DEFAULTS).forEach(chave => {
      if(!(chave in origem)) return;
      resultado[chave] = typeof DEFAULTS[chave] === 'number'
        ? numero(origem[chave], DEFAULTS[chave])
        : origem[chave];
    });
    return resultado;
  }

  function carregar(){
    try{
      return normalizar(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    }catch(error){
      console.warn('AtlasEtiquetaConfig: configuração inválida; usando padrão.', error);
      return {...DEFAULTS};
    }
  }

  function salvar(config){
    const finalConfig = normalizar(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalConfig));
    window.dispatchEvent(new CustomEvent('atlas:etiqueta-config-alterada', {detail: finalConfig}));
    return finalConfig;
  }

  function restaurar(){
    localStorage.removeItem(STORAGE_KEY);
    const padrao = {...DEFAULTS};
    window.dispatchEvent(new CustomEvent('atlas:etiqueta-config-alterada', {detail: padrao}));
    return padrao;
  }

  function aplicar(config, root){
    const c = normalizar(config || carregar());
    const alvo = root || document.documentElement;
    const vars = {
      '--etq-largura': `${c.larguraMm}mm`,
      '--etq-altura': `${c.alturaMm}mm`,
      '--etq-padding': `${c.paddingMm}mm`,
      '--etq-borda': `${c.bordaMm}mm`,
      '--etq-raio': `${c.raioMm}mm`,
      '--etq-engrenagem': `${c.logoEngrenagemMm}mm`,
      '--etq-bdr': `${c.logoBdrMm}mm`,
      '--etq-sub': `${c.logoSubMm}mm`,
      '--etq-qr': `${c.qrMm}mm`,
      '--etq-topo-altura': `${c.topoAlturaMm}mm`,
      '--etq-info': `${c.fonteInfoMm}mm`,
      '--etq-codigo': `${c.fonteCodigoMm}mm`,
      '--etq-line-height': String(c.espacoLinhas),
      '--etq-conteudo-x': `${c.moverConteudoXmm}mm`,
      '--etq-conteudo-y': `${c.moverConteudoYmm}mm`,
      '--etq-engrenagem-x': `${c.moverEngrenagemXmm}mm`,
      '--etq-engrenagem-y': `${c.moverEngrenagemYmm}mm`,
      '--etq-bdr-x': `${c.moverBdrXmm}mm`,
      '--etq-bdr-y': `${c.moverBdrYmm}mm`,
      '--etq-sub-x': `${c.moverSubXmm}mm`,
      '--etq-sub-y': `${c.moverSubYmm}mm`,
      '--etq-qr-x': `${c.moverQrXmm}mm`,
      '--etq-qr-y': `${c.moverQrYmm}mm`,
      '--etq-info-x': `${c.moverInfoXmm}mm`,
      '--etq-info-y': `${c.moverInfoYmm}mm`,
      '--etq-codigo-x': `${c.moverCodigoXmm}mm`,
      '--etq-codigo-y': `${c.moverCodigoYmm}mm`
    };
    Object.entries(vars).forEach(([nome, valor]) => alvo.style.setProperty(nome, valor));
    return c;
  }

  window.AtlasEtiquetaConfig = {
    STORAGE_KEY,
    DEFAULTS,
    carregar,
    salvar,
    restaurar,
    aplicar,
    normalizar
  };
})();
