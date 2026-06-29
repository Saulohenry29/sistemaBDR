/* =========================================================
   BDR LOCALIZADOR DE PRATELEIRA / QR - V1
   Compatível com:
   - prateleiras-3d.html
   - estoque.html

   Usa padrão definitivo:
   R1-F2-P02-C01-N02
========================================================= */
(function(){
  'use strict';

  function pad2(v){ return String(v || '').replace(/\D/g,'').padStart(2,'0'); }

  function normalizarEndereco(valor){
    let txt = String(valor || '')
      .trim()
      .replace(/^https?:\/\/[^?]+\?id=/i,'')
      .replace(/^END-/i,'')
      .replace(/\s+/g,'')
      .toUpperCase();

    const m = txt.match(/R(\d+)-F(\d+)-P(\d+)-C(\d+)-N(\d+)/i);
    if(!m) return txt;

    return `R${m[1]}-F${m[2]}-P${pad2(m[3])}-C${pad2(m[4])}-N${pad2(m[5])}`;
  }

  function extrairEndereco(texto){
    const txt = String(texto || '').toUpperCase();
    const m = txt.match(/(?:END-)?R\d+\s*-\s*F\d+\s*-\s*P\d+\s*-\s*C\d+\s*-\s*N\d+/i);
    return m ? normalizarEndereco(m[0]) : '';
  }

  window.bdrNormalizarEndereco = normalizarEndereco;
  window.bdrExtrairEndereco = extrairEndereco;

  function encontrarAreaParaLocalizador(){
    return document.querySelector('#previewEtiquetas')?.closest('.card') ||
           document.querySelector('#previewEtiquetas')?.parentElement ||
           document.querySelector('.bdr-main') ||
           document.querySelector('main') ||
           document.body;
  }

  function criarLocalizadorPrateleira(){
    if(document.getElementById('bdrLocalizadorPrateleira')) return;
    if(!document.querySelector('#previewEtiquetas') && !document.querySelector('.etiqueta-preview')) return;

    const card = document.createElement('div');
    card.id = 'bdrLocalizadorPrateleira';
    card.className = 'bdr-localizador-card';
    card.innerHTML = `
      <h3>📍 Localizador de QR / Prateleira</h3>
      <div class="bdr-localizador-row">
        <input id="bdrBuscaEnderecoQR" placeholder="Digite ou bipe o endereço. Ex: R1-F2-P01-C03-N02" autocomplete="off">
        <button type="button" class="bdr-localizador-btn-ok" id="bdrBtnLocalizarQR">Localizar</button>
        <button type="button" class="bdr-localizador-btn-clean" id="bdrBtnLimparQR">Limpar</button>
      </div>
      <div id="bdrResultadoLocalizador" class="bdr-localizador-info">
        Dica: você pode digitar C1/N2 ou C01/N02. O sistema padroniza automaticamente.
      </div>
    `;

    const area = encontrarAreaParaLocalizador();
    area.insertBefore(card, area.firstChild);

    document.getElementById('bdrBtnLocalizarQR')?.addEventListener('click', localizarEtiquetaPorEndereco);
    document.getElementById('bdrBtnLimparQR')?.addEventListener('click', limparFiltroEtiquetas);
    document.getElementById('bdrBuscaEnderecoQR')?.addEventListener('input', function(){
      if(String(this.value || '').trim().length >= 5) localizarEtiquetaPorEndereco();
      if(!String(this.value || '').trim()) limparFiltroEtiquetas();
    });
    document.getElementById('bdrBuscaEnderecoQR')?.addEventListener('keydown', function(e){
      if(e.key === 'Enter') localizarEtiquetaPorEndereco();
    });

    const locUrl = new URLSearchParams(location.search).get('loc') || new URLSearchParams(location.search).get('endereco');
    if(locUrl){
      setTimeout(function(){
        const input = document.getElementById('bdrBuscaEnderecoQR');
        if(input){
          input.value = normalizarEndereco(locUrl);
          localizarEtiquetaPorEndereco();
        }
      }, 700);
    }
  }

  function prepararEtiquetas(){
    document.querySelectorAll('.etiqueta-preview').forEach(function(card){
      if(card.dataset.bdrPreparada === '1') return;
      const end = extrairEndereco(card.innerText || card.textContent || '');
      if(end) card.dataset.bdrEndereco = end;
      card.dataset.bdrPreparada = '1';
      card.title = end ? `Endereço: ${end}` : 'Etiqueta BDR';
    });
  }

  function localizarEtiquetaPorEndereco(){
    prepararEtiquetas();
    const input = document.getElementById('bdrBuscaEnderecoQR');
    const result = document.getElementById('bdrResultadoLocalizador');
    const busca = normalizarEndereco(input?.value || '');

    let total = 0;
    let primeiro = null;
    const cards = Array.from(document.querySelectorAll('.etiqueta-preview'));

    if(!busca){ limparFiltroEtiquetas(); return; }

    cards.forEach(function(card){
      const end = card.dataset.bdrEndereco || extrairEndereco(card.innerText || card.textContent || '');
      const textoNormal = normalizarEndereco(card.innerText || card.textContent || '');
      const bate = end.includes(busca) || textoNormal.includes(busca);

      card.classList.toggle('bdr-etiqueta-selecionada', bate);
      card.style.display = bate ? '' : 'none';

      if(bate){
        total++;
        if(!primeiro) primeiro = card;
      }
    });

    if(primeiro){
      primeiro.scrollIntoView({behavior:'smooth', block:'center'});
      if(result){
        result.innerHTML = `<span class="bdr-localizador-achou">Encontrado: ${busca}</span> • ${total} etiqueta(s) exibida(s).`;
      }
    }else if(result){
      result.innerHTML = `<span class="bdr-localizador-nao-achou">Não encontrei: ${busca}</span> • confira se as etiquetas foram geradas.`;
    }
  }

  function limparFiltroEtiquetas(){
    document.querySelectorAll('.etiqueta-preview').forEach(function(card){
      card.style.display = '';
      card.classList.remove('bdr-etiqueta-selecionada');
    });
    const input = document.getElementById('bdrBuscaEnderecoQR');
    if(input) input.value = '';
    const result = document.getElementById('bdrResultadoLocalizador');
    if(result) result.innerHTML = 'Dica: você pode digitar C1/N2 ou C01/N02. O sistema padroniza automaticamente.';
  }

  window.bdrLocalizarEtiquetaEndereco = localizarEtiquetaPorEndereco;
  window.bdrLimparFiltroEtiquetas = limparFiltroEtiquetas;

  function ativarLocalizadorNoEstoque(){
    if(!/estoque\.html/i.test(location.pathname)) return;

    function aplicar(){
      document.querySelectorAll('.estoque-linha').forEach(function(linha){
        if(linha.dataset.bdrLocalizadorOk === '1') return;
        const endereco = extrairEndereco(linha.innerText || linha.textContent || '');
        if(!endereco) return;

        const alvo = linha.querySelector('.prod-local') || linha.lastElementChild || linha;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bdr-btn-localizar-3d';
        btn.innerHTML = '📍 3D';
        btn.title = `Abrir posição ${endereco} no endereçamento 3D`;
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          location.href = `prateleiras-3d.html?loc=${encodeURIComponent(endereco)}`;
        });
        alvo.appendChild(btn);
        linha.dataset.bdrLocalizadorOk = '1';
      });
    }

    setTimeout(aplicar, 800);
    const lista = document.getElementById('listaProdutos') || document.body;
    new MutationObserver(aplicar).observe(lista, {childList:true, subtree:true});
  }

  function ativarLocalizadorNaPrateleira(){
    if(!/prateleiras-3d\.html/i.test(location.pathname)) return;

    function aplicar(){
      prepararEtiquetas();
      criarLocalizadorPrateleira();
    }

    setTimeout(aplicar, 600);
    new MutationObserver(aplicar).observe(document.body, {childList:true, subtree:true});
  }

  document.addEventListener('DOMContentLoaded', function(){
    ativarLocalizadorNoEstoque();
    ativarLocalizadorNaPrateleira();
  });
})();
