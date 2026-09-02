// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: running;

/**
 * Treinos — widget para a tela de início do iPhone (app Scriptable).
 *
 * Mostra o treino de HOJE, e só ele. O resto do plano fica a um toque: tocar
 * no widget abre o site.
 *
 * Bebe das mesmas duas fontes que o app:
 *
 *   1. o HTML do site  -> o plano das 40 semanas, a rotina e os ritmos, que
 *      estão embutidos ali num <script id="plano">;
 *   2. o Apps Script   -> o que já foi marcado como feito.
 *
 * A URL do Apps Script não é escrita aqui: sai do próprio HTML do site, do
 * mesmo lugar onde o app a guarda. Assim, se um dia a implantação mudar, basta
 * atualizar o site — o widget acompanha sozinho.
 *
 * Não marca treino, de propósito. Widget do Scriptable não executa código ao
 * toque — só abre URL — então qualquer botão de "feito" acabaria abrindo o
 * Safari do mesmo jeito. Já que o site abre de qualquer forma, um botão à parte
 * só somaria superfície sem economizar um toque sequer. Aqui é leitura; marcar
 * é no site.
 *
 * O que ele mostra do estado: um ✓ verde no que já foi feito.
 */

const SITE = "https://repo.gabrielsvieira.workers.dev/treinos/";

/** Segundos nos 5 km. null usa o valor que está na planilha (aba Ritmos). */
const TEMPO_5K = null;

const COR = {
  fundo: new Color("#0C0C0E"),
  ink: new Color("#E6E3DC"),
  ink2: new Color("#E6E3DC", 0.6),
  ink3: new Color("#E6E3DC", 0.38),
  linha: new Color("#E6E3DC", 0.12),
  acento: new Color("#FFB000"),
  ok: new Color("#3DD68C"),
};

/* ==========================================================================
   Dados
   ========================================================================== */

const CACHE = (() => {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), "treinos-widget");
  if (!fm.fileExists(dir)) fm.createDirectory(dir);
  return {
    ler(nome) {
      const p = fm.joinPath(dir, nome);
      if (!fm.fileExists(p)) return null;
      try { return JSON.parse(fm.readString(p)); } catch (e) { return null; }
    },
    gravar(nome, valor) {
      try { fm.writeString(fm.joinPath(dir, nome), JSON.stringify(valor)); } catch (e) {}
    },
  };
})();

/** O plano sai do <script id="plano"> do próprio site. */
function extrairPlano(html) {
  const abre = '<script type="application/json" id="plano">';
  const i = html.indexOf(abre);
  if (i < 0) throw new Error("bloco do plano não encontrado no site");
  const j = html.indexOf("</scr" + "ipt>", i + abre.length);
  const cru = html.slice(i + abre.length, j).replace(/<\\\//g, "</");
  return JSON.parse(cru);
}

function extrairUrlDoApp(html) {
  const m = html.match(/var URL_DO_APP = "(https:\/\/[^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Busca plano e progresso, caindo no cache quando a rede falha.
 *
 * Widget roda em segundo plano, muitas vezes com rede ruim: mostrar o último
 * estado conhecido é melhor que mostrar erro, desde que se avise.
 */
async function carregar() {
  let plano = null;
  let progresso = null;
  let doCache = false;

  try {
    const html = await new Request(SITE + "?w=" + Date.now()).loadString();
    plano = extrairPlano(html);
    CACHE.gravar("plano.json", plano);

    const urlDoApp = extrairUrlDoApp(html);
    if (urlDoApp) {
      try {
        progresso = await new Request(urlDoApp + "?api=1&t=" + Date.now()).loadJSON();
        if (progresso && progresso.feitos) CACHE.gravar("progresso.json", progresso);
        else progresso = null;
      } catch (e) {
        progresso = null;
      }
    }
  } catch (e) {
    plano = null;
  }

  if (!plano) { plano = CACHE.ler("plano.json"); doCache = true; }
  if (!progresso) { progresso = CACHE.ler("progresso.json"); doCache = true; }
  if (!plano) throw new Error("sem dados e sem cache — abra o site uma vez com rede");

  // Sem progresso, a coluna "Feita?" embutida no plano ainda diz onde paramos.
  if (!progresso) {
    const semanasFeitas = {};
    plano.semanas.forEach((s) => { if (s.feitaNaPlanilha) semanasFeitas[s.n] = true; });
    progresso = { feitos: {}, semanasFeitas: semanasFeitas };
  }

  return { plano, progresso, doCache };
}

/* ==========================================================================
   Ritmos — mesma conta do app
   ========================================================================== */

function mmss(s) {
  s = Math.round(s);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function ritmos(plano, tempo5k) {
  const aj = plano.ritmos.ajustesRitmos;
  const p5 = tempo5k / 5;
  const st = p5 + aj.ST;
  const mt = st + aj.MT;
  const lt = mt + aj.LT;
  return { p5, ST: st, MT: mt, LT: lt, MP: lt + aj.MP, HMP: lt + aj.HMP };
}

function tiro(plano, distancia, tempo5k) {
  const ajuste = plano.ritmos.ajustesTiros[distancia];
  if (ajuste === undefined) return null;
  return (tempo5k / 5) * (distancia / 1000) + ajuste;
}

const DISTANCIAS_DE_TIRO = [400, 600, 800, 1000, 1200, 1600, 2000];
const SIGLAS = ["ST", "MT", "LT", "MP", "HMP"];

/**
 * Os ritmos-alvo do treino, em lista curta e sem repetição.
 *
 * O parêntese de recuperação é consumido primeiro: em "5 x 1000 (400 RI)" o
 * 400 é o trote de volta, não o tiro, e anunciá-lo como alvo estaria errado.
 */
function alvosDoTreino(texto, plano, tempo5k) {
  const r = ritmos(plano, tempo5k);
  const vistos = [];
  const juntar = (rotulo, segundos) => {
    const item = rotulo + " " + mmss(segundos);
    if (vistos.indexOf(item) < 0) vistos.push(item);
  };

  let s = texto.replace(/\(([^)]*\bRI\b[^)]*)\)/g, " ");

  const re = new RegExp("(^|[^\\d])(" + DISTANCIAS_DE_TIRO.join("|") + ")(?!\\d)(?![.,]\\d)", "g");
  let m;
  while ((m = re.exec(s))) {
    const d = Number(m[2]);
    const t = tiro(plano, d, tempo5k);
    if (t) juntar(String(d), t / (d / 1000));
  }

  const reSigla = new RegExp("\\b(" + SIGLAS.join("|") + ")\\b(\\s*\\+\\s*(\\d+))?", "g");
  while ((m = reSigla.exec(s))) {
    juntar(m[0].replace(/\s+/g, " "), r[m[1]] + (m[3] ? Number(m[3]) : 0));
  }

  return vistos;
}

/* ==========================================================================
   Modelo do dia — mesma lógica do app
   ========================================================================== */

/** Índice do dia com segunda em 0, a ordem das colunas da planilha. */
function diaDeHoje() {
  return (new Date().getDay() + 6) % 7;
}

function semanaAtual(plano, progresso) {
  for (const s of plano.semanas) if (!progresso.semanasFeitas[s.n]) return s;
  return plano.semanas[plano.semanas.length - 1];
}

function temTreino(txt) {
  return !!txt && !/^(descanso|—|–|-)$/i.test(txt.trim());
}

function itensDoDia(plano, semana, dia) {
  const m = plano.rotina[dia];
  const txt = semana.treinos[dia];
  const itens = [];
  if (temTreino(txt)) {
    itens.push({
      tipo: "cardio",
      rotulo: m.cardio || "Treino da planilha",
      texto: txt,
      pace: m.pace,
    });
  }
  if (m.musc) itens.push({ tipo: "musc", rotulo: "Musculação", texto: "", pace: false });
  return itens;
}

function montarModelo({ plano, progresso, doCache }) {
  const tempo5k = TEMPO_5K || plano.ritmos.tempo5kPadrao;
  const semana = semanaAtual(plano, progresso);
  const dia = diaDeHoje();
  const feito = (d, tipo) => !!progresso.feitos[semana.n + ":" + d + ":" + tipo];

  const daquele = (d) =>
    itensDoDia(plano, semana, d).map((it) => ({
      ...it,
      feito: feito(d, it.tipo),
      alvos: it.pace && it.texto ? alvosDoTreino(it.texto, plano, tempo5k) : [],
    }));

  let proximo = null;
  if (!itensDoDia(plano, semana, dia).length) {
    for (let k = 1; k <= 7; k++) {
      const d = (dia + k) % 7;
      if (itensDoDia(plano, semana, d).length) {
        proximo = { dia: d, nome: plano.dias[d], itens: daquele(d) };
        break;
      }
    }
  }

  return {
    semana: semana.n,
    fase: semana.fase,
    dia,
    nomeDoDia: plano.dias[dia],
    itens: daquele(dia),
    proximo,
    doCache,
  };
}

/* ==========================================================================
   Desenho
   ========================================================================== */

function texto(pai, s, tamanho, cor, opcoes) {
  const t = pai.addText(s);
  t.font = (opcoes && opcoes.mono)
    ? Font.regularMonospacedSystemFont(tamanho)
    : (opcoes && opcoes.forte ? Font.semiboldSystemFont(tamanho) : Font.systemFont(tamanho));
  t.textColor = cor;
  if (opcoes && opcoes.linhas) t.lineLimit = opcoes.linhas;
  return t;
}

function cabecalho(w, M) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, M.nomeDoDia.toUpperCase(), 11, COR.acento, { forte: true });
  linha.addSpacer();
  texto(linha, "S" + M.semana + " · " + M.fase, 10, COR.ink3);
  if (M.doCache) texto(linha, " ·", 10, COR.ink3);
}

/** Rótulo da modalidade, com o ✓ quando já foi feito, e o texto do treino. */
function bloco(w, item, opcoes) {
  const cab = w.addStack();
  cab.centerAlignContent();
  if (item.feito) texto(cab, "✓ ", 11, COR.ok, { forte: true });
  texto(cab, item.rotulo.toUpperCase(), 10, item.feito ? COR.ok : COR.acento, { forte: true });

  if (item.texto && (!opcoes || opcoes.corpo !== false)) {
    w.addSpacer(4);
    texto(w, item.texto.replace(/\n/g, " · "), 12, item.feito ? COR.ink3 : COR.ink, {
      mono: true,
      linhas: (opcoes && opcoes.linhas) || 3,
    });
  }
  if (item.alvos.length) {
    w.addSpacer(4);
    texto(w, item.alvos.join("   ") + " /km", 13, item.feito ? COR.ink3 : COR.acento, {
      mono: true,
      linhas: 2,
    });
  }
}

function desenhar(M, familia) {
  const w = new ListWidget();
  w.backgroundColor = COR.fundo;
  w.url = SITE;
  w.setPadding(12, 13, 12, 13);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  cabecalho(w, M);
  w.addSpacer(familia === "small" ? 6 : 8);

  if (!M.itens.length) {
    texto(w, "Descanso", 17, COR.ink, { forte: true });
    if (M.proximo) {
      w.addSpacer(6);
      texto(w, "A SEGUIR · " + M.proximo.nome.toUpperCase(), 9, COR.ink3, { forte: true });
      w.addSpacer(3);
      const p = M.proximo.itens[0];
      texto(w, p.texto ? p.texto.replace(/\n/g, " · ") : p.rotulo, 12, COR.ink2, {
        mono: true,
        linhas: familia === "small" ? 3 : 4,
      });
    }
    w.addSpacer();
    return w;
  }

  const cardio = M.itens.find((i) => i.tipo === "cardio");
  const musc = M.itens.find((i) => i.tipo === "musc");
  const principal = cardio || musc;

  if (familia === "small") {
    // Cabe pouco: o pace-alvo é o que vale. Quando não há pace — bicicleta —
    // aí sim o texto do treino, curto.
    bloco(w, principal, { corpo: !cardio || !cardio.alvos.length, linhas: 4 });
    if (cardio && musc) {
      w.addSpacer(6);
      texto(w, (musc.feito ? "✓ " : "+ ") + "MUSCULAÇÃO", 10,
        musc.feito ? COR.ok : COR.ink3, { forte: true });
    }
    w.addSpacer();
    return w;
  }

  // Sem faixa de marcar, sobra espaço: o texto do treino pode respirar.
  bloco(w, principal, { linhas: familia === "large" ? 10 : 5 });

  if (cardio && musc) {
    w.addSpacer(10);
    texto(w, (musc.feito ? "✓ " : "+ ") + "MUSCULAÇÃO", 10,
      musc.feito ? COR.ok : COR.ink3, { forte: true });
  }

  w.addSpacer();
  return w;
}

/* ==========================================================================
   Execução
   ========================================================================== */

const familia = (typeof config !== "undefined" && config.widgetFamily) || "medium";
const M = montarModelo(await carregar());
const widget = desenhar(M, familia);

if (typeof config !== "undefined" && config.runsInWidget) {
  Script.setWidget(widget);
} else if (familia === "small") {
  await widget.presentSmall();
} else if (familia === "large") {
  await widget.presentLarge();
} else {
  await widget.presentMedium();
}
Script.complete();
