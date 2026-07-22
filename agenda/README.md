# Semana Padrão — 8º Período

Agenda visual interativa da semana padrão, gerada a partir da planilha oficial
(`SEMANA PADRÃO`), com filtros por categoria/grupo, tema claro/escuro e um
"modo foto" pra print/screenshot.

## Estrutura

```
.
├── data/
│   └── schedule.xlsx        <- planilha original (.xlsx). Substitua este arquivo
│                                quando houver uma nova versão do horário.
├── scripts/
│   └── extract_schedule.py  <- lê o .xlsx e gera output/events.json + events.js
├── output/
│   ├── events.json          <- dados extraídos, formato legível/reaproveitável
│   └── events.js            <- os mesmos dados, como `window.SCHEDULE_DATA = {...}`
│                                (é o que o index.html realmente carrega)
├── assets/
│   └── app.js                <- toda a lógica do app (grid, filtros, tema, modo foto)
└── index.html                <- página principal (HTML + CSS inline + carrega assets/app.js)
```

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

3. Abra (ou recarregue) o `index.html` no navegador. Como ele carrega os
   dados via `<script src="output/events.js">`, as mudanças aparecem
   automaticamente — não é preciso editar HTML/JS na mão.

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

Ao extrair os dados, o script encontrou os seguintes pontos que vale você
conferir na fonte, porque podem ser inconsistências reais da planilha (e não
erro de leitura):

1. **Conflito real de horário — quinta-feira, Comunidades/IESC:** o Grupo 04
   (20:00–20:50) e o Grupo 01 (20:10–21:00) aparecem com a **mesma
   preceptora** (Profa. Agnis de Jesus) em horários que se sobrepõem por 10
   minutos. Uma pessoa não dá duas práticas ao mesmo tempo — pode ser um
   erro de digitação no horário de um dos dois grupos.
2. **PIEPE de quinta-feira simultâneo:** Grupo 03 (Profa. Kênia) e Grupo 04
   (Prof. Lucas Amaral) aparecem **no mesmo horário** (08:00–08:50). Na
   terça-feira o PIEPE é escalonado (grupos em horários diferentes), então
   essa simultaneidade de quinta pode ser proposital (dois preceptores, duas
   salas) ou pode ser um copy-paste sem ajustar o horário — não deu pra saber
   pela planilha.
3. **CI MARC/Palestra inconsistente entre os dias:** terça e sexta têm CI MARC
   (dois horários) + CI Palestra, sempre com "Prof. Adriano Monteiro, Profa
   Naira e Prof. Iomar". Segunda-feira só tem CI Palestra (sem CI MARC) e com
   um preceptor diferente ("Prof. Marcelo"). Isso foi incluído como está na
   planilha, mas fica o registro caso segunda devesse ter CI MARC também ou o
   preceptor esteja errado.
4. **Grupos "paralelos" na CI Prática:** é comum ver 2-4 preceptores
   diferentes no mesmo horário/mesmo local na CI Prática (ex. terça 07:50-12:00
   na Clínica Acadêmica tem 3 preceptoras simultâneas para grupos diferentes).
   Isso não foi tratado como erro — parece ser o formato normal da CI Prática
   (vários grupos, mesmo prédio, preceptores diferentes) — mas está listado
   na íntegra no `output/events.json` (`warnings.notas_informativas`) caso
   quiser conferir.

## Sobre o app (index.html)

- **Grid principal**: dias em colunas, horário em linhas; eventos que se
  sobrepõem no mesmo dia ficam lado a lado automaticamente.
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

Tudo em HTML/CSS/JS puro, sem nenhuma dependência externa (nenhum CDN,
nenhuma biblioteca) — basta abrir o `index.html` direto no navegador.
