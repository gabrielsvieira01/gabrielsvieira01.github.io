// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: running;

/**
 * QG — widget para a tela de início do iPhone (app Scriptable).
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

const SITE = "https://repo.gabrielsvieira.workers.dev/qg/";

/** Segundos nos 5 km. null usa o valor que está na planilha (aba Ritmos). */
const TEMPO_5K = null;

const COR = {
  fundo: new Color("#0C0C0E"),
  ink: new Color("#E6E3DC"),
  ink2: new Color("#E6E3DC", 0.6),
  ink3: new Color("#E6E3DC", 0.38),
  linha: new Color("#E6E3DC", 0.12),
  linhaFraca: new Color("#E6E3DC", 0.06),
  acento: new Color("#FFB000"),
  ok: new Color("#3DD68C"),
  /* O ícone da modalidade é ambientação, não informação principal: âmbar bem
     apagado o deixa pertencendo à paleta sem disputar com a manchete. */
  linhaIcone: new Color("#FFB000", 0.3),
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

/**
 * Os corpos de fonte, por família de widget.
 *
 * Antes tudo vivia entre 10 e 13pt, e o resultado era um widget com metade da
 * área vazia: sem contraste de tamanho, nada puxava o olho e nada preenchia.
 * Agora há três degraus bem separados — sobrancelha, manchete e apoio — e é o
 * degrau que preenche o retângulo, não mais informação.
 */
const ESCALA = {
  small: { olho: 9, modal: 10, manchete: 21, corpo: 13, apoio: 11, icone: 20, linhas: 3, alvos: 1 },
  medium: { olho: 10, modal: 11, manchete: 27, corpo: 15, apoio: 12, icone: 26, linhas: 4, alvos: 2 },
  large: { olho: 11, modal: 12, manchete: 30, corpo: 17, apoio: 13, icone: 30, linhas: 9, alvos: 3 },
};

function texto(pai, s, tamanho, cor, opcoes) {
  const t = pai.addText(s);
  t.font = (opcoes && opcoes.mono)
    ? Font.regularMonospacedSystemFont(tamanho)
    : (opcoes && opcoes.forte ? Font.semiboldSystemFont(tamanho) : Font.systemFont(tamanho));
  t.textColor = cor;
  if (opcoes && opcoes.linhas) t.lineLimit = opcoes.linhas;
  if (opcoes && opcoes.minimo) t.minimumScaleFactor = opcoes.minimo;
  return t;
}

/**
 * Fio de 1px de ponta a ponta. O app tem `border-bottom` em toda seção e o
 * widget não tinha nenhum — era a diferença mais visível entre os dois.
 * Largura zero mais um spacer dentro é o jeito de um stack esticar sozinho.
 */
function fio(w, cor) {
  const l = w.addStack();
  l.size = new Size(0, 1);
  l.backgroundColor = cor || COR.linha;
  l.addSpacer();
  return l;
}

/** O símbolo da modalidade do dia: diz "o que é hoje" sem gastar uma palavra. */
const SIMBOLOS = [
  [/bicicleta|bike/i, "bicycle"],
  [/esteira/i, "figure.run"],
  [/corrida|longão|longao/i, "figure.run"],
  [/muscula/i, "figure.strengthtraining.traditional"],
];

function simboloDe(rotulo) {
  for (const [re, nome] of SIMBOLOS) {
    if (re.test(rotulo || "")) {
      try {
        const s = SFSymbol.named(nome);
        if (s) return s;
      } catch (e) { /* símbolo ausente nesta versão do iOS */ }
    }
  }
  return null;
}

function icone(pai, rotulo, tamanho, cor) {
  const s = simboloDe(rotulo);
  if (!s) return null;
  const img = pai.addImage(s.image);
  img.imageSize = new Size(tamanho, tamanho);
  img.tintColor = cor;
  img.resizable = true;
  return img;
}

function cabecalho(w, M, E) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, M.nomeDoDia.toUpperCase(), E.olho, COR.acento, { forte: true });
  linha.addSpacer();
  texto(linha, "S" + M.semana + " · " + M.fase, E.olho, COR.ink3);
  if (M.doCache) texto(linha, " ·", E.olho, COR.ink3);

  w.addSpacer(5);
  fio(w);
  w.addSpacer(9);
}

/**
 * Um treino, com a manchete escolhida pelo que de fato importa naquele dia.
 *
 * Em dia de corrida o número que se persegue é o pace-alvo — curto, cabe
 * grande, e é o que se quer ler de relance do bolso. Em dia de bicicleta não
 * existe pace que signifique alguma coisa, então a manchete passa a ser o
 * próprio texto do treino, num corpo menor porque é frase, não número.
 */
function bloco(w, item, E, opcoes) {
  const feito = item.feito;
  const corPrincipal = feito ? COR.ink3 : COR.acento;

  const topo = w.addStack();
  topo.centerAlignContent();
  if (feito) texto(topo, "✓ ", E.modal, COR.ok, { forte: true });
  texto(topo, item.rotulo.toUpperCase(), E.modal, feito ? COR.ok : COR.acento, { forte: true });
  topo.addSpacer();
  icone(topo, item.rotulo, E.icone, feito ? COR.ok : COR.linhaIcone);

  const temAlvos = item.alvos && item.alvos.length;

  if (temAlvos) {
    /* Só os primeiros alvos viram manchete. Num dia de tiro variado a lista
       inteira chega a 30 caracteres ("400 5:38   600 5:40   800 5:43"), o que
       a 21pt encolhe e quebra em duas linhas — justamente o oposto de uma
       manchete. E os paces ali diferem por segundos: o que interessa de
       relance é a ordem de grandeza. O detalhe fica no corpo, logo abaixo,
       que é onde as distâncias estão escritas mesmo. */
    const mostrados = item.alvos.slice(0, E.alvos);
    const sobra = item.alvos.length - mostrados.length;

    w.addSpacer(6);
    texto(w, mostrados.join("   "), E.manchete, corPrincipal, {
      mono: true, linhas: 1, minimo: 0.6,
    });
    texto(w, sobra ? "min/km · +" + sobra + " alvo" + (sobra > 1 ? "s" : "") : "min/km",
      E.apoio, COR.ink3);

    if (item.texto && (!opcoes || opcoes.corpo !== false)) {
      w.addSpacer(7);
      texto(w, item.texto.replace(/\n/g, " · "), E.corpo, feito ? COR.ink3 : COR.ink2, {
        mono: true, linhas: (opcoes && opcoes.linhas) || E.linhas,
      });
    }
    return;
  }

  if (item.texto) {
    w.addSpacer(6);
    texto(w, item.texto.replace(/\n/g, " · "), E.corpo, feito ? COR.ink3 : COR.ink, {
      mono: true, linhas: (opcoes && opcoes.linhas) || E.linhas,
    });
  }
}

/** A linha da musculação, quando ela divide o dia com o cardio. */
function linhaMusc(w, musc, E) {
  w.addSpacer(8);
  fio(w, COR.linhaFraca);
  w.addSpacer(8);
  const l = w.addStack();
  l.centerAlignContent();
  if (musc.feito) texto(l, "✓ ", E.modal, COR.ok, { forte: true });
  texto(l, "MUSCULAÇÃO", E.modal, musc.feito ? COR.ok : COR.ink2, { forte: true });
  l.addSpacer();
  icone(l, "musculação", E.modal + 5, musc.feito ? COR.ok : COR.linhaIcone);
}

function desenhar(M, familia) {
  const E = ESCALA[familia] || ESCALA.medium;

  const w = new ListWidget();
  w.url = SITE;
  w.setPadding(13, 14, 13, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  /* Gradiente quase imperceptível: é a diferença entre um retângulo preto
     chapado e algo que parece iluminado de cima. */
  const fundo = new LinearGradient();
  fundo.colors = [new Color("#15151A"), COR.fundo];
  fundo.locations = [0, 1];
  fundo.startPoint = new Point(0.5, 0);
  fundo.endPoint = new Point(0.5, 1);
  w.backgroundGradient = fundo;

  cabecalho(w, M, E);

  if (!M.itens.length) {
    const topo = w.addStack();
    topo.centerAlignContent();
    texto(topo, "DESCANSO", E.modal, COR.ink3, { forte: true });
    topo.addSpacer();
    const s = (() => { try { return SFSymbol.named("moon.zzz"); } catch (e) { return null; } })();
    if (s) {
      const img = topo.addImage(s.image);
      img.imageSize = new Size(E.icone, E.icone);
      img.tintColor = COR.linhaIcone;
      img.resizable = true;
    }

    if (M.proximo) {
      const p = M.proximo.itens[0];
      w.addSpacer(8);
      texto(w, p.alvos && p.alvos.length ? p.alvos.join("   ") : M.proximo.nome,
        E.manchete, COR.ink2, { mono: true, linhas: 2, minimo: 0.6 });
      w.addSpacer(6);
      texto(w, "A SEGUIR · " + M.proximo.nome.toUpperCase(), E.olho, COR.ink3, { forte: true });
      w.addSpacer(3);
      texto(w, p.texto ? p.texto.replace(/\n/g, " · ") : p.rotulo, E.corpo, COR.ink3, {
        mono: true, linhas: E.linhas,
      });
    }
    w.addSpacer();
    return w;
  }

  const cardio = M.itens.find((i) => i.tipo === "cardio");
  const musc = M.itens.find((i) => i.tipo === "musc");
  const principal = cardio || musc;

  // O corpo entra sempre, inclusive no small. Antes ele era suprimido lá para
  // caber, e o resultado era meia área vazia; com a manchete limitada a um
  // alvo, os dois convivem — e é o corpo que preenche o retângulo.
  bloco(w, principal, E, { linhas: E.linhas });

  if (cardio && musc) linhaMusc(w, musc, E);

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
