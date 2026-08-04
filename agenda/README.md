# Semana Padrão — 8º Período

Agenda visual interativa da semana padrão, gerada a partir da planilha oficial
(`SEMANA PADRÃO`), com filtros por categoria/grupo, tema claro/escuro e um
"modo foto" pra print/screenshot.

## Estrutura

```
.
├── data/
│   └── schedule.xlsx         <- planilha original (.xlsx). Substitua este arquivo
│                                quando houver uma nova versão do horário.
├── scripts/
│   └── extract_schedule.py   <- lê o .xlsx e gera output/events.json + events.js
├── output/
│   ├── events.json           <- dados extraídos, formato legível/reaproveitável
│   └── events.js             <- os mesmos dados, como `window.SCHEDULE_DATA = {...}`
│                                (é o que a página realmente carrega)
├── assets/
│   ├── shared.js             <- funções puras (horário, texto, layout de sobreposição)
│   │                            usadas pelo app E pelo modo foto
│   ├── app.js                <- lógica do app (grid, filtros, visões, tema, .ics, embed)
│   └── icon.svg              <- ícone do PWA / favicon
├── sw.js                     <- service worker (offline)
├── manifest.webmanifest      <- metadados do PWA ("adicionar à tela de início")
└── horarios-interativos.html <- página principal (HTML + CSS inline)
```

> O `shared.js` precisa ser carregado **antes** do `app.js`. As funções que
> ele exporta são serializadas com `Function.prototype.toString()` pra
> rodar dentro do documento standalone do modo foto — por isso cada uma
> precisa ser autocontida (sem fechar sobre variáveis externas). Tem um
> aviso sobre isso no topo do arquivo.

## Como atualizar quando o horário mudar

1. Substitua o arquivo `data/schedule.xlsx` pela nova versão da planilha
   (mesmo nome de arquivo, mesmo layout "SEMANA PADRÃO").
2. Rode o script de extração:

   ```bash
   python3 scripts/extract_schedule.py
   ```

   Isso regenera `output/events.json` e `output/events.js` a partir do
   arquivo novo. O script imprime no terminal:
   - quantos eventos foram extraídos;
   - quais grupos existem em cada categoria filtrável;
   - **conflitos críticos** (mesmo preceptor em dois horários que se cruzam —
     provável erro na planilha, vale checar);
   - **notas informativas** (mesmo horário/local com preceptores diferentes —
     geralmente é normal, grupos rodando em paralelo, mas fica registrado
     pra você revisar se achar estranho).

3. Abra (ou recarregue) o `horarios-interativos.html` no navegador. Como
   ele carrega os dados via `<script src="output/events.js">`, as mudanças
   aparecem automaticamente — não é preciso editar HTML/JS na mão.

Requisitos para rodar o script: Python 3 com `openpyxl` instalado
(`pip install openpyxl` caso ainda não tenha).

## Escopo dos dados extraídos

O script **só** processa estas categorias (tudo o mais na planilha —
ex. Área Verde, Momento NED — é ignorado de propósito):

| Categoria (no app)         | O que pega na planilha                                   |
|-----------------------------|-----------------------------------------------------------|
| HAM                          | `HAM - PALESTRA` (comum a todos) + `HAM - PRÁTICA` (grupos 1-4) |
| Clínica Integrada – CI Prática | Todas as linhas `CI PRATICA - <local>` (Clínica Acadêmica, Polimeg, UBS, Casa da Criança), todos os grupos |
| PIEPE                        | Todas as linhas `PIEPE`, todos os grupos                  |
| IESC / Comunidades           | `COMUNIDADES - PRÁTICA` (grupos 1-4) + `IESC - PALESTRA` (comum) |
| Clínica Integrada – CI MARC / Palestra | `CLÍNICA INTEGRADA - CI - MARC` e `CLÍNICA INTEGRADA - CI - PALESTRA`, sempre que aparecerem |

**Todos os grupos de cada categoria são extraídos** (não só o seu), pra que
os filtros/dropdowns do app funcionem de verdade. Os filtros padrão do app
(o que já vem marcado ao abrir) são: HAM grupo 1, CI Prática 5/6, PIEPE
grupo 1, IESC/Comunidades grupo 2 — mas dá pra trocar em cada dropdown.

## Avisos sobre a planilha original (revisar)

Pontos que vale conferir na planilha, porque podem ser inconsistências
reais da fonte (e não erro de leitura do script).

**Nenhum conflito crítico** (mesmo preceptor em dois horários que se
cruzam) é apontado hoje. O que existia aqui — Profa. Agnis de Jesus com
Comunidades/IESC de quinta se sobrepondo por 10 minutos entre os grupos 01
e 04 — **foi corrigido na planilha**: os quatro grupos agora estão
escalonados de hora em hora (18:00, 19:00, 20:00, 21:00).

O que continua valendo a pena olhar:

1. **PIEPE de quinta-feira simultâneo:** Grupo 03 (Profa. Kênia) e Grupo 04
   (Prof. Lucas Amaral) aparecem **no mesmo horário** (08:00–08:50). Na
   terça-feira o PIEPE é escalonado (grupos em horários diferentes), então
   essa simultaneidade de quinta pode ser proposital (dois preceptores, duas
   salas) ou pode ser um copy-paste sem ajustar o horário — não deu pra saber
   pela planilha. É justamente o caso que motivou o painel
   "Ajustar horários": quando a turma combina outro horário com o professor,
   dá pra corrigir no app sem mexer na planilha.
2. **CI MARC/Palestra distribuído de forma irregular:** segunda tem só CI
   Palestra (20:30–21:20, "Prof. Marcelo"); terça tem dois MARC + Palestra;
   sexta tem **quatro** MARC + Palestra, com preceptores que mudam ao longo
   do dia (Prof. Adriano Monteiro na primeira metade, Profa. Naira e Prof.
   Iomar na segunda). Quarta e quinta não têm nenhum. Foi incluído como está
   na planilha — fica o registro caso algum dia devesse ter MARC também.
3. **Grupos "paralelos" na CI Prática:** é comum ver 2-4 preceptores
   diferentes no mesmo horário/mesmo local na CI Prática (ex. terça 07:50-12:00
   na Clínica Acadêmica tem 3 preceptoras simultâneas para grupos diferentes).
   Isso não foi tratado como erro — parece ser o formato normal da CI Prática
   (vários grupos, mesmo prédio, preceptores diferentes) — mas está listado
   na íntegra no `output/events.json` (`warnings.notas_informativas`) caso
   quiser conferir.

## Sobre o app (horarios-interativos.html)

- **Visão Semana / Dia**: a semana inteira em colunas, ou um dia só ocupando
  a largura toda. Em tela estreita (≤720px) a visão de dia é o padrão.
  Entrar na visão de dia **sempre cai em hoje** — e o dia não é lembrado
  entre visitas, porque abrir a agenda é quase sempre pra ver hoje. Depois
  disso dá pra navegar com as setas ‹ › ou com as teclas ← →. Escolher
  Semana ou Dia na mão fica salvo e passa a valer independente do tamanho
  da tela.
- **Onde estamos agora**: a linha vermelha da grade tem equivalente na
  lista do embed — como a lista não tem eixo de tempo, ela vira um
  separador entre os cards, na posição cronológica certa, e a aula em
  andamento ganha contorno vermelho. **O modo foto não mostra nenhuma
  das duas**, de propósito: ele existe pra virar print, e um print com
  "estamos às 09:37" nasce velho.
- **Grid principal**: dias em colunas, horário em linhas. Eventos que se
  sobrepõem ficam lado a lado, **exceto** quando um evento curto está
  inteiramente dentro de um pelo menos 2x mais longo (ex.: PIEPE de 50min
  dentro da CI Prática de 4h): aí o curto flutua por cima, encostado à
  direita, e o longo continua legível em vez de os dois virarem tiras de
  50% de largura.
- **Filtros**: um checkbox por categoria (liga/desliga) + um dropdown de
  grupo para HAM, CI Prática, PIEPE e IESC/Comunidades. CI MARC/Palestra só
  tem checkbox (é comum a todos os grupos). Sua escolha de filtros fica
  salva no navegador (localStorage) entre uma visita e outra.
- **Tema**: detecta claro/escuro do sistema por padrão; dá pra trocar
  manualmente no botão "Tema" (também fica salvo). As cores de cada
  categoria são fixas nos dois temas — só o fundo/texto/bordas do grid
  mudam.
- **Responsivo**: em telas pequenas os filtros quebram linha e, se o grid
  não couber na largura, aparece scroll horizontal com uma dica visual (seta
  no canto).
- **Modo foto**: botão que abre uma nova aba com a visualização atual
  (respeitando os filtros ligados no momento), pensada pra print/screenshot.
  Dentro dela dá pra alternar entre:
  - **Grade**: o mesmo grid dias × horários, redimensionado via JS pra caber
    inteiro na tela sem rolar (mesmo no celular);
  - **Lista**: os dias empilhados verticalmente, eventos em ordem
    cronológica, com rolagem normal.

- **Ajustar horários**: quando a turma combina outro horário direto com o
  professor (o PIEPE é o caso clássico, porque colide com a CI Prática), dá
  pra sobrescrever dia/início/fim de qualquer aula visível. O ajuste vale
  só pra você, aparece com contorno tracejado e o rótulo "horário
  ajustado", e entra no grid, no modo foto, no link compartilhado e no
  `.ics` baixado. "Restaurar" volta ao horário da planilha.
  A chave do ajuste é montada com os valores **originais** do evento, então
  ele continua colado na aula certa; se a planilha mudar aquele horário, o
  ajuste é descartado — o oficial mudou, vale recombinar.
- **Compromissos pessoais** ("Meus horários"): você adiciona os seus
  (estudo, academia, o que for) e escolhe a cor numa paleta fixa de 8.
  Não é seletor livre de propósito — cor arbitrária costuma cair em
  contraste ruim com o texto branco do card ou ficar igual a uma
  categoria oficial. As 8 passam em AA e estão longe das cores de
  categoria. Compromissos salvos antes disso existir continuam válidos:
  caem na cor padrão (rosa). Cada um pode ser **toda semana ou quinzenal**
  (semana 1 / semana 2), igual às práticas de CI — quinzenal aparece com
  hachura diagonal. Tudo fica só no seu navegador.
- **Compartilhar** (botão à direita):
  - *Copiar link*: abre a página inteira, com os filtros liberados pra
    quem receber mexer;
  - *Copiar link de embed*: acrescenta `&embed=1` e abre só o calendário
    — é o que vai no bloco de Embed do Notion (ver abaixo);
  - *Baixar .ics*: exporta **tudo o que você está vendo** — aulas dos
    filtros ligados, compromissos pessoais e seus ajustes de horário. Os
    horários vão sem fuso ("floating"), então 09:00 continua 09:00 em
    qualquer lugar. Dentro do painel há um "O que é o .ics e como
    importar" (fechado por padrão) com o passo a passo do Google e da
    Apple — a explicação mora onde a pessoa está, não só neste README.
- **Embed no Notion**: o link de embed se adapta ao tamanho do bloco. Se a
  grade couber sem o texto ficar menor que ~8,5px, mostra a grade
  escalada, alargada pra preencher o bloco. Se não couber — bloco baixo,
  ou celular, onde a grade cairia pra ~5px e viraria borrão — troca
  automaticamente pra uma **lista** de dias empilhados, no tamanho real da
  fonte, com rolagem vertical e o nome do dia grudado no topo. O embed
  sempre mostra a semana, independente de quem abriu estar na visão de
  dia. Ver `EMBED_MIN_FONT_PX` em `assets/app.js`.
- **Offline / celular**: a página é um PWA. No celular dá pra "adicionar à
  tela de início" e ela abre como app, inclusive sem internet. Quem cuida
  disso é o `sw.js`, que guarda o app e o horário em cache — o horário é
  sempre buscado na rede primeiro, com o cache só de reserva, pra nunca
  mostrar uma semana velha.

Tudo em HTML/CSS/JS puro, sem nenhuma dependência externa (nenhum CDN,
nenhuma biblioteca) — basta abrir o `horarios-interativos.html` direto no
navegador.

> Duas coisas só funcionam servindo por http(s), não abrindo o arquivo via
> `file://`: o service worker (offline/PWA) e a instalação na tela de
> início. Abrindo direto o arquivo, o registro falha silenciosamente e o
> resto do app continua normal. Em produção é o GitHub Pages, então tudo
> funciona.

## Levar pro Google Agenda / Apple Calendário

Pelo **Baixar .ics** do painel Compartilhar. É o único caminho, e leva
tudo: aulas dos filtros ligados, compromissos pessoais e ajustes de
horário.

O passo a passo (o Google só importa pelo computador — o app de celular
não importa arquivos) está dentro do próprio painel, no bloco recolhível
"O que é o .ics e como importar". Ver `renderIcsHelp()` em
`assets/app.js`: a explicação mora onde a pessoa está, não só aqui.

> **Já existiu aqui uma assinatura por URL.** O script gerava feeds `.ics`
> estáticos em `output/ics/` (um por categoria+grupo) que o Google/Apple
> rebuscavam sozinhos, mantendo tudo atualizado sem ninguém fazer nada.
> Foi removida — e o motivo não era técnico, funcionava bem.
>
> Um arquivo estático e compartilhado nunca poderia conter o que torna o
> horário **seu**: os ajustes manuais e os compromissos pessoais vivem no
> navegador de cada um. Pior, calendário assinado é somente leitura no
> Google e na Apple, então nem dava pra corrigir do outro lado: quem
> tivesse remarcado uma aula veria o horário errado, sem conserto.
>
> Duas formas de exportar, uma delas silenciosamente errada, é pior do que
> uma só correta.
## Reimportar não duplica: o contrato do UID

Cada `VEVENT` leva um `UID`, e é ele que o Google/Apple usa pra decidir se
um evento que chega é **o mesmo de antes** (atualiza no lugar) ou **um
novo** (cria ao lado). Por isso o UID é montado só com o que identifica a
aula, e não com o que muda nela:

```
CI_PRATICA-QUINTA-0750-78-CLNICAACADMICA@gabrielsvieira01.github.io
 categoria    dia  hora  grupo   local
```

- **Não usa o `id` da planilha** (`ev001`, `ev002`…): ele é sequencial, e
  inserir uma linha na planilha renumeraria tudo — todo evento viraria
  "novo" no calendário de quem já tinha importado.
- **Não usa o horário atual, e sim o da planilha.** Assim, remarcar uma
  aula em "Ajustar horários" move o evento existente em vez de criar um
  segundo e deixar o antigo encalhado.
- **Inclui o local**, que não é redundante: o grupo 7/8 tem duas práticas
  de CI na quinta no mesmo horário, em locais diferentes. Sem o local, uma
  sobrescreveria a outra.

`icsUid()` em `assets/app.js` e `ics_uid()` em `extract_schedule.py`
precisam produzir **exatamente o mesmo UID** pra mesma aula — quem assina
um feed e depois importa o arquivo não pode acabar com tudo duplicado. Se
mexer num, mexa no outro.

Consequência prática: reimportar o `.ics` no mesmo calendário depois de
qualquer mudança atualiza os eventos no lugar. O que **não** se resolve
sozinho é aula que sumiu da grade — essa continua lá até você apagar.

## Quinzenal (semana 1 / semana 2)

Marcar uma aula como "semana 1" ou "semana 2" diz **quais** aulas se
alternam, mas não diz **qual semana do calendário** é a 1 — isso não está
na planilha nem dá pra deduzir. São duas informações diferentes:

| | onde vive | |
|---|---|---|
| Quais aulas se alternam | `localStorage` de cada aluno (painel "Semanas") | não está na planilha |
| Qual semana do calendário é a 1 | campo de data no painel "Semanas" | preenchido uma vez |

Com as duas preenchidas, o **`.ics` baixado** exporta recorrência
quinzenal de verdade: `FREQ=WEEKLY;INTERVAL=2;WKST=MO`, com o `DTSTART`
na primeira ocorrência de paridade correta. Sem a data de referência, a
aula marcada cai pra semanal e a descrição do evento diz por quê —
aparecer a mais é melhor do que sumir.

O `WKST=MO` não é decoração: com `INTERVAL` maior que 1, o RFC 5545 conta
os intervalos a partir do início da semana, e o padrão é domingo.
