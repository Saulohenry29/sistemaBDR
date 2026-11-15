/* Atlas Scanner: leitura e conferência; movimentação efetiva fica nas RPCs oficiais.
 * Não gravar patrimônio/remessa diretamente neste módulo. */
(function(){
  'use strict';

  const estado={modo:'automatico',itens:[],busy:false,camera:null,cameraAtiva:false,cameraIniciando:false,cameraToken:0,stream:null,detector:null,loopId:null,ultimoCodigo:'',ultimoMs:0};
  const $=id=>document.getElementById(id);
  const texto=v=>String(v??'').trim();
  const maius=v=>texto(v).toUpperCase();
  const esc=v=>texto(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const banco=()=>window.client||window.supabaseClient;
  function usuario(){
    try{return JSON.parse(localStorage.getItem('usuario_logado')||localStorage.getItem('usuarioLogado')||'null');}
    catch(_){return null;}
  }
  function autorizacao(p){return window.BDRMenuPermissoes?.temPermissao?.(p,usuario())===true;}
  function obraOperacional(){return Number($('asObra')?.value||0);}
  function obrasPermitidas(u){
    if(Number(u?.id)===1)return null; // Somente owner tem escopo global.
    const valores=window.BDRAcessoObras?.idsObrasPermitidas?.(u);
    if(Array.isArray(valores))return new Set(valores.map(Number).filter(Number.isSafeInteger));
    const ids=[u?.obra_id];
    const raw=u?.obras_liberadas;
    if(Array.isArray(raw))ids.push(...raw);
    else if(raw!=null){
      try{const json=JSON.parse(String(raw));if(Array.isArray(json))ids.push(...json);else ids.push(...String(raw).split(/[;,|]/));}
      catch(_){ids.push(...String(raw).split(/[;,|]/));}
    }
    return new Set(ids.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0));
  }
  async function carregarObras(){
    const sel=$('asObra');
    const b=banco();
    if(!b){aviso('O banco de dados não carregou. Confira a conexão.','erro');return;}
    try{
      const u=usuario();
      const permitidas=obrasPermitidas(u);
      if(permitidas&&permitidas.size===0){
        sel.innerHTML='<option value="">Nenhuma obra liberada para este usuário</option>';
        contexto();aviso('Solicite ao administrador acesso à obra onde você vai operar.','erro');return;
      }
      let q=b.from('obras').select('id,codigo_obra,nome,ativa,ativo').order('codigo_obra',{ascending:true});
      if(permitidas)q=q.in('id',[...permitidas]);
      const {data,error}=await q;
      if(error)throw error;
      const obras=(data||[]).filter(o=>o.ativa!==false&&o.ativo!==false)
        .filter(o=>!permitidas||permitidas.has(Number(o.id)));
      sel.innerHTML='<option value="">Selecione a obra desta operação...</option>'+obras.map(o=>
        `<option value="${Number(o.id)}">${esc([texto(o.codigo_obra),texto(o.nome)].filter(Boolean).join(' — ')||('Obra '+o.id))}</option>`
      ).join('');
      const principal=Number(u?.obra_id||0);
      if(principal&&obras.some(o=>Number(o.id)===principal))sel.value=String(principal);
      else if(obras.length===1)sel.value=String(obras[0].id);
      sel.dataset.anterior=sel.value;
      contexto();
      if(!obras.length)aviso('Não há obras ativas liberadas. Confira as permissões.','erro');
      else if(!sel.value)aviso('Selecione a obra em que o funcionário está operando antes de bipar.');
    }catch(e){aviso('Não foi possível carregar as obras: '+(e?.message||e),'erro');}
  }
  function aviso(mensagem,tipo='info'){
    const el=$('asAviso');el.textContent=mensagem;el.className='as-aviso'+(tipo==='erro'?' erro':tipo==='sucesso'?' sucesso':'');
  }
  function sinal(ok){
    // Som SOMENTE após uma leitura; não tocar na inicialização do PWA.
    try{const a=new Audio(ok?'./assets/audio/scanner-ok.mp3':'./assets/audio/scanner-erro.mp3');a.volume=.22;a.play().catch(()=>{});}catch(_){ }
    if(ok&&navigator.vibrate)try{navigator.vibrate(45);}catch(_){ }
  }
  function codigoPat(valor){
    let bruto=texto(valor);
    // A etiqueta patrimonial pode conter PAT-xxx, número gravado ou URL com PAT.
    try{
      if(/^https?:\/\//i.test(bruto)){
        const u=new URL(bruto);
        bruto=u.searchParams.get('codigo_qr')||u.searchParams.get('codigo')||u.searchParams.get('pat')||u.searchParams.get('patrimonio')||u.searchParams.get('id')||
          decodeURIComponent(u.hash.replace(/^#/,''))||decodeURIComponent(u.pathname)||bruto;
      }
    }catch(_){ }
    bruto=maius(bruto);
    const pat=bruto.match(/(?:^|[^A-Z0-9])PAT[\s_:-]*(\d{1,18})(?!\d)/);
    if(pat)return 'PAT-'+pat[1];
    if(/^\d{1,18}$/.test(bruto))return 'PAT-'+bruto;
    return '';
  }
  function labelStatus(s){return maius(s).replaceAll('_',' ')||'SEM STATUS';}
  function render(){
    const itens=estado.itens;
    const env=itens.filter(x=>x.acao==='ENVIAR');
    const rp=itens.filter(x=>x.acao==='RP'||x.acao==='PED');
    const diretos=itens.filter(x=>x.acao==='DIRETO');
    $('asTotal').textContent=itens.length;
    $('asEnvioCount').textContent=env.length;
    $('asReceberCount').textContent=rp.length;
    $('asDiretoCount').textContent=diretos.length;
    $('asLista').innerHTML=itens.length?itens.map(x=>{
      const a=x.acao==='ENVIAR'?'Para envio':x.acao==='DIRETO'?'Sem remessa':x.acao==='PED'?'Pedido de Expedição':'Com remessa';
      const classe=x.acao==='DIRETO'?'direto':x.acao==='PED'?'pedido':'';
      return `<div class="as-item">
        <div class="as-item-content"><strong>${esc(x.codigo)} — ${esc(x.nome)}</strong><small>${esc(x.origemNome||`Obra ${x.obra_id}`)} · ${esc(labelStatus(x.status))}${x.referencia?' · '+esc(x.referencia):''}</small></div>
        <span class="as-tag ${classe}">${esc(a)}</span>
        <button type="button" class="as-remove" data-remove="${esc(x.codigo)}" aria-label="Remover ${esc(x.codigo)}"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    }).join(''):'<div class="as-empty">Nenhum patrimônio lido ainda.</div>';
    const origens=new Set(env.map(x=>x.obra_id));
    $('asContinuar').disabled=!env.length||origens.size!==1||rp.length>0||diretos.length>0;
    $('asContinuar').hidden=!(estado.modo==='enviar'||env.length);
    $('asContinuar').textContent=env.length?`Conferir transferência (${env.length})`:'Conferir transferência';
    const grupos=new Map();
    rp.forEach(x=>{
      const k=x.acao+':'+x.remessa_id;
      if(!grupos.has(k))grupos.set(k,[]);
      grupos.get(k).push(x);
    });
    $('asGrupos').innerHTML=[...grupos].map(([key,lista])=>{
      const x=lista[0],ehRp=x.acao==='RP';
      const qtd=Number(x.qtdRemessa||0), completo=ehRp&&qtd>0&&lista.length===qtd;
      return `<div class="as-grupo"><div class="as-grupo-title">${ehRp?'Remessa patrimonial':'Pedido de Expedição'} ${esc(x.referencia||x.remessa_id)}</div>
        <small>${lista.length} item(ns) lido(s)${ehRp&&qtd?' de '+qtd:''}. ${ehRp&&!completo?'Ainda há itens para conferir.':''}</small>
        <button type="button" class="as-btn as-outline" data-abrir="${esc(key)}">${completo?'Abrir confirmação oficial':'Abrir para conferir pendências'}</button>
      </div>`;
    }).join('')+(diretos.length?`<div class="as-grupo"><div class="as-grupo-title">${diretos.length} patrimônio(s) apresentados sem remessa</div>
      <small>Itens identificados. Para permitir a confirmação direta, falta habilitar uma operação atômica e auditada no banco. Nenhuma localização será alterada nesta etapa.</small>
      <button class="as-btn as-outline" type="button" disabled>Recebimento direto — aguardando integração segura</button></div>`:'');
    $('asObservacao').textContent=env.length&&rp.length?'Envios e recebimentos estão misturados. Retire os itens de outra operação para preparar o envio.':
      'A leitura apenas monta a conferência. O Atlas só altera bens após a confirmação no fluxo oficial.';
  }
  function sessaoObrigatoria(){
    const u=usuario();
    if(!u||Number(u.id||0)<1){location.replace('./login.html');return false;}
    if(!autorizacao('SCANNER_ACESSAR')){
      aviso('Seu usuário não tem acesso operacional ao Scanner.','erro');
      $('asForm').querySelector('input').disabled=true;
      $('asForm').querySelector('button').disabled=true;
      $('asCamera').disabled=true;
      return false;
    }
    return true;
  }
  function contexto(){
    const u=usuario();
    const id=obraOperacional();
    const selecao=id?texto($('asObra')?.selectedOptions?.[0]?.textContent):'selecione a obra';
    $('asContexto').textContent=`Responsável: ${u?.nome||u?.usuario||'Usuário'} · Operando em: ${selecao} · Leitura não movimenta patrimônio.`;
  }
  async function encontrarPatrimonio(codigo,valorOriginal){
    const b=banco();if(!b)throw new Error('Supabase indisponível. Verifique a conexão.');
    let {data,error}=await b.from('patrimonio').select('id,codigo_qr,codigo_antigo,nome_bem,status,obra_id,empresa_id,ativo').eq('codigo_qr',codigo).maybeSingle();
    if(error)throw error;
    if(!data&&valorOriginal){
      const antigo=texto(valorOriginal).replace(/^PAT-/i,'');
      for(const campo of ['codigo_antigo','codigo_bem']){
        if(data)break;
        const r=await b.from('patrimonio').select('id,codigo_qr,codigo_antigo,nome_bem,status,obra_id,empresa_id,ativo').eq(campo,antigo).limit(2);
        if(r.error)throw r.error;
        if((r.data||[]).length>1)throw new Error('Código antigo ambíguo. Informe o PAT completo.');
        data=r.data?.[0]||null;
      }
    }
    return data;
  }
  async function remessaVinculada(patrimonioId){
    const b=banco();
    const ir=await b.from('atlas_patrimonio_remessa_itens').select('remessa_id').eq('patrimonio_id',patrimonioId).limit(100);
    if(ir.error)throw ir.error;
    const ids=[...new Set((ir.data||[]).map(x=>Number(x.remessa_id)).filter(Boolean))];
    if(ids.length){
      const r=await b.from('atlas_patrimonio_remessas').select('id,codigo,status,obra_origem_id,obra_destino_id,total_itens').in('id',ids);
      if(r.error)throw r.error;
      const ativos=(r.data||[]).filter(x=>!['RECEBIDA','RECEBIDA_DIVERGENCIA','CANCELADA','RECUSADA'].includes(maius(x.status)));
      if(ativos.length>1)throw new Error('Patrimônio vinculado a múltiplas remessas ativas. Procure o responsável.');
      if(ativos.length){
        const x=ativos[0];
        const qtd=await b.from('atlas_patrimonio_remessa_itens').select('patrimonio_id',{head:true,count:'exact'}).eq('remessa_id',x.id);
        if(qtd.error)throw qtd.error;
        return {tipo:'RP',...x,qtdRemessa:qtd.count??x.total_itens};
      }
    }
    const ip=await b.from('itens_retirada').select('pedido_id').eq('patrimonio_id',patrimonioId).limit(100);
    if(ip.error)throw ip.error;
    const pids=[...new Set((ip.data||[]).map(x=>Number(x.pedido_id)).filter(Boolean))];
    if(!pids.length)return null;
    const rp=await b.from('pedidos_retirada').select('id,codigo,status,obra_origem_id,obra_destino_id,obra_id').in('id',pids);
    if(rp.error)throw rp.error;
    const ativos=(rp.data||[]).filter(x=>!['RECEBIDO','RECEBIDO_COM_DIVERGENCIA','ENTREGUE','RECUSADO','CANCELADO'].includes(maius(x.status)));
    if(ativos.length>1)throw new Error('Patrimônio vinculado a múltiplos pedidos ativos.');
    return ativos.length?{tipo:'PED',...ativos[0]}:null;
  }
  async function nomeObra(id){
    const {data,error}=await banco().from('obras').select('nome,codigo_obra').eq('id',id).maybeSingle();
    if(error)return `Obra ${id}`;
    return [texto(data?.codigo_obra),texto(data?.nome)].filter(Boolean).join(' - ')||`Obra ${id}`;
  }
  async function adicionar(valor,daCamera=false){
    if(estado.busy||!sessaoObrigatoria())return;
    const atual=obraOperacional();
    if(!atual){aviso('Selecione a obra de origem (envio) ou de destino (recebimento) antes de ler.','erro');return;}
    const codigo=codigoPat(valor);
    if(!codigo){aviso('Código inválido. Leia um QR PAT ou digite o número do patrimônio.','erro');sinal(false);return;}
    const agora=Date.now();
    if(estado.itens.some(x=>x.codigo===codigo)){
      aviso(`${codigo} já foi lido. Não foi adicionado novamente.`,'erro');sinal(false);return;
    }
    if(daCamera&&estado.ultimoCodigo===codigo&&agora-estado.ultimoMs<2100)return;
    estado.ultimoCodigo=codigo;estado.ultimoMs=agora;
    estado.busy=true;
    $('asForm').querySelector('button').disabled=true;
    try{
      const pat=await encontrarPatrimonio(codigo,valor);
      if(!pat)throw new Error(`${codigo} não encontrado ou fora do acesso do usuário.`);
      if(pat.ativo===false)throw new Error('Patrimônio inativo. A movimentação exige conferência administrativa.');
      const mov=await remessaVinculada(pat.id);
      let acao=estado.modo==='enviar'?'ENVIAR':estado.modo==='receber'?'RECEBER':'AUTOMATICO';
      if(acao==='AUTOMATICO')acao=mov?'RECEBER':(atual&&Number(pat.obra_id)===atual?'ENVIAR':'RECEBER');
      if(acao==='ENVIAR'){
        if(!autorizacao('PATRIMONIO_MOVIMENTAR'))throw new Error('Seu usuário não possui PATRIMONIO_MOVIMENTAR para enviar.');
        if(Number(pat.obra_id)!==atual)throw new Error(`Este patrimônio pertence a outra obra (${pat.obra_id}). Selecione a obra de origem correta.`);
        if(mov)throw new Error(`Já existe movimentação ativa (${mov.codigo||mov.id}) para este patrimônio.`);
        if(maius(pat.status)==='EM_TRANSITO')throw new Error('Patrimônio já está em trânsito. Não é permitido novo envio.');
        if(estado.itens.some(x=>x.acao!=='ENVIAR'))throw new Error('Há recebimentos na lista. Faça uma operação de cada vez.');
        if(estado.itens.some(x=>x.acao==='ENVIAR'&&Number(x.obra_id)!==Number(pat.obra_id)))throw new Error('Envie patrimônios de uma mesma obra por vez.');
      }else{
        if(!atual)throw new Error('O responsável precisa ter uma obra operacional (destino) configurada.');
        if(estado.itens.some(x=>x.acao==='ENVIAR'))throw new Error('Há envios na lista. Faça uma operação de cada vez.');
        if(mov){
          if(Number(mov.obra_destino_id||mov.obra_id)!==atual)throw new Error('Remessa destinada a outra obra. Não é possível receber aqui.');
          if(mov.tipo==='RP'&&maius(mov.status)!=='EM_TRANSITO')throw new Error(`Remessa ${mov.codigo||mov.id} ainda está em ${labelStatus(mov.status)}. Não é possível recebê-la diretamente.`);
          if(mov.tipo==='PED'&&!['EM_TRANSITO','AGUARDANDO_CONFERENCIA','A_RECEBER'].includes(maius(mov.status)))throw new Error('O pedido ainda não chegou à etapa de recebimento.');
          acao=mov.tipo;
        }else{
          if(maius(pat.status)==='EM_TRANSITO')throw new Error('Patrimônio em trânsito sem remessa visível. É necessário conferir antes de uma entrada direta.');
          if(Number(pat.obra_id)===atual)throw new Error('Este patrimônio já está cadastrado nesta obra. Não há entrada a realizar.');
          acao='DIRETO';
        }
      }
      const item={id:Number(pat.id),codigo:pat.codigo_qr||codigo,nome:pat.nome_bem||'Patrimônio',status:pat.status,obra_id:Number(pat.obra_id),acao,
        remessa_id:mov?.id||null,referencia:mov?.codigo||null,qtdRemessa:mov?.qtdRemessa||0,
        origemNome:await nomeObra(pat.obra_id)};
      if(estado.itens.some(x=>x.id===item.id))throw new Error('Patrimônio já está na conferência.');
      estado.itens.push(item);render();aviso(`${item.codigo} adicionado à conferência.`,'sucesso');sinal(true);
    }catch(e){aviso(e?.message||'Falha ao consultar patrimônio.','erro');sinal(false);}
    finally{estado.busy=false;$('asForm').querySelector('button').disabled=false;$('asCodigo').value='';if(!daCamera)$('asCodigo').focus({preventScroll:true});}
  }
  async function continuarEnvio(){
    const itens=estado.itens.filter(x=>x.acao==='ENVIAR');
    if(!itens.length||itens.length!==estado.itens.length)return aviso('Confira os itens de envio antes de continuar.','erro');
    if(!autorizacao('PATRIMONIO_MOVIMENTAR'))return aviso('Permissão de movimentação não disponível.','erro');
    const api=parent?.Atlas;
    if(!api?.abrirTransferenciaScanner)return aviso('Abra o Scanner pelo menu do Atlas para continuar.','erro');
    try{aviso('Abrindo confirmação oficial da transferência...');await api.abrirTransferenciaScanner(itens.map(x=>x.id));}
    catch(e){aviso(e?.message||'Não foi possível abrir transferência.','erro');}
  }
  async function abrirRemessa(chave){
    const [tipo,id]=chave.split(':');
    if(tipo==='PED'){
      if(!parent?.Atlas?.navigate)return aviso('Abra o Scanner pelo menu do Atlas.','erro');
      aviso('Abrindo Expedição para conferir o pedido...');
      parent.Atlas.navigate('expedicao.html?aba=transferencias&pedido='+encodeURIComponent(id));
      return;
    }
    if(tipo!=='RP')return aviso('Tipo de movimentação não reconhecido.','erro');
    const itens=estado.itens.filter(x=>x.acao==='RP'&&String(x.remessa_id)===id);
    const total=Number(itens[0]?.qtdRemessa||0);
    if(!total||itens.length!==total)return aviso(`Leia todos os itens da remessa antes de confirmar (${itens.length}/${total||'?'}).`,'erro');
    if(!autorizacao('PATRIMONIO_MOVIMENTAR'))return aviso('É necessária a permissão PATRIMONIO_MOVIMENTAR para receber.','erro');
    try{aviso('Abrindo recebimento oficial...');await parent.Atlas.abrirRecebimentoScanner(Number(id));}
    catch(e){aviso(e?.message||'Não foi possível abrir recebimento.','erro');}
  }
  function plataformaAndroid(){return /Android/i.test(navigator.userAgent||'');}
  function plataformaIOS(){return /iPhone|iPad|iPod/i.test(navigator.userAgent||'') || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  async function pararCamera(){
    ++estado.cameraToken; // Invalida leituras e inicializações atrasadas.
    estado.cameraAtiva=false;
    estado.cameraIniciando=false;
    if(estado.loopId!=null){cancelAnimationFrame(estado.loopId);estado.loopId=null;}
    try{estado.stream?.getTracks()?.forEach(t=>t.stop());}catch(_){ }
    estado.stream=null;
    estado.detector=null;
    const v=$('asNativeVideo');
    if(v){try{v.pause();}catch(_){ }v.srcObject=null;v.hidden=true;}
    const scan=estado.camera;estado.camera=null;
    if(scan){try{await scan.stop();}catch(_){ }try{await scan.clear();}catch(_){ }}
    const r=$('asReader');if(r)r.hidden=true;
    const c=$('asCamPlaceholder');if(c)c.hidden=false;
    $('asCamera').innerHTML='<i class="fa-solid fa-camera"></i> Abrir câmera';
  }
  function tratarCodigoCamera(valor,token){
    if(token!==estado.cameraToken||!estado.cameraAtiva||estado.busy)return;
    // A câmera continua aberta para bipar vários patrimônios em sequência.
    void adicionar(valor,true);
  }
  async function alternarCamera(){
    if(estado.cameraAtiva||estado.cameraIniciando){await pararCamera();return;}
    if(!sessaoObrigatoria())return;
    if(!obraOperacional())return aviso('Selecione a obra desta operação antes de abrir a câmera.','erro');
    if(!navigator.mediaDevices?.getUserMedia)return aviso('Câmera indisponível: use HTTPS ou localhost, ou digite o código.','erro');
    const token=++estado.cameraToken;
    estado.cameraIniciando=true;
    $('asReader').hidden=false;
    $('asCamPlaceholder').hidden=true;
    $('asCamera').innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Abrindo...';
    aviso('Aponte o QR Code para a câmera. A área inteira da imagem será analisada.');
    // Android: detector nativo que já é usado na Separação QR da Expedição.
    if(plataformaAndroid()&&window.BarcodeDetector){
      try{
        const v=$('asNativeVideo');
        $('asHtml5Reader').hidden=true;v.hidden=false;
        const detector=new BarcodeDetector({formats:['qr_code']});
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
        if(token!==estado.cameraToken){stream.getTracks().forEach(t=>t.stop());return;}
        estado.stream=stream;estado.detector=detector;v.srcObject=stream;
        await v.play();
        if(token!==estado.cameraToken)return;
        estado.cameraAtiva=true;estado.cameraIniciando=false;
        $('asCamera').innerHTML='<i class="fa-solid fa-camera-slash"></i> Fechar câmera';
        const detectar=async()=>{
          if(token!==estado.cameraToken||!estado.cameraAtiva)return;
          try{
            if(!estado.busy){
              const achados=await detector.detect(v);
              const valor=achados?.find(x=>x.rawValue)?.rawValue;
              if(valor)tratarCodigoCamera(valor,token);
            }
          }catch(_){ }
          if(token===estado.cameraToken&&estado.cameraAtiva)estado.loopId=requestAnimationFrame(detectar);
        };
        estado.loopId=requestAnimationFrame(detectar);
        return;
      }catch(e){
        console.warn('Scanner Atlas: detector nativo falhou, alternando para HTML5.',e);
        try{estado.stream?.getTracks()?.forEach(t=>t.stop());}catch(_){ }
        estado.stream=null;
        $('asNativeVideo').srcObject=null;
        $('asNativeVideo').hidden=true;
        $('asHtml5Reader').hidden=false;
      }
    }
    // Notebook/iPhone: mesma biblioteca da Expedição, sem qrbox de 230px.
    if(!window.Html5Qrcode){await pararCamera();return aviso('Biblioteca QR indisponível. Confira a conexão ou use leitor USB/digitação.','erro');}
    let scan;
    try{
      $('asNativeVideo').hidden=true;
      $('asHtml5Reader').hidden=false;
      const opt={verbose:false};
      if(window.Html5QrcodeSupportedFormats?.QR_CODE!=null)opt.formatsToSupport=[window.Html5QrcodeSupportedFormats.QR_CODE];
      scan=new Html5Qrcode('asHtml5Reader',opt);
      estado.camera=scan;
      let camera={facingMode:'environment'};
      if(!plataformaIOS()){
        try{
          const cameras=await Html5Qrcode.getCameras();
          const escolhida=cameras?.find(c=>/back|rear|environment|traseira|posterior/i.test(c.label||''))||cameras?.[0];
          if(escolhida)camera=escolhida.id;
        }catch(_){ }
      }
      if(token!==estado.cameraToken){await scan.clear().catch(()=>{});return;}
      // Sem qrbox: varredura na imagem inteira, como no leitor da Expedição.
      await scan.start(camera,{fps:plataformaIOS()?24:15,aspectRatio:1.333334,disableFlip:false},
        valor=>tratarCodigoCamera(valor,token),()=>{});
      if(token!==estado.cameraToken){await scan.stop().catch(()=>{});await scan.clear().catch(()=>{});return;}
      estado.cameraAtiva=true;estado.cameraIniciando=false;
      $('asCamera').innerHTML='<i class="fa-solid fa-camera-slash"></i> Fechar câmera';
    }catch(e){
      console.error('Scanner Atlas: falha ao iniciar câmera.',e);
      await pararCamera();
      aviso('Não foi possível abrir o leitor: '+(e?.message||'verifique o acesso à câmera.'),'erro');
    }
  }
  function init(){
    contexto();render();if(!sessaoObrigatoria())return;
    // Atualiza permissões locais pelas obras autorizadas no sistema; sem alteração no banco.
    Promise.resolve().then(()=>window.BDRAcessoObras?.sincronizarUsuarioAtual?.()).catch(()=>{}).then(()=>carregarObras());
    $('asObra').addEventListener('change',ev=>{
      if(estado.itens.length&&!confirm('Trocar a obra limpará a conferência atual. Deseja continuar?')){
        ev.target.value=ev.target.dataset.anterior||'';return;
      }
      estado.itens=[];estado.ultimoCodigo='';estado.ultimoMs=0;
      ev.target.dataset.anterior=ev.target.value;
      contexto();render();
      if(estado.cameraAtiva||estado.cameraIniciando)void pararCamera();
      aviso('Obra selecionada. Pronto para ler.');
    });
    document.querySelectorAll('[data-modo]').forEach(b=>b.addEventListener('click',()=>{
      const m=b.dataset.modo;
      if(m!==estado.modo&&estado.itens.length&&!confirm('Mudar de operação e limpar os itens lidos?'))return;
      estado.modo=m;estado.itens=[];estado.ultimoCodigo='';estado.ultimoMs=0;
      document.querySelectorAll('[data-modo]').forEach(x=>x.classList.toggle('ativo',x===b));
      render();aviso(m==='automatico'?'Scanner identificará a operação automaticamente.':m==='enviar'?'Modo envio: leia os patrimônios para desmobilização.':'Modo recebimento: leia os patrimônios que chegaram.');
    }));
    $('asForm').addEventListener('submit',ev=>{ev.preventDefault();void adicionar($('asCodigo').value);});
    $('asCamera').addEventListener('click',()=>void alternarCamera());
    $('asLimpar').addEventListener('click',()=>{if(estado.itens.length&&!confirm('Limpar a lista de conferência?'))return;estado.itens=[];estado.ultimoCodigo='';estado.ultimoMs=0;render();aviso('Lista limpa.');});
    $('asLista').addEventListener('click',ev=>{
      const b=ev.target.closest('[data-remove]');if(!b)return;
      estado.itens=estado.itens.filter(x=>x.codigo!==b.dataset.remove);render();
    });
    $('asGrupos').addEventListener('click',ev=>{const b=ev.target.closest('[data-abrir]');if(b)void abrirRemessa(b.dataset.abrir);});
    $('asContinuar').addEventListener('click',()=>void continuarEnvio());
    window.addEventListener('atlas:desativar',()=>void pararCamera());
    window.addEventListener('pagehide',()=>void pararCamera());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
