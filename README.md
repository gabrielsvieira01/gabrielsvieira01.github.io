# QG

Central de treino e peso. Um app, uma planilha, um deploy.

Nasceu da fusão de `treinos/` e `registro-peso/`, que eram dois apps irmãos —
mesmos tokens de CSS, mesma convenção de `localStorage`, mesmo desenho de Apps
Script — escritos desde o começo para poderem virar um só.

```
[index.html] --fetch--> [Apps Script Web App] --> [Google Sheets]
                        doGet(?api=1) / doPost   Plano | Progresso | Registros
      ^
      |  raspa o HTML
[widget do iPhone]
```

## As quatro abas

| Aba | O que é |
|---|---|
| **Hoje** | O treino do dia, o peso mais recente com a tendência de 7 dias, e o atalho para pesar. É a tela que só existe porque os dois apps viraram um. |
| **Plano** | As 40 semanas, abrindo e fechando semana a semana. |
| **Peso** | O número grande, o formulário, o gráfico com média móvel e o resumo por período. |
| **Ritmos** | Ritmos-alvo, tiros, tempos previstos, conversor e glossário. |

## Ligar na planilha

O app funciona sem nada disso — sem a planilha, ele guarda tudo no próprio
navegador. Publicar o Apps Script é o que faz celular e PC verem o mesmo estado.

1. Na planilha, **Extensões › Apps Script**.
2. Cole `apps-script/Codigo.gs` no arquivo de código.
3. Crie um arquivo HTML chamado **`Pagina`** e cole `apps-script/Pagina.html`.
4. Rode `testar` uma vez e autorize. O log diz em qual conta e em qual planilha
   o script caiu — é o que resolve erro de permissão.
5. **Implantar › Gerenciar implantações › (editar) › Nova versão.**

> ⚠️ Na etapa 5, **editar a implantação existente**, não criar uma nova.
> Implantação nova gera outra URL `/exec`, e aí é preciso trocar a URL no
> `index.html` e recolar o widget no iPhone. Editar preserva a URL que já está
> no ar.

Se a URL mudar mesmo assim, troque a linha `var URL_DO_APP` no `index.html`.

### Abas da planilha

- **`Plano`** — os treinos. Lida pelo `gerar-plano.mjs`, não pelo script.
  A coluna **K (`Feita?`)** é escrita pelo app quando você fecha uma semana.
- **`Progresso`** — uma linha por treino marcado (`semana`, `dia`, `tipo`,
  `quando`). Criada sozinha na primeira gravação.
- **`Registros`** — uma linha por dia de peso (`data`, `peso`). Criada sozinha
  na primeira pesagem. Regravar a mesma data sobrescreve, então corrigir é
  reenviar.
- **`Rotina`** e **`Ritmos`** — entrada do `gerar-plano.mjs`.

## ⚠️ O contrato com o widget

`scriptable/Treinos.js` **não usa API**. Ele baixa o HTML de `/qg/` e extrai
duas coisas por expressão regular:

- o bloco `<script type="application/json" id="plano">`;
- a declaração de `URL_DO_APP` seguida de uma URL `https` entre aspas.

Mudar o formato de qualquer uma das duas **quebra o widget do iPhone em
silêncio** — sem erro, ele apenas para de atualizar. Duas consequências
práticas:

- não reproduza o padrão `var URL_DO_APP = "https://…"` em comentário nenhum:
  quem raspa pega a primeira ocorrência, e uma segunda vira isca;
- o `sincronizar.mjs` aborta se qualquer um dos dois sumir.

## Manutenção

```bash
node gerar-plano.mjs     # planilha mudou: regera o <script id="plano">
node sincronizar.mjs     # interface mudou: regera apps-script/Pagina.html
```

`index.html` é a única fonte. `apps-script/Pagina.html` é derivado — não edite
lá, as mudanças voltam a ser sobrescritas.

Mudou a planilha: baixe como `.xlsx`, substitua `fonte/Treinos.xlsx` e rode
`gerar-plano.mjs`.

## Como o estado é guardado

A planilha é o banco de dados; o `localStorage` é cache e **fila de saída**.

Cada marcação e cada pesagem vira uma operação na fila (`marca`, `semana`,
`peso`), e uma só requisição leva o lote. Operações, e não estado inteiro:
dois aparelhos que ficaram offline em momentos diferentes precisam somar o que
fizeram, não apagar o trabalho um do outro.

Duas chaves, de propósito:

- `qg:estado:v1` — treino e fila. Autoritativo até sincronizar.
- `qg:peso:v1` — histórico de peso. Só cache do que a planilha confirmou.

Num blob único, uma leitura de peso passaria por cima de marcações de treino
ainda não enviadas. Na primeira abertura, as chaves dos apps antigos
(`treinos:v1` e `registro-peso:historico`) são lidas uma vez.

Consequência de a pesagem ter entrado na fila: pesar offline **não** dá mais
erro, fica pendente e sobe depois. A validação de faixa (20–400 kg) continua
acontecendo antes de enfileirar, então valor errado segue barrado na hora.

## Hospedagem

Nas duas formas, do mesmo arquivo:

- **GitHub Pages** (`/qg/`) — fala com o Apps Script por `fetch`;
- **servido pelo próprio `doGet`** — fala por `google.script.run`, sem HTTP e
  sem CORS.

O rótulo no topo direito diz qual dos dois está valendo.

## Widget

`scriptable/Treinos.js`, no app Scriptable do iPhone. Mostra o treino de hoje e
só ele; tocar abre o site. Não marca treino de propósito — widget do Scriptable
não executa código ao toque, só abre URL.

### Por que ele às vezes não atualiza sozinho

Quem decide quando um widget acorda é o **WidgetKit**, não o script.
`refreshAfterDate` é uma sugestão, e o iOS mantém um orçamento diário por
widget. Nenhum app de terceiro consegue intervalo garantido no iOS.

O que **bloqueia por completo**, em ordem de probabilidade:

1. **Modo de Baixo Consumo** — suspende atualização de widget.
2. **Atualizações em 2º Plano** desligada para o Scriptable, em *Ajustes ›
   Geral › Atualizações em 2º Plano*.
3. A execução em segundo plano estar falhando e caindo no cache.

**Como saber qual é, sem tocar em nada:** quando o widget está mostrando dado
velho, aparece um **`·` extra** no canto superior direito, depois do
`S8 · Base`. Se o `·` está lá, ele *está* acordando e a rede é que falha
(caso 3). Se não está e o dado é velho, o iOS não está acordando (casos 1 e 2).

### O modo de execução muda com o contexto

| Contexto | O que faz |
|---|---|
| Tela de início (`runsInWidget`) | Cache primeiro. Só vai à rede se o cache estiver frio. |
| Dentro do Scriptable (`runsInApp`) | Pré-visualização, sempre com dado novo da rede. |
| **Atalhos / automação** | Vai à rede e **aquece o cache**. Não apresenta nada. |

A terceira linha existe para a automação. Uma pré-visualização modal numa
automação em segundo plano trava a execução ou escancara o Scriptable — por
isso esse caminho não desenha nada.

### Automação no app Atalhos

O Atalhos **não repinta o widget** — só o WidgetKit faz isso. O que ele compra
é que, quando o WidgetKit repintar, o dado já esteja em disco: a acordada passa
a ser leitura de dois JSON locais em vez de baixar 85 kB de HTML e esperar o
Apps Script. Ou seja, não aumenta a frequência; faz **toda acordada valer**.

Receita:

1. Atalhos › **Automação** › Nova › **Hora do Dia**.
2. Escolha o horário (um de manhã já resolve o caso comum; dá para repetir a
   automação em outros horários).
3. Ação: **Executar Script** (do Scriptable) › escolha o script na lista. O
   nome é o que você deu a ele dentro do Scriptable, que não tem relação com o
   nome do arquivo aqui no repositório.
4. Deixe **"Executar no app"** desligado e **"Perguntar Antes de Executar"**
   desligado.

> Se um dia renomear o script no Scriptable, o widget da tela de início
> **para** — ele aponta para um script pelo nome. Depois de renomear, segure o
> widget › Editar Widget › e selecione o script de novo. A automação do Atalhos
> também precisa ser reapontada.

Rodar o script assim é seguro e barato: ele só busca e grava o cache.

O cache tem dois prazos, porque as duas coisas mudam em ritmos muito
diferentes: **plano 12 h** (só muda quando eu rodo o `gerar-plano.mjs`) e
**progresso 20 min**. A URL do Apps Script é guardada junto do plano — é o que
permite pular o download do HTML enquanto o plano estiver fresco.
