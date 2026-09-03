/**
 * Lê fonte/Treinos.xlsx e injeta o plano dentro de index.html.
 *
 *   node gerar-plano.mjs
 *
 * A planilha continua sendo a fonte da verdade do CONTEÚDO dos treinos; este
 * script é a ponte. O resultado vai para dentro do próprio index.html, entre
 * marcadores, e não para um .json separado: assim o app é um arquivo só, abre
 * sem fetch, funciona offline e funciona em file://.
 *
 * Rodar de novo é idempotente — substitui só o miolo entre os marcadores.
 *
 * Um .xlsx é um zip de XML. Não há Python nesta máquina e não vale uma
 * dependência de npm para uma leitura só, então o zip e o XML são lidos aqui
 * mesmo, com o que já vem no Node.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const XLSX = join(aqui, "fonte", "Treinos.xlsx");
const HTML = join(aqui, "index.html");

const INICIO = '<script type="application/json" id="plano">';
const FIM = "</scr" + "ipt>";

/* ---- zip ----------------------------------------------------------------- */

/**
 * Devolve { nome: Buffer } do zip inteiro.
 *
 * Percorre o diretório central (assinatura PK\x01\x02) em vez dos cabeçalhos
 * locais: só ele traz os tamanhos de forma confiável quando o gravador usou
 * data descriptor, que é o caso de vários geradores de .xlsx.
 */
function lerZip(buf) {
  const fim = acharFimDoDiretorio(buf);
  let p = buf.readUInt32LE(fim + 16); // deslocamento do diretório central
  const total = buf.readUInt16LE(fim + 10);
  const saida = {};

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error("diretório central do zip corrompido na entrada " + i);
    }
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    const inicioLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + tamNome);

    // O cabeçalho local repete nome e extra com tamanhos PRÓPRIOS: o campo
    // extra costuma diferir do que está no diretório central, então os dados
    // têm de ser localizados por ele, não pelo tamanho daqui.
    const tamNomeLocal = buf.readUInt16LE(inicioLocal + 26);
    const tamExtraLocal = buf.readUInt16LE(inicioLocal + 28);
    const dados = inicioLocal + 30 + tamNomeLocal + tamExtraLocal;
    const cru = buf.subarray(dados, dados + comprimido);

    saida[nome] = metodo === 0 ? cru : inflateRawSync(cru);
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return saida;
}

/** O fim do diretório central fica no rodapé, depois de um comentário livre. */
function acharFimDoDiretorio(buf) {
  for (let p = buf.length - 22; p >= 0; p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) return p;
  }
  throw new Error("isto não parece um zip: fim do diretório central não achado");
}

/* ---- xml ----------------------------------------------------------------- */

/** Entidades XML, incluindo as numéricas — é onde mora o &#10; das quebras. */
function texto(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Junta os <t> de um trecho: uma célula formatada vem partida em vários. */
function juntarT(xml) {
  let saida = "";
  for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) saida += texto(m[1]);
  return saida;
}

function lerSharedStrings(xml) {
  const lista = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) lista.push(juntarT(m[1]));
  return lista;
}

/**
 * Uma aba como { "A5": "texto" }. Só o valor interessa: uma fórmula já traz o
 * último resultado calculado em <v>, que é o que a planilha mostra na tela.
 */
function lerAba(xml, strings) {
  const celulas = {};
  for (const m of xml.matchAll(/<c ([^>]*?)\/?>([\s\S]*?)<\/c>/g)) {
    const attrs = m[1];
    const corpo = m[2];
    const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
    if (!ref) continue;
    const tipo = (attrs.match(/t="(\w+)"/) || [])[1];
    const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
    const is = corpo.match(/<is>([\s\S]*?)<\/is>/);

    let valor = "";
    if (tipo === "s" && v) valor = strings[Number(v[1])] ?? "";
    else if (tipo === "inlineStr" && is) valor = juntarT(is[1]);
    else if (v) valor = texto(v[1]);

    if (valor !== "") celulas[ref] = valor;
  }
  return celulas;
}

/** Nome da aba para arquivo de planilha, resolvido pelos rels do workbook. */
function abasDoWorkbook(arquivos) {
  const wb = arquivos["xl/workbook.xml"].toString("utf8");
  const rels = arquivos["xl/_rels/workbook.xml.rels"].toString("utf8");

  const alvo = {};
  for (const m of rels.matchAll(/<Relationship ([^>]*)\/>/g)) {
    const id = (m[1].match(/Id="([^"]+)"/) || [])[1];
    const destino = (m[1].match(/Target="([^"]+)"/) || [])[1];
    if (id && destino) alvo[id] = destino.replace(/^\/?(xl\/)?/, "");
  }

  const abas = {};
  for (const m of wb.matchAll(/<sheet ([^>]*)\/>/g)) {
    const nome = texto((m[1].match(/name="([^"]+)"/) || [])[1] || "");
    const rid = (m[1].match(/r:id="([^"]+)"/) || [])[1];
    if (nome && alvo[rid]) abas[nome] = "xl/" + alvo[rid];
  }
  return abas;
}

/* ---- extração ------------------------------------------------------------ */

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const COLUNAS_DOS_DIAS = ["C", "D", "E", "F", "G", "H", "I"];
const PRIMEIRA_LINHA = 5;
const SEMANAS = 40;

const arquivos = lerZip(readFileSync(XLSX));
const abas = abasDoWorkbook(arquivos);

/* A tabela de textos compartilhados é opcional: um .xlsx pode guardar o texto
   dentro da própria célula. O exportado do Google Sheets usa a tabela; o que
   este projeto gera, não. */
const strings = arquivos["xl/sharedStrings.xml"]
  ? lerSharedStrings(arquivos["xl/sharedStrings.xml"].toString("utf8"))
  : [];

function celulas(nomeDaAba) {
  const caminho = abas[nomeDaAba];
  if (!caminho) throw new Error('a planilha não tem a aba "' + nomeDaAba + '"');
  return lerAba(arquivos[caminho].toString("utf8"), strings);
}

const plano = celulas("Plano");
const ritmos = celulas("Ritmos");
const glossarioAba = celulas("Glossário");
const rotinaAba = celulas("Rotina");

const semanas = [];
for (let i = 0; i < SEMANAS; i++) {
  const linha = PRIMEIRA_LINHA + i;
  const treinos = COLUNAS_DOS_DIAS.map((col) => (plano[col + linha] || "").trim());
  const longao = Number(plano["J" + linha]);

  semanas.push({
    n: Number(plano["A" + linha]),
    fase: plano["B" + linha] || "",
    treinos,
    longao: Number.isFinite(longao) ? longao : null,
    feitaNaPlanilha: /^sim$/i.test(plano["K" + linha] || ""),
  });
}

/**
 * A rotina da semana, da aba Rotina: em que modalidade cada treino do plano é
 * cumprido e em que dias tem musculação. A planilha só conhece a corrida, e é
 * esta aba que completa o quadro — por isso ela mora lá, e não numa constante
 * aqui dentro, onde mudar a rotina exigiria mexer em código.
 */
const rotina = [];
for (let i = 0; i < 7; i++) {
  const linha = 5 + i;
  const cardio = (rotinaAba["C" + linha] || "").trim();
  rotina.push({
    dia: (rotinaAba["A" + linha] || "").trim(),
    musc: /^sim$/i.test((rotinaAba["B" + linha] || "").trim()),
    // "—" e vazio são a mesma coisa: aquele dia não tem cardio.
    cardio: /^(—|–|-)?$/.test(cardio) ? null : cardio,
    pace: /^sim$/i.test((rotinaAba["D" + linha] || "").trim()),
  });
}

/* Conferências. Uma planilha reorganizada tem de quebrar aqui, alto, em vez de
   virar um app silenciosamente errado. */
const erros = [];

rotina.forEach((r, i) => {
  if (r.dia !== DIAS[i]) {
    erros.push(
      'Rotina, linha ' + (5 + i) + ': esperava "' + DIAS[i] + '" na coluna A, achei "' +
        r.dia + '". A ordem dos dias não pode mudar.'
    );
  }
});
if (!rotina.some((r) => r.cardio)) {
  erros.push("Rotina: nenhum dia tem modalidade de cardio — a coluna C está vazia?");
}

semanas.forEach((s, i) => {
  const onde = "semana " + (i + 1) + " (linha " + (PRIMEIRA_LINHA + i) + ")";
  if (s.n !== i + 1) erros.push(onde + ': a coluna A diz "' + s.n + '"');
  if (!s.fase) erros.push(onde + ": sem fase na coluna B");
  if (s.treinos.length !== 7) erros.push(onde + ": não tem 7 dias");
  if (!s.treinos[5]) erros.push(onde + ": sábado vazio, e é o dia que fecha a semana");
  if (s.longao === null) erros.push(onde + ": longão não numérico na coluna J");
});
if (erros.length) {
  console.error("A planilha não está no formato esperado:\n  " + erros.join("\n  "));
  process.exit(1);
}

/**
 * O tempo nos 5 km, em segundos.
 *
 * Na planilha nova B4 é o número de segundos, direto. A planilha antiga
 * guardava uma fração de dia formatada como hora (0,0208333 = 30:00), que é
 * justamente o tipo de valor que se deforma numa conversão para o Sheets — daí
 * a troca. Os dois casos são aceitos porque a diferença é inequívoca: ninguém
 * corre 5 km em menos de um segundo.
 */
const b4 = Number(ritmos.B4);
const tempo5kPadrao = Math.round(b4 > 1 ? b4 : b4 * 86400);

const ajustesTiros = {};
for (let linha = 9; linha <= 15; linha++) {
  const distancia = parseInt((ritmos["A" + linha] || "").replace(/\D/g, ""), 10);
  if (Number.isFinite(distancia)) ajustesTiros[distancia] = Number(ritmos["B" + linha]);
}

/* ST/MT/LT/MP/HMP, nas linhas 20 a 24 da aba Ritmos. Cada ajuste é relativo ao
   ritmo anterior, não ao pace de 5 km — a cadeia está montada no app. */
const ajustesRitmos = {};
for (let linha = 20; linha <= 24; linha++) {
  const sigla = (ritmos["A" + linha] || "").match(/\(([A-Z]+)\)/);
  if (sigla) ajustesRitmos[sigla[1]] = Number(ritmos["B" + linha]);
}

const glossario = [];
for (let linha = 4; linha <= 15; linha++) {
  const sigla = glossarioAba["A" + linha];
  const t = glossarioAba["B" + linha];
  if (sigla && t) glossario.push({ sigla, texto: t });
}

const dados = {
  geradoEm: new Date().toISOString().slice(0, 10),
  dias: DIAS,
  rotina,
  semanas,
  ritmos: { tempo5kPadrao, ajustesTiros, ajustesRitmos },
  glossario,
};

/* ---- injeção ------------------------------------------------------------- */

const html = readFileSync(HTML, "utf8");
const a = html.indexOf(INICIO);
if (a < 0) throw new Error("não achei o marcador " + INICIO + " em index.html");
const b = html.indexOf(FIM, a + INICIO.length);
if (b < 0) throw new Error("o bloco do plano em index.html não foi fechado");

/**
 * `geradoEm` só anda quando o conteúdo anda.
 *
 * Carimbar a data a cada execução faria o index.html mudar sozinho de um dia
 * para o outro sem nada ter mudado de fato — diferença falsa num arquivo que
 * vive no git, e que confunde na hora de decidir o que subir.
 */
const anterior = (() => {
  try {
    return JSON.parse(html.slice(a + INICIO.length, b).replace(/<\\\//g, "</"));
  } catch (e) {
    return null;
  }
})();

const mesmoConteudo = (x, y) =>
  x && y && JSON.stringify({ ...x, geradoEm: null }) === JSON.stringify({ ...y, geradoEm: null });

if (mesmoConteudo(anterior, dados)) dados.geradoEm = anterior.geradoEm;

/* Um "</" dentro de um <script> encerraria a tag no meio do JSON. */
const json = JSON.stringify(dados).replace(/<\//g, "<\\/");
writeFileSync(HTML, html.slice(0, a + INICIO.length) + json + html.slice(b), "utf8");

const comCardio = rotina.filter((r) => r.cardio).length;
const comMusc = rotina.filter((r) => r.musc).length;
console.log(
  semanas.length + " semanas, " + semanas.length * 7 + " células de treino, " +
    glossario.length + " verbetes, 5 km em " +
    Math.floor(tempo5kPadrao / 60) + ":" + String(tempo5kPadrao % 60).padStart(2, "0") + "."
);
console.log(
  "Rotina: " + comCardio + " dias de cardio (" +
    rotina.filter((r) => r.cardio && r.pace).length + " com pace), " +
    comMusc + " de musculação."
);
console.log("index.html atualizado (" + (json.length / 1024).toFixed(1) + " kB de plano).");
