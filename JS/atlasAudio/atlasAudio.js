/* ATLAS AUDIO V3.1 — efeitos curtos via Web Audio API.
   Mantem os arquivos de som oficiais, mas nao cria elementos HTMLAudio
   que podem aparecer como midia / Play no iOS.
   API publica permanece: notificacao, scannerOK, scannerErro, concluido,
   liberar, parar, pararTodos, definirVolume, volume, liberado.
*/
(function () {
  'use strict';

  if (window.AtlasAudio && window.AtlasAudio.__loaded) return;

  const CONFIG = {
    volume: 0.85,
    arquivos: {
      notificacao: 'assets/audio/notificacao.mp3',
      scannerOK: 'assets/audio/scanner-ok.mp3',
      scannerErro: 'assets/audio/scanner-erro.mp3',
      concluido: 'assets/audio/concluido.mp3'
    },
    intervaloMinimoMs: 180,
    intervaloNotificacaoGlobalMs: 1800
  };
  const buffers = new Map();
  const carregamentos = new Map();
  const ativos = new Map();
  const pendentes = new Set();
  const ultimoToque = new Map();
  let contexto = null;

  function obterContexto() {
    if (contexto && contexto.state !== 'closed') return contexto;
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) return null;
    try { contexto = new Classe({ latencyHint: 'interactive' }); }
    catch (_) { contexto = new Classe(); }
    return contexto;
  }

  async function liberar() {
    const ctx = obterContexto();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.state === 'running';
    } catch (_) { return false; }
  }

  function obterBuffer(nome) {
    if (buffers.has(nome)) return Promise.resolve(buffers.get(nome));
    if (carregamentos.has(nome)) return carregamentos.get(nome);
    const arquivo = CONFIG.arquivos[nome];
    if (!arquivo) return Promise.resolve(null);
    const promessa = fetch(arquivo, {cache:'force-cache'})
      .then(resposta => {
        if (!resposta.ok) throw new Error('Arquivo de efeito indisponivel');
        return resposta.arrayBuffer();
      })
      .then(bytes => obterContexto().decodeAudioData(bytes))
      .then(buffer => {buffers.set(nome,buffer);return buffer;})
      .catch(erro => {
        console.warn('Atlas Audio: efeito indisponivel, usando sinal curto.',nome);
        return null;
      })
      .finally(()=>carregamentos.delete(nome));
    carregamentos.set(nome,promessa);
    return promessa;
  }

  function encerrar(nome) {
    const atual=ativos.get(nome);
    if (!atual) return;
    ativos.delete(nome);
    try{ atual.source.stop(0); }catch(_){}
    try{ atual.source.disconnect(); }catch(_){}
    try{ atual.gain.disconnect(); }catch(_){}
  }

  function iniciarEfeito(nome,ctx,buffer) {
    encerrar(nome);
    const gain=ctx.createGain();
    gain.gain.setValueAtTime(CONFIG.volume,ctx.currentTime);
    gain.connect(ctx.destination);

    let source;
    if (buffer) {
      source=ctx.createBufferSource();
      source.buffer=buffer;
      source.connect(gain);
      source.onended=()=>{if(ativos.get(nome)?.source===source)encerrar(nome);};
      ativos.set(nome,{source,gain});
      source.start(0);
    } else {
      // Reserva segura quando um arquivo nao puder ser decodificado.
      // Tambem usa Web Audio: nenhuma sessao HTMLAudio/MP3 fica tocavel.
      source=ctx.createOscillator();
      source.type='sine';
      const frequencia={notificacao:880,scannerOK:1046,scannerErro:330,concluido:988}[nome]||660;
      source.frequency.setValueAtTime(frequencia,ctx.currentTime);
      gain.gain.setValueAtTime(0.0001,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.005,CONFIG.volume*0.16),ctx.currentTime+0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.14);
      source.connect(gain);
      source.onended=()=>{if(ativos.get(nome)?.source===source)encerrar(nome);};
      ativos.set(nome,{source,gain});
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime+0.15);
    }
  }

  async function tocar(nome) {
    if (!CONFIG.arquivos[nome]) return false;
    const agora=Date.now();
    const ultimo=ultimoToque.get(nome)||0;
    if (agora-ultimo < CONFIG.intervaloMinimoMs ||
        ativos.has(nome) || pendentes.has(nome)) return false;

    // Evita avisos repetidos entre paginas/abas.
    if (nome==='notificacao') {
      try {
        const chave='atlas_audio_notificacao_ultimo_toque';
        if (agora-Number(localStorage.getItem(chave)||0) < CONFIG.intervaloNotificacaoGlobalMs) return false;
      }catch(_){}
    }

    pendentes.add(nome);
    try {
      if (!await liberar()) return false;
      const ctx=obterContexto();
      const buffer=await obterBuffer(nome);
      if (ctx.state!=='running' && !await liberar()) return false;
      iniciarEfeito(nome,ctx,buffer);
      ultimoToque.set(nome,agora);
      if (nome==='notificacao') {
        try{localStorage.setItem('atlas_audio_notificacao_ultimo_toque',String(agora));}catch(_){}
      }
      return true;
    } catch (e) {
      console.warn('Atlas Audio: nao foi possivel emitir efeito.',e?.message||e);
      return false;
    } finally {
      pendentes.delete(nome);
    }
  }

  function parar(nome){encerrar(nome);}
  function pararTodos(){[...ativos.keys()].forEach(encerrar);}
  function definirVolume(valor){
    const n=Number(valor);
    if(!Number.isFinite(n)||n<0||n>1) return false;
    CONFIG.volume=n;
    for(const {gain} of ativos.values()){
      gain.gain.setValueAtTime(n,contexto?.currentTime||0);
    }
    return true;
  }

  // Libera a AudioContext numa interacao real, sem reproduzir MP3 mudo.
  for(const evento of ['pointerdown','touchstart','click','keydown']) {
    document.addEventListener(evento,()=>{void liberar();},{once:true,passive:true});
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pararTodos();});

  window.AtlasAudio={
    __loaded:true,
    versao:'3.1-web-audio-sem-midia',
    notificacao:()=>tocar('notificacao'),
    scannerOK:()=>tocar('scannerOK'),
    scannerErro:()=>tocar('scannerErro'),
    concluido:()=>tocar('concluido'),
    liberar,parar,pararTodos,definirVolume,
    get liberado(){return contexto?.state==='running';},
    get volume(){return CONFIG.volume;}
  };
})();