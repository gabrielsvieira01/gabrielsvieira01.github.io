/**
 * QG — servidor.
 *
 * Atende os dois modos de hospedagem da mesma página:
 *
 *   estático (GitHub Pages)  -> doGet(?api=1) e doPost, respondendo JSON
 *   servido daqui            -> doGet() devolve Pagina.html, e o navegador
 *                               fala com lerTudo/aplicarOps por
 *                               google.script.run (sem HTTP, sem CORS)
 *
 *   [index.html] --fetch--> [Apps Script Web App] --> [Google Sheets]
 *                           doGet(?api=1) / doPost      Progresso | Plano!K | Registros
 *
 * Nasceu da fusão dos dois scripts irmãos (treinos e registro-peso), que já
 * tinham sido escritos com o mesmo desenho justamente para poderem virar um só.
 *
 * A planilha é a única fonte da verdade. O conteúdo dos treinos NÃO vem daqui —
 * está embutido no index.html pelo gerar-plano.mjs. Aqui trafega o que muda
 * todo dia: progresso e pesagens.
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

var ABA_PROGRESSO = 'Progresso';
var ABA_PLANO = 'Plano';
var ABA_REGISTROS = 'Registros';

var CABECALHO_PROGRESSO = ['semana', 'dia', 'tipo', 'quando'];
var CABECALHO_REGISTROS = ['data', 'peso'];

/** Onde a coluna "Feita?" e a primeira semana estão na aba Plano. */
var COLUNA_FEITA = 11; // K
var PRIMEIRA_LINHA_DE_SEMANA = 5;

/* ---- acesso à planilha --------------------------------------------------- */

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

/** A aba de progresso, criada com o cabeçalho na primeira gravação. */
function abaProgresso_() {
  var ss = planilha_();
  var sh = ss.getSheetByName(ABA_PROGRESSO);
  if (!sh) sh = ss.insertSheet(ABA_PROGRESSO);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CABECALHO_PROGRESSO.length)
      .setValues([CABECALHO_PROGRESSO]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  // A coluna do carimbo fica como texto. Sem isso o Sheets reconhece
  // "2026-09-01T12:04:00.000Z" como data, converte, e o que volta na leitura
  // não é mais o que o app gravou.
  sh.getRange('D:D').setNumberFormat('@');
  return sh;
}

/**
 * A aba das pesagens, criada com o cabeçalho na primeira gravação. A coluna da
 * data fica como texto: sem isso o Sheets converte "2026-08-31" em número de
 * série e a comparação por string quebra.
 */
function abaRegistros_() {
  var ss = planilha_();
  var sh = ss.getSheetByName(ABA_REGISTROS);
  if (!sh) sh = ss.insertSheet(ABA_REGISTROS);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CABECALHO_REGISTROS.length)
      .setValues([CABECALHO_REGISTROS]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** A aba do plano, se existir. Sem ela, só a coluna Feita? deixa de ser escrita. */
function abaPlano_() {
  return planilha_().getSheetByName(ABA_PLANO);
}

/**
 * Quantas semanas o plano tem, contadas pelos números da coluna A.
 *
 * getLastRow() seria mais curto e está errado: qualquer nota escrita abaixo da
 * última semana — e a planilha original tinha uma — faria o script tratar
 * linhas vazias como semanas 41, 42... Contar a coluna A amarra o número ao
 * que de fato é semana.
 */
function numeroDeSemanas_(plano) {
  var ultima = plano.getLastRow();
  if (ultima < PRIMEIRA_LINHA_DE_SEMANA) return 0;

  var col = plano.getRange(PRIMEIRA_LINHA_DE_SEMANA, 1,
                           ultima - PRIMEIRA_LINHA_DE_SEMANA + 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < col.length; i++) {
    if (typeof col[i][0] === 'number' && col[i][0] > 0) n = i + 1;
  }
  return n;
}

/** Normaliza para "AAAA-MM-DD", aceitando texto ou Date digitado à mão. */
function comoIso_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/* ---- leitura ------------------------------------------------------------- */

/**
 * O progresso inteiro, na forma que o app usa: feitos["semana:dia:tipo"] e
 * semanasFeitas["semana"]. As semanas fechadas saem da própria coluna Feita?
 * do plano, para que marcar "Sim" à mão na planilha também valha.
 */
function lerProgresso_() {
  var sh = abaProgresso_();
  var feitos = {};
  var ultima = sh.getLastRow();

  if (ultima >= 2) {
    var linhas = sh.getRange(2, 1, ultima - 1, 4).getValues();
    for (var i = 0; i < linhas.length; i++) {
      var semana = Number(linhas[i][0]);
      var dia = Number(linhas[i][1]);
      var tipo = String(linhas[i][2]);
      if (!semana || !(dia >= 0) || !tipo) continue;
      feitos[semana + ':' + dia + ':' + tipo] = String(linhas[i][3] || '');
    }
  }

  var semanasFeitas = {};
  var plano = abaPlano_();
  if (plano) {
    var n = numeroDeSemanas_(plano);
    if (n > 0) {
      var col = plano.getRange(PRIMEIRA_LINHA_DE_SEMANA, COLUNA_FEITA, n, 1).getValues();
      for (var j = 0; j < col.length; j++) {
        if (/^sim$/i.test(String(col[j][0]).trim())) semanasFeitas[j + 1] = true;
      }
    }
  }

  return { feitos: feitos, semanasFeitas: semanasFeitas };
}

/** Histórico de peso inteiro, ordenado por data. */
function lerRegistros_() {
  var sh = abaRegistros_();
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
 * Tudo o que o app precisa para desenhar, numa resposta só.
 *
 * Uma requisição em vez de duas não é economia à toa: no celular, a diferença
 * entre abrir o app e ele estar pronto é a soma das idas ao Apps Script, que
 * são lentas. Chamado tanto pelo fetch (?api=1) quanto por google.script.run.
 */
function lerTudo() {
  var progresso = lerProgresso_();
  return {
    feitos: progresso.feitos,
    semanasFeitas: progresso.semanasFeitas,
    registros: lerRegistros_()
  };
}

/* ---- escrita ------------------------------------------------------------- */

/**
 * Grava um dia de peso. Sobrescreve se a data já existir — é isso que impede
 * linha duplicada quando o botão é tocado duas vezes, e o que permite corrigir.
 *
 * NÃO toma trava: quem chama é aplicarOps(), que já segura a trava do lote
 * inteiro. Pedir a mesma trava de dentro dela seria, na melhor hipótese,
 * trabalho repetido.
 */
function gravarPeso_(sh, data, peso) {
  var ultima = sh.getLastRow();
  var alvo = 0;

  if (ultima >= 2) {
    var datas = sh.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < datas.length; i++) {
      if (comoIso_(datas[i][0]) === data) { alvo = i + 2; break; }
    }
  }

  if (!alvo) alvo = Math.max(ultima, 1) + 1;
  sh.getRange(alvo, 1).setNumberFormat('@').setValue(data);
  sh.getRange(alvo, 2).setValue(peso);
}

/**
 * Aplica uma lista de operações vindas do app.
 *
 *   { t: 'marca',  k: '8:1:cardio',  feito: true|false, quando: '...' }
 *   { t: 'semana', n: 8,             feita: true|false, quando: '...' }
 *   { t: 'peso',   data: '2026-09-02', peso: 82.5,      quando: '...' }
 *
 * Operação a operação, e não "substitua o estado inteiro": dois aparelhos que
 * ficaram offline em momentos diferentes precisam somar o que fizeram, não
 * apagar o trabalho um do outro. Cada operação é idempotente, então reenviar a
 * mesma fila depois de uma resposta perdida não estraga nada.
 *
 * Operação malformada é PULADA, nunca lançada. Um erro aqui derrubaria o lote
 * inteiro, e como o app só tira da fila o que foi aceito, uma única operação
 * ruim ficaria reenviando para sempre e travaria todo o resto atrás dela.
 */
function aplicarOps(ops) {
  if (!ops || !ops.length) return { ok: true, aplicadas: 0 };

  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var sh = abaProgresso_();
    var ultima = sh.getLastRow();

    // Índice das linhas existentes, para achar sem varrer a aba a cada operação.
    var ondeEsta = {};
    if (ultima >= 2) {
      var atuais = sh.getRange(2, 1, ultima - 1, 3).getValues();
      for (var i = 0; i < atuais.length; i++) {
        var chave = atuais[i][0] + ':' + atuais[i][1] + ':' + atuais[i][2];
        if (atuais[i][0] !== '') ondeEsta[chave] = i + 2;
      }
    }

    var aplicadas = 0;
    var paraApagar = [];
    var plano = abaPlano_();
    var totalDeSemanas = plano ? numeroDeSemanas_(plano) : 0;
    // Contado aqui, e não por getLastRow() a cada volta: dentro do mesmo lote
    // isso não depende de quando o Sheets resolve descarregar as gravações.
    var proximaLinha = Math.max(ultima, 1) + 1;

    // A aba de peso só é tocada (e criada) se houver mesmo pesagem no lote.
    var registros = null;

    for (var j = 0; j < ops.length; j++) {
      var op = ops[j];

      if (op && op.t === 'marca' && op.k) {
        var partes = String(op.k).split(':');
        if (partes.length !== 3) continue;
        var linha = ondeEsta[op.k];

        if (op.feito) {
          if (!linha) {
            linha = proximaLinha++;
            ondeEsta[op.k] = linha;
          }
          sh.getRange(linha, 1, 1, 4).setValues([
            [Number(partes[0]), Number(partes[1]), partes[2], String(op.quando || '')]
          ]);
        } else if (linha) {
          paraApagar.push(linha);
          delete ondeEsta[op.k];
        }
        aplicadas++;

      } else if (op && op.t === 'semana' && plano) {
        // Sem esta conferência, um número fora da faixa escreveria numa linha
        // qualquer da planilha — inclusive fora do plano.
        var semana = Number(op.n);
        if (!(semana >= 1 && semana <= totalDeSemanas)) continue;
        plano.getRange(PRIMEIRA_LINHA_DE_SEMANA + semana - 1, COLUNA_FEITA)
             .setValue(op.feita ? 'Sim' : 'Não');
        aplicadas++;

      } else if (op && op.t === 'peso') {
        var data = comoIso_(op.data);
        var peso = Number(op.peso);
        if (!data) continue;
        if (!isFinite(peso) || peso < 20 || peso > 400) continue;
        if (!registros) registros = abaRegistros_();
        gravarPeso_(registros, data, Math.round(peso * 10) / 10);
        aplicadas++;
      }
    }

    // De baixo para cima: apagar de cima moveria as linhas ainda por apagar.
    paraApagar.sort(function (a, b) { return b - a; });
    for (var d = 0; d < paraApagar.length; d++) sh.deleteRow(paraApagar[d]);

    SpreadsheetApp.flush();
    return { ok: true, aplicadas: aplicadas };
  } finally {
    trava.releaseLock();
  }
}

/* ---- pontas HTTP --------------------------------------------------------- */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sem ?api=1 serve a interface. Com ?api=1 devolve progresso e pesagens em
 * JSON, que é o que a hospedagem estática consome.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === '1') {
    try {
      return json_(lerTudo());
    } catch (erro) {
      return json_({ erro: String((erro && erro.message) || erro) });
    }
  }

  return HtmlService.createHtmlOutputFromFile('Pagina')
    .setTitle('QG')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * Corpo em text/plain com JSON dentro: requisição simples, sem preflight
 * OPTIONS — que um web app do Apps Script não tem como responder.
 */
function doPost(e) {
  try {
    var corpo = e && e.postData && e.postData.contents;
    if (!corpo) throw new Error('corpo vazio');
    return json_(aplicarOps(JSON.parse(corpo).ops));
  } catch (erro) {
    return json_({ erro: String((erro && erro.message) || erro) });
  }
}

/* ---- conferência manual -------------------------------------------------- */

/**
 * Rode uma vez no editor: cria as abas e mostra em qual conta e em qual
 * planilha o script realmente caiu — que é o que resolve erro de permissão.
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

  var progresso = abaProgresso_();
  Logger.log('aba "%s" pronta, %s linha(s)', progresso.getName(), progresso.getLastRow());

  var registros = abaRegistros_();
  Logger.log('aba "%s" pronta, %s linha(s)', registros.getName(), registros.getLastRow());

  var plano = abaPlano_();
  if (!plano) {
    Logger.log('aba "%s": NÃO encontrada — a coluna Feita? não será escrita', ABA_PLANO);
  } else {
    var n = numeroDeSemanas_(plano);
    Logger.log('aba "%s": %s semanas, linhas %s a %s', ABA_PLANO, n,
      PRIMEIRA_LINHA_DE_SEMANA, PRIMEIRA_LINHA_DE_SEMANA + n - 1);
    Logger.log('coluna %s da linha 4 (deve ser "Feita?"): "%s"', COLUNA_FEITA,
      plano.getRange(4, COLUNA_FEITA).getValue());
  }

  Logger.log('lerTudo: %s', JSON.stringify(lerTudo()));
}
