// =============================================================================
// Semana Padrão — 8º Período — shared.js
// Funções puras usadas TANTO pelo app principal (assets/app.js) quanto pelo
// documento standalone do "modo foto".
//
// O modo foto é montado como um Blob em memória, sem acesso a arquivos
// externos, então essas funções são serializadas com
// Function.prototype.toString() (ver `serialize()` no fim do arquivo) e
// injetadas como texto no documento gerado.
//
// >>> Por isso TODA função exportada aqui precisa ser autocontida: ela pode
// chamar outras funções desta mesma lista, mas não pode fechar sobre
// nenhuma variável externa (toString() perde o escopo). Constantes que as
// funções precisam são serializadas junto, via JSON.
// =============================================================================
window.AgendaShared = (function () {
  "use strict";

  // Sufixo da variável CSS de cor de cada categoria (--cat-*). Mantido num
  // lugar só porque antes existiam duas cópias divergentes desse mapa e a
  // do modo foto tinha esquecido PESSOAL — a bolinha saía sem cor.
  const CATEGORY_COLOR_VAR = {
    HAM: "--cat-ham",
    CI_PRATICA: "--cat-ci",
    PIEPE: "--cat-piepe",
    IESC_COMUNIDADES: "--cat-iesc",
    CI_MARC_PALESTRA: "--cat-marc",
    PESSOAL: "--cat-pessoal",
  };

  // ---------------------------------------------------------------------
  // Tempo
  // ---------------------------------------------------------------------
  function toMinutes(hhmm) {
    const parts = String(hhmm).split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function fmtRange(a, b) {
    return a + "–" + b;
  }

  function timesOverlap(aStart, aEnd, bStart, bEnd) {
    return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
  }

  // ---------------------------------------------------------------------
  // Texto
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // "CLÍNICA ACADÊMICA" -> "Clínica Acadêmica". Só mexe em nomes que vieram
  // inteiramente em caixa alta da planilha; o que já vem com maiúsculas e
  // minúsculas misturadas (ex.: 'Casa da Criança', 'UBS "Novo Horizonte"')
  // é preservado exatamente como está.
  function titleCasePtBr(str) {
    if (str == null) return "";
    const s = String(str);
    if (s !== s.toUpperCase()) return s;
    // As duas listas vivem DENTRO da função de propósito: ela é serializada
    // com toString() pro modo foto e perde o escopo externo, então precisa
    // ser autocontida (ver o cabeçalho do arquivo).
    const keepUpper = ["UBS", "HAM", "CI", "PIEPE", "IESC", "MARC", "NED", "PSF", "SUS"];
    const lowerWords = ["de", "da", "do", "das", "dos", "e", "em", "no", "na", "com"];
    return s.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, function (word, offset) {
      const upper = word.toUpperCase();
      if (keepUpper.indexOf(upper) !== -1) return upper;
      const lower = word.toLowerCase();
      if (offset > 0 && lowerWords.indexOf(lower) !== -1) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }

  function titleFor(ev) {
    switch (ev.category) {
      case "HAM":
        return "HAM – " + ev.subtype;
      case "CI_PRATICA":
        return "CI Prática – " + titleCasePtBr(ev.subtype || "");
      case "PIEPE":
        return "PIEPE";
      case "IESC_COMUNIDADES":
        return ev.subtype === "Palestra" ? "IESC – Palestra" : "Comunidades – Prática";
      case "CI_MARC_PALESTRA":
        return "Clínica Integrada – " + ev.subtype;
      case "PESSOAL":
        return ev.title || "Compromisso pessoal";
      default:
        return ev.category_label;
    }
  }

  function subtitleFor(ev) {
    if (ev.category === "PESSOAL") return "Compromisso pessoal";
    const who = ev.preceptor || "";
    const base = !ev.group || ev.group === "TODOS"
      ? "Todos os grupos" + (who ? " · " + who : "")
      : "Grupo " + ev.group + (who ? " · " + who : "");
    // Horário remarcado à mão: precisa ficar explícito em toda superfície
    // (grid, lista, modo foto, .ics), senão a pessoa esquece que aquele
    // não é o horário da planilha.
    return ev.adjusted ? base + " · horário ajustado" : base;
  }

  // ---------------------------------------------------------------------
  // Layout de sobreposição
  //
  // Divide os eventos do dia em duas camadas:
  //
  //  - base:    ocupam colunas lado a lado, dividindo a largura (é o caso
  //             dos "grupos paralelos", em que dois eventos de duração
  //             parecida disputam o mesmo horário e ambos precisam ser
  //             lidos por igual);
  //  - overlay: eventos curtos inteiramente contidos num evento pelo menos
  //             2x mais longo. Esses NÃO dividem a largura — flutuam por
  //             cima, deslocados pra direita.
  //
  // Sem a camada de overlay, uma prática de 4h (07:50–12:00) virava uma
  // tira de 50% de largura por causa de uma palestra de 50min no meio dela,
  // e nenhum dos dois ficava legível. É o caso mais comum aqui: acontece em
  // toda terça e quinta, e na sexta com o MARC.
  // ---------------------------------------------------------------------
  function packColumns(events) {
    const sorted = events.slice().sort(function (a, b) {
      return toMinutes(a.start) - toMinutes(b.start);
    });
    const clusters = [];
    let current = null;
    let currentEnd = -1;

    sorted.forEach(function (ev) {
      const s = toMinutes(ev.start);
      const e = toMinutes(ev.end);
      if (!current || s >= currentEnd) {
        current = [];
        clusters.push(current);
        currentEnd = e;
      } else {
        currentEnd = Math.max(currentEnd, e);
      }
      current.push(ev);
    });

    const positioned = [];
    clusters.forEach(function (cluster) {
      const columns = []; // minuto de término do último evento de cada coluna
      const colOf = new Map();
      cluster.forEach(function (ev) {
        const s = toMinutes(ev.start);
        const e = toMinutes(ev.end);
        let placedCol = -1;
        for (let c = 0; c < columns.length; c++) {
          if (columns[c] <= s) {
            placedCol = c;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = columns.length;
          columns.push(e);
        } else {
          columns[placedCol] = e;
        }
        colOf.set(ev, placedCol);
      });
      const colCount = columns.length;
      cluster.forEach(function (ev) {
        positioned.push({ ev: ev, col: colOf.get(ev), colCount: colCount });
      });
    });
    return positioned;
  }

  function layoutOverlaps(events) {
    function duration(ev) {
      return toMinutes(ev.end) - toMinutes(ev.start);
    }
    function isOverlay(ev) {
      return events.some(function (other) {
        return (
          other !== ev &&
          toMinutes(other.start) <= toMinutes(ev.start) &&
          toMinutes(ev.end) <= toMinutes(other.end) &&
          duration(other) >= duration(ev) * 2
        );
      });
    }

    const overlayEvents = events.filter(isOverlay);
    const baseEvents = events.filter(function (ev) {
      return !isOverlay(ev);
    });

    const positioned = [];
    packColumns(baseEvents).forEach(function (p) {
      p.overlay = false;
      positioned.push(p);
    });
    packColumns(overlayEvents).forEach(function (p) {
      p.overlay = true;
      positioned.push(p);
    });
    return positioned;
  }

  // Posição horizontal de um bloco, em porcentagem da largura da coluna do
  // dia. Blocos de overlay ficam confinados à faixa direita da coluna, o
  // que deixa a "faixa de identificação" do evento longo sempre visível à
  // esquerda.
  const OVERLAY_INSET_PCT = 30;

  function blockGeometry(col, colCount, overlay) {
    const span = overlay ? 100 - OVERLAY_INSET_PCT : 100;
    const offset = overlay ? OVERLAY_INSET_PCT : 0;
    const widthPct = span / colCount;
    const leftPct = offset + col * widthPct;
    return {
      left: "calc(" + leftPct + "% + 2px)",
      width: "calc(" + widthPct + "% - 4px)",
      zIndex: (overlay ? 20 : 2) + col,
    };
  }

  // ---------------------------------------------------------------------
  // Lista de agenda (dias empilhados, eventos em ordem cronológica).
  //
  // Usada em três lugares: o modo foto (aba "Lista"), o modo embed em
  // espaço apertado (onde a grade escalada ficaria ilegível) e qualquer
  // coisa futura que precise de um resumo linear. Ao contrário da grade,
  // ela não depende de altura disponível — só rola —, então é a saída
  // certa quando a tela é pequena.
  // ---------------------------------------------------------------------
  function eventDotColor(ev) {
    // Compromissos pessoais podem ter cor própria escolhida pela pessoa.
    if (ev.color) return ev.color;
    return "var(" + (CATEGORY_COLOR_VAR[ev.category] || "--text-faint") + ")";
  }

  // Marca de "agora" pra lista. Na grade a hora atual é uma linha
  // horizontal posicionada por pixel; numa lista não há eixo de tempo, então
  // ela vira um separador inserido ENTRE os cards, na posição cronológica
  // certa — inclusive antes do primeiro ou depois do último evento do dia.
  function buildNowMarker(label) {
    const el = document.createElement("div");
    el.className = "list-now";
    el.setAttribute("role", "separator");
    el.setAttribute("aria-label", "Agora, " + label);
    el.innerHTML = '<span class="list-now-dot"></span>' +
      '<span class="list-now-label">' + escapeHtml(label) + "</span>" +
      '<span class="list-now-rule"></span>';
    return el;
  }

  function renderAgendaList(container, events, opts) {
    const options = opts || {};
    const dayOrder = options.dayOrder || [];
    const dayLabels = options.dayLabels || {};
    const skipEmptyDays = !!options.skipEmptyDays;
    const emptyText = options.emptyText || "Sem eventos com os filtros atuais.";
    // { day, minutes, label } — de que dia e a que horas estamos agora
    const now = options.now || null;

    container.innerHTML = "";
    let rendered = 0;

    dayOrder.forEach(function (day) {
      const dayEvents = events
        .filter(function (ev) {
          return ev.day === day;
        })
        .slice()
        .sort(function (a, b) {
          return toMinutes(a.start) - toMinutes(b.start);
        });

      const isToday = !!(now && now.day === day);
      // Um dia vazio some da lista compacta — a não ser que seja hoje, em
      // que a marca de "agora" ainda tem o que dizer ("hoje não tem nada").
      if (skipEmptyDays && dayEvents.length === 0 && !isToday) return;

      const section = document.createElement("div");
      section.className = "list-day" + (isToday ? " is-today" : "");

      const heading = document.createElement("h3");
      heading.textContent = dayLabels[day] || day;
      section.appendChild(heading);

      if (dayEvents.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = emptyText;
        section.appendChild(empty);
      }

      let nowInserted = false;

      dayEvents.forEach(function (ev) {
        rendered++;
        // insere a marca antes do primeiro evento que ainda não começou
        if (isToday && !nowInserted && toMinutes(ev.start) > now.minutes) {
          section.appendChild(buildNowMarker(now.label));
          nowInserted = true;
        }
        const card = document.createElement("div");
        card.className = "list-card";

        const dot = document.createElement("div");
        dot.className = "dot";
        dot.style.background = eventDotColor(ev);

        const time = document.createElement("div");
        time.className = "lc-time";
        time.textContent = fmtRange(ev.start, ev.end);

        const body = document.createElement("div");
        body.className = "lc-body";
        body.innerHTML =
          "<div class='lc-title'>" + escapeHtml(titleFor(ev)) + "</div>" +
          "<div class='lc-sub'>" + escapeHtml(subtitleFor(ev)) + "</div>";

        card.appendChild(dot);
        card.appendChild(time);
        card.appendChild(body);
        // o card em andamento agora ganha destaque
        if (isToday && toMinutes(ev.start) <= now.minutes && now.minutes < toMinutes(ev.end)) {
          card.classList.add("is-now");
        }
        section.appendChild(card);
      });

      // já passou de tudo hoje (ou hoje não tem nada): a marca fecha o dia
      if (isToday && !nowInserted) {
        section.appendChild(buildNowMarker(now.label));
      }

      container.appendChild(section);
    });

    if (rendered === 0 && skipEmptyDays) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      container.appendChild(empty);
    }
    return rendered;
  }

  // ---------------------------------------------------------------------
  // Serialização pro documento do modo foto
  // ---------------------------------------------------------------------
  const SERIALIZABLE = {
    toMinutes: toMinutes,
    fmtRange: fmtRange,
    timesOverlap: timesOverlap,
    escapeHtml: escapeHtml,
    titleCasePtBr: titleCasePtBr,
    titleFor: titleFor,
    subtitleFor: subtitleFor,
    packColumns: packColumns,
    layoutOverlaps: layoutOverlaps,
    blockGeometry: blockGeometry,
    eventDotColor: eventDotColor,
    buildNowMarker: buildNowMarker,
    renderAgendaList: renderAgendaList,
  };

  function serialize() {
    const consts =
      "var CATEGORY_COLOR_VAR = " + JSON.stringify(CATEGORY_COLOR_VAR) + ";\n" +
      "var OVERLAY_INSET_PCT = " + OVERLAY_INSET_PCT + ";\n";
    const fns = Object.keys(SERIALIZABLE)
      .map(function (name) {
        return "var " + name + " = " + SERIALIZABLE[name].toString() + ";";
      })
      .join("\n");
    return consts + fns;
  }

  const api = {
    CATEGORY_COLOR_VAR: CATEGORY_COLOR_VAR,
    OVERLAY_INSET_PCT: OVERLAY_INSET_PCT,
    serialize: serialize,
  };
  Object.keys(SERIALIZABLE).forEach(function (name) {
    api[name] = SERIALIZABLE[name];
  });
  return api;
})();
