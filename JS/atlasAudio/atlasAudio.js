/* =========================================================
   ATLAS AUDIO ENGINE V2.0
   Arquivo: JS/atlasAudio.js

   Melhorias:
   - Não reinicia um áudio enquanto ele ainda está tocando.
   - Libera automaticamente quando o áudio termina.
   - Evita sobreposição de chamadas iguais.
========================================================= */
(function(){
  'use strict';

  if(window.AtlasAudio && window.AtlasAudio.__loaded){
    console.warn('AtlasAudio já carregado. Ignorando duplicado.');
    return;
  }

  const CONFIG = {
    pasta:'./assets/audio/',
    volumeGeral:0.65,
    sons:{
      notificacao:'notificacao.mp3',
      scan_ok:'scan_ok.mp3',
      scan_erro:'scan_erro.mp3',
      scan_final:'scan_final.mp3',
      sucesso:'sucesso.mp3',
      erro:'erro.mp3',
      alerta:'alerta.mp3'
    }
  };

  const estado={
    liberado:false,
    audioCtx:null,
    cache:new Map(),
    reproduzindo:new Set(),
    silencioso:localStorage.getItem('atlas_audio_silencioso')==='1'
  };

  function caminho(nome){
    return CONFIG.sons[nome] ? CONFIG.pasta + CONFIG.sons[nome] : '';
  }

  function obterAudio(nome){
    if(!CONFIG.sons[nome]) return null;

    if(!estado.cache.has(nome)){
      const a=new Audio(caminho(nome));
      a.preload='auto';
      a.volume=CONFIG.volumeGeral;
      estado.cache.set(nome,a);
    }
    return estado.cache.get(nome);
  }

  async function liberar(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){
        if(!estado.audioCtx) estado.audioCtx=new Ctx();
        if(estado.audioCtx.state==='suspended') await estado.audioCtx.resume();
      }
      estado.liberado=true;
      return true;
    }catch(e){
      console.warn('AtlasAudio: não foi possível liberar o áudio.',e);
      return false;
    }
  }

  function registrarLiberacaoAutomatica(){
    const fn=async()=>{
      await liberar();
      ['click','pointerdown','touchstart','keydown'].forEach(ev=>{
        document.removeEventListener(ev,fn,true);
      });
    };
    ['click','pointerdown','touchstart','keydown'].forEach(ev=>{
      document.addEventListener(ev,fn,{capture:true,passive:true});
    });
  }

  function tocarBipReserva(){ return false; } // mantém API; raramente usado

  async function tocar(nome,opcoes={}){
    if(estado.silencioso) return false;
    if(estado.reproduzindo.has(nome)) return false;

    const audio=obterAudio(nome);
    if(!audio) return tocarBipReserva(nome);

    estado.reproduzindo.add(nome);

    const liberarEstado=()=>{
      estado.reproduzindo.delete(nome);
      audio.removeEventListener('ended',liberarEstado);
      audio.removeEventListener('error',liberarEstado);
    };

    audio.addEventListener('ended',liberarEstado,{once:true});
    audio.addEventListener('error',liberarEstado,{once:true});

    try{
      audio.pause();
      audio.currentTime=0;
      audio.volume=Math.max(0,Math.min(1,Number(opcoes.volume??CONFIG.volumeGeral)));
      await audio.play();
      return true;
    }catch(e){
      estado.reproduzindo.delete(nome);
      console.warn(`AtlasAudio: ${CONFIG.sons[nome]} não tocou.`,e);
      return tocarBipReserva(nome);
    }
  }

  function definirSilencioso(v){
    estado.silencioso=!!v;
    localStorage.setItem('atlas_audio_silencioso',estado.silencioso?'1':'0');
  }

  function definirVolume(v){
    CONFIG.volumeGeral=Math.max(0,Math.min(1,Number(v)||0.65));
    estado.cache.forEach(a=>a.volume=CONFIG.volumeGeral);
  }

  function preCarregar(){ Object.keys(CONFIG.sons).forEach(obterAudio); }

  window.AtlasAudio={
    __loaded:true,
    versao:'2.0.0',
    liberar,
    preCarregar,
    tocar,
    definirVolume,
    definirSilencioso,
    estaSilencioso:()=>estado.silencioso,
    notificacao:()=>tocar('notificacao'),
    sucesso:()=>tocar('sucesso'),
    erro:()=>tocar('erro'),
    alerta:()=>tocar('alerta'),
    scan:{
      ok:()=>tocar('scan_ok'),
      erro:()=>tocar('scan_erro'),
      final:()=>tocar('scan_final')
    }
  };

  registrarLiberacaoAutomatica();
  preCarregar();

  console.log('✅ ATLAS AUDIO ENGINE V2.0 carregado');
})();
