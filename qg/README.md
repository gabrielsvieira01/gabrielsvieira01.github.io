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
