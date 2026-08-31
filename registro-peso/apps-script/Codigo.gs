/**
 * Registro de peso — servidor.
 *
 * Atende os dois modos de hospedagem da mesma página:
 *
 *   estático (GitHub Pages)  -> doGet(?api=1) e doPost, respondendo JSON
 *   servido daqui            -> doGet() devolve Pagina.html, e o navegador
 *                               fala com lerHistorico/gravarPeso por
 *                               google.script.run (sem HTTP, sem CORS)
 *
 * A planilha é a única fonte da verdade. Uma linha por dia: regravar a mesma
 * data sobrescreve, então corrigir é reenviar.
 */

/**
 * Deixe vazio. Um script aberto pela planilha (Extensões › Apps Script) já
 * roda dentro dela e descobre sozinho qual é — não precisa de ID, e assim
 * funciona em qualquer conta e com qualquer planilha, sem editar nada aqui.
 *
 * Só preencha se você criou um script INDEPENDENTE (script.google.com), e
 * nesse caso use o ID da planilha desta mesma conta: é o trecho entre /d/ e
 * /edit na URL dela.
 */
var ID_PLANILHA = '';

var ABA = 'Registros';
var CABECALHO = ['data', 'peso'];

/* ---- acesso à planilha --------------------------------------------------- */

/**
 * Devolve a aba pronta para uso, criando-a com o cabeçalho na primeira vez.
 * A coluna da data fica formatada como texto: sem isso o Sheets converte
 * "2026-08-31" em número de série e a comparação por string quebra.
 */
/**
 * A planilha de trabalho.
 *
 * Se o script foi aberto por "Extensões › Apps Script", ele é VINCULADO à
 * planilha e o container já é ela: nesse caso não existe documento externo a
 * abrir, e nenhuma permissão de acesso a outro arquivo é necessária.
 * openById() fica só para o caso de script independente.
 */
function planilha_() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();   // null em script independente
  } catch (erro) {
    ss = null;
  }
  if (ss) return ss;

  var quem = '';
  try { quem = Session.getEffectiveUser().getEmail(); } catch (e) {}

  if (!ID_PLANILHA) {
    throw new Error(
      'Este script não está vinculado a nenhuma planilha e ID_PLANILHA está ' +
      'vazio. O caminho mais simples: abra a SUA planilha e vá em ' +
      'Extensões › Apps Script — aí ele passa a enxergar a planilha sozinho. ' +
      'Se preferir manter um script independente, preencha ID_PLANILHA com o ' +
      'ID da planilha desta conta (' + (quem || 'conta atual') + ').'
    );
  }

  try {
    return SpreadsheetApp.openById(ID_PLANILHA);
  } catch (erro) {
    throw new Error(
      'Não consegui abrir a planilha ' + ID_PLANILHA + '. Este script roda ' +
      'como "' + (quem || 'conta desconhecida') + '" — confira se essa conta é ' +
      'mesmo a dona dessa planilha. IDs de planilhas de outra conta não ' +
      'funcionam aqui. (' + erro.message + ')'
    );
  }
}

function aba_() {
  var ss = planilha_();
  var sh = ss.getSheetByName(ABA);

  if (!sh) {
    // Planilha nova vem com uma "Página1" vazia: aproveita em vez de sobrar.
    var abas = ss.getSheets();
    if (abas.length === 1 && abas[0].getLastRow() === 0) {
      sh = abas[0].setName(ABA);
    } else {
      sh = ss.insertSheet(ABA);
    }
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Normaliza para "AAAA-MM-DD", aceitando texto ou Date digitado à mão. */
function comoIso_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/* ---- operações ----------------------------------------------------------- */

/** Histórico inteiro, ordenado por data. Chamado por fetch e por google.script.run. */
function lerHistorico() {
  var sh = aba_();
  var ultima = sh.getLastRow();
  if (ultima < 2) return [];

  var linhas = sh.getRange(2, 1, ultima - 1, 2).getValues();
  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var data = comoIso_(linhas[i][0]);
    var peso = Number(linhas[i][1]);
    if (data && isFinite(peso) && peso > 0) saida.push({ data: data, peso: peso });
  }
  saida.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  return saida;
}

/**
 * Grava um dia. Sobrescreve se a data já existir — é isso que impede linha
 * duplicada quando o botão é tocado duas vezes, e o que permite corrigir.
 */
function gravarPeso(reg) {
  var data = comoIso_(reg && reg.data);
  var peso = Number(reg && reg.peso);

  if (!data) throw new Error('data inválida');
  if (!isFinite(peso) || peso < 20 || peso > 400) throw new Error('peso fora da faixa');
  peso = Math.round(peso * 10) / 10;

  // Duas abas abertas ao mesmo tempo poderiam inserir a mesma data duas vezes.
  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var sh = aba_();
    var ultima = sh.getLastRow();
    var alvo = 0;

    if (ultima >= 2) {
      var datas = sh.getRange(2, 1, ultima - 1, 1).getValues();
      for (var i = 0; i < datas.length; i++) {
        if (comoIso_(datas[i][0]) === data) { alvo = i + 2; break; }
      }
    }

    if (!alvo) alvo = ultima + 1;
    sh.getRange(alvo, 1).setNumberFormat('@').setValue(data);
    sh.getRange(alvo, 2).setValue(peso);
    SpreadsheetApp.flush();
  } finally {
    trava.releaseLock();
  }

  return { ok: true, data: data, peso: peso };
}

/* ---- pontas HTTP --------------------------------------------------------- */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sem ?api=1 serve a página. Com ?api=1 devolve o histórico em JSON, que é o
 * que a cópia hospedada no GitHub Pages consome.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === '1') {
    try {
      return json_(lerHistorico());
    } catch (erro) {
      return json_({ erro: String(erro && erro.message || erro) });
    }
  }

  try {
    return HtmlService.createHtmlOutputFromFile('Pagina')
      .setTitle('Peso')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (erro) {
    // Servir a pagina daqui e opcional. Sem o arquivo Pagina.html, esta URL so
    // funciona como API — que e o suficiente para a versao no GitHub Pages.
    return HtmlService.createHtmlOutput(
      '<pre style="font:14px ui-monospace,monospace;padding:24px;line-height:1.6">' +
      'Este web app esta no ar e respondendo como API.\n\n' +
      'A interface esta hospedada no GitHub Pages. Se voce quer servi-la\n' +
      'daqui tambem, crie um arquivo HTML chamado "Pagina" neste projeto e\n' +
      'cole nele o conteudo de apps-script/Pagina.html.\n\n' +
      'Teste da API: acrescente ?api=1 a esta URL.' +
      '</pre>'
    ).setTitle('Peso');
  }
}

/**
 * Corpo em text/plain com JSON dentro: requisição simples, sem preflight
 * OPTIONS — que um web app do Apps Script não tem como responder.
 */
function doPost(e) {
  try {
    var corpo = e && e.postData && e.postData.contents;
    if (!corpo) throw new Error('corpo vazio');
    return json_(gravarPeso(JSON.parse(corpo)));
  } catch (erro) {
    return json_({ erro: String(erro && erro.message || erro) });
  }
}

/* ---- conferência manual -------------------------------------------------- */

/**
 * Rode uma vez no editor: cria a aba e mostra em qual conta e em qual planilha
 * o script realmente caiu — que é o que resolve erro de permissão.
 */
function testar() {
  var quem = '';
  try { quem = Session.getEffectiveUser().getEmail(); } catch (e) {}
  Logger.log('rodando como: %s', quem || '(desconhecido)');

  var vinculado = null;
  try { vinculado = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  Logger.log('vinculado a uma planilha: %s', vinculado ? 'sim' : 'não (script independente)');

  var ss = planilha_();
  Logger.log('planilha: "%s"', ss.getName());
  Logger.log('URL: %s', ss.getUrl());

  var sh = aba_();
  Logger.log('aba "%s" pronta, %s linha(s)', sh.getName(), sh.getLastRow());
  Logger.log('histórico: %s', JSON.stringify(lerHistorico()));
}
