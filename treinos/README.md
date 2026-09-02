# Treinos

A semana de treino inteira em forma de app: o plano de 40 semanas até a
maratona mais a musculação, que não está nele. Abre já mostrando o treino de
hoje; os próximos ficam abaixo, com menos destaque.

```
                     conteúdo, de vez em quando
[Google Sheets] --baixar .xlsx--> [fonte/] --gerar-plano.mjs--> [index.html]
       ^                                                              |
       |          progresso, o tempo todo                             |
       +---------- [Apps Script] <--fetch-- (fila no localStorage) <---+
```

Duas coisas diferentes vêm da planilha, por caminhos diferentes:

- **Conteúdo** (abas `Plano`, `Rotina`, `Ritmos`, `Glossário`) entra no
  `index.html` pelo gerador, de tempos em tempos. Fica embutido, e por isso o
  app abre offline.
- **Progresso** (o que você marcou) vai e volta pelo Apps Script, o tempo todo.
  A planilha é o banco de dados; o `localStorage` é cache e fila de saída.

O `fonte/Treinos.xlsx` é uma cópia da planilha do Google, não a original —
existe para o gerador rodar sem rede e sem login.

## O que ele decide sozinho

**A semana atual é a primeira que ainda não foi fechada.** Não existe data de
início nem data de prova, e por isso não existe treino atrasado: sumir por três
semanas não gera cobrança nenhuma, e voltar retoma exatamente na semana que
ficou devendo. O dia da semana vem do relógio do aparelho.

**A semana fecha quando o longão de sábado é marcado** — o sábado é o último
treino nas 40 semanas. Se você fez o resto mas não o sábado, o botão *fechar
semana* faz o mesmo à mão. Desmarcar o sábado reabre a semana.

**Musculação nunca fecha semana.** Ela é um item à parte, com marcação própria.

**Na bicicleta não aparece min/km.** O texto do treino é escrito em termos de
corrida, e um pace na bike não corresponde a nada — quarta e sexta mostram só o
nome do esforço.

## A rotina da semana

A aba `Plano` é o plano de corrida, como veio. Ela não sabe em que modalidade
cada treino é cumprido nem que existe musculação — isso é a aba **`Rotina`**,
sete linhas que o gerador lê:

| Dia | Musculação | Modalidade do cardio | Mostrar pace |
|---|---|---|---|
| Segunda | Sim | — | Não |
| Terça | Não | Corrida · rua | Sim |
| Quarta | Sim | Bicicleta | Não |
| Quinta | Sim | Corrida · esteira | Sim |
| Sexta | Sim | Bicicleta | Não |
| Sábado | Não | Corrida · longão | Sim |
| Domingo | Não | — | Não |

Modalidade vazia ou `—` é dia sem cardio. Mudou a rotina? Edite essa aba e rode
o gerador — não há nada a mexer no código. A ordem dos dias e os nomes da
coluna `Dia` é que não podem mudar; se mudarem, o gerador para e diz qual linha.

O dia que fecha a semana também sai daí: é o último dia com cardio, hoje o
sábado. Nas semanas 24 (prova de 5 km) e 40 (maratona) o `Plano` traz `—` na
quarta e na sexta, então esses dias ficam só com a musculação.

A coluna de segunda no `Plano` está vazia de propósito: ela dizia `Descanso` nas
40 linhas, o que deixou de ser verdade quando a musculação entrou. Quem manda no
dia é a `Rotina`.

Os dias de musculação trazem um botão **Abrir Treino.io**, que chama o app pelo
esquema `treinoio://`. Os treinos de corrida não têm botão equivalente: não dá
para mandar treino personalizado do iPhone para o Apple Watch, então eles
seguem configurados à mão.

## Depois de mexer na planilha

No Google Sheets: **Arquivo › Fazer download › Microsoft Excel (.xlsx)**,
substitua `fonte/Treinos.xlsx` e rode:

```bash
node gerar-plano.mjs
```

Lê o `.xlsx` e reescreve o bloco `<script id="plano">` dentro do `index.html`.
É idempotente e não toca em mais nada do arquivo — inclusive o carimbo
`geradoEm` só anda quando o conteúdo anda, senão o `index.html` mudaria sozinho
de um dia para o outro e criaria diferença falsa no git.

Se a planilha mudar de forma — outra quantidade de semanas, coluna fora do
lugar, sábado vazio, dias da `Rotina` reordenados — o gerador para com erro
nomeando a linha, em vez de gerar um app silenciosamente errado.

Isso só é necessário quando o **conteúdo** muda: o texto dos treinos, a rotina,
o tempo de 5 km, o glossário. Marcar treino como feito não passa por aqui.

> O download manual existe porque ler o Google Sheets direto exigiria a planilha
> publicada ou compartilhada por link, e um segundo caminho de leitura que eu
> não teria como testar sem a URL dela. Quando o Apps Script estiver publicado,
> o caminho natural é ele servir o plano junto com o progresso — mesma
> implantação, mesma autorização, sem expor a planilha.

## A aba Ritmos

Tudo sai de um número só: o seu tempo nos 5 km. Os encadeamentos são os da aba
`Ritmos` da planilha —
`ST = pace de 5 km + 10 s`, `MT = ST + 10`, `LT = MT + 9`, `MP = LT + 23`,
`HMP = LT + 4` — e o tempo de cada tiro é `pace de 5 km × distância + ajuste`.

Esses ajustes vêm da planilha e **não** são editáveis na tela: são calibração
do plano, não preferência de uso. Se um dia precisarem mudar, mude na planilha
e rode o gerador.

Com 30:00 nos 5 km: ST 6:10 · MT 6:20 · LT 6:29 · MP 6:52 · HMP 6:33 ·
400 m 2:15 · 1600 m 9:23 · maratona 4:49:44.

## Ligar na planilha

Este é o modo pretendido: a planilha é o banco de dados do progresso, e o
`localStorage` vira cache. Sem isto o app funciona, mas as marcações moram só
num navegador — limpar os dados do site apaga tudo, e celular e PC não se falam.

### A planilha já é nativa

Um `.xlsx` no Drive abre em **modo de compatibilidade do Office**, e nesse modo
**não existe Extensões › Apps Script**. Script vinculado só roda em arquivo
nativo do Google Sheets — é por isso que a planilha foi montada do zero e subiu
já convertida.

Para levá-la para outra conta: abra a planilha → **Arquivo › Fazer uma cópia**,
escolhendo o Drive da conta destino (ou compartilhe com ela e copie de lá).
A cópia nasce nativa também. Faça a cópia **antes** de colar o Apps Script: o
script é vinculado ao arquivo, e é na cópia definitiva que ele deve morar.

Confira sempre: abra **Extensões**. Se `Apps Script` não estiver no menu, o
arquivo não é nativo e nada abaixo vai funcionar.

A partir daí o Google Sheets é a original, e o `fonte/Treinos.xlsx` deste
repositório é só a cópia que o gerador lê.

### Publicar o script

1. Na planilha nativa → **Extensões › Apps Script**. Precisa ser por aí: é isso
   que vincula o script à planilha e dispensa qualquer ID ou permissão de
   acesso a outro arquivo.
2. Apague o `Código.gs` e cole o de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Rode `testar` uma vez. O Google vai pedir autorização. O log mostra em qual
   conta e em qual planilha o script caiu, e se ele achou a aba `Plano`.
4. **Implantar › Nova implantação › App da Web** — executar como **eu**,
   acesso para **qualquer pessoa**.
5. Copie a URL `.../exec` e troque `COLE_A_URL_AQUI` no `index.html`.
6. `git push`. O GitHub Pages publica em `gabrielsvieira01.github.io/treinos/`.
7. No celular: abrir a página e **adicionar à tela de início**.

A aba `Progresso` já vem pronta, com o cabeçalho que o script espera — o script
a criaria sozinho, mas deixá-la pronta tira uma variável do caminho. A coluna
`Feita?` do `Plano` passa a ser escrita, e marcar `Sim` à mão na planilha
continua valendo, porque é dela que as semanas fechadas são lidas.

O que o script escreve, e onde:

| Onde | O quê |
|---|---|
| `Progresso` A:D | uma linha por treino marcado (`semana`, `dia` 0–6, `tipo`, `quando`) |
| `Plano` coluna K, linhas 5–44 | `Sim` / `Não` por semana |

Ele **não** toca em mais nada. O texto dos treinos, a `Rotina`, os `Ritmos` e o
`Glossário` são só leitura para o gerador.

### Como a sincronização se comporta

O canto superior direito diz em que pé está: `planilha`, `salvando…`,
`offline · N a enviar` ou `só neste aparelho`.

Cada marcação vira uma **operação** (`marcou 8:1:cardio`), não um retrato do
estado inteiro, e entra numa **fila guardada no `localStorage`** antes de subir.
Isso dá três garantias:

- **Sem rede, nada se perde.** A fila fica no disco e escoa sozinha quando o app
  volta ao foco ou a rede volta. Fechar o app no meio não atrapalha.
- **Dois aparelhos não se apagam.** Marcar no celular sem sinal e marcar outra
  coisa no PC resulta nas duas marcações, não na última a sincronizar.
- **Reenviar é inofensivo.** As operações são idempotentes, então uma resposta
  perdida no caminho não duplica nem corrompe linha nenhuma.

Ao abrir, o app lê a planilha e reaplica por cima o que ainda não subiu — sem
esse reaplicar, abrir engoliria justamente as marcações feitas offline.

Um efeito colateral bem-vindo: se você usar o app em modo local por um tempo e
só depois ligar na planilha, a fila acumulada sobe inteira na primeira conexão.
O histórico local migra sozinho, sem passo de importação.

## Widget na tela de início (iPhone)

[`scriptable/Treinos.js`](scriptable/Treinos.js) é um widget para o app
**Scriptable**. Mostra o treino de hoje, e só ele — tocar abre o site.

### Instalar

1. Instale o **Scriptable** (App Store, grátis).
2. Abra o app → **+** no canto superior direito → cole o conteúdo de
   `scriptable/Treinos.js` → toque no nome do script e chame de **Treinos**.
3. Toque em ▶ uma vez, ainda dentro do Scriptable, para conferir que carrega.
4. Na tela de início: segure a tela → **+** → procure **Scriptable** → escolha o
   tamanho → adicione.
5. Segure o widget recém-adicionado → **Editar widget** → em *Script* escolha
   **Treinos**; em *When Interacting* deixe **Run Script**.

### De onde ele tira os dados

As mesmas duas fontes do app: o plano sai do `<script id="plano">` do próprio
HTML do site, e o progresso vem do Apps Script. A URL do Apps Script **não** é
escrita no widget — ele a lê do HTML, do mesmo lugar onde o app a guarda. Trocou
a implantação? Atualize o site e o widget acompanha.

Sem rede, ele mostra o último estado que conseguiu buscar, guardado em cache.

### Por que ele não marca treino

Widget do Scriptable não executa código ao toque — só abre URL. Um botão
"marcar feito" teria de abrir o site para funcionar, e o site já abre tocando em
qualquer lugar do widget. O botão não economizaria um toque sequer, e somaria
uma URL que altera dados. Aqui é leitura; marcar é no site.

O que ele mostra do estado: um **✓ verde** no que já foi feito.

**O widget não atualiza na hora.** Quem decide quando redesenhar é o iOS; o
script pede a cada 30 minutos. Marcou no site? O widget pode levar alguns
minutos para acompanhar.

## Decisões

**O plano vai dentro do `index.html`, não num `.json` ao lado.** Um `fetch`
custaria o funcionamento offline e em `file://`, que é exatamente o cenário de
abrir o app na rua. São 13 kB.

**O ponteiro da semana é derivado, nunca guardado.** `semanaAtual()` é a
primeira semana fora de `semanasFeitas`. Guardar o ponteiro abriria a
possibilidade de ele divergir das marcações; derivar torna isso impossível.

**Musculação e cardio são marcações separadas.** Numa quarta a academia pode
acontecer sem a bike, e o contrário também. Uma marcação só por dia perderia
essa diferença justamente nos dias em que ela existe.

**O chip mostra pace, não tempo.** Tanto num ritmo (`MT 6:20/km`) quanto num
tiro (`400 5:38/km`): pace é o número que o relógio mostra enquanto se corre. O
tempo total do tiro continua existindo, no verbete, a um toque.

**Texto estranho se conserta na planilha, não no app.** O leitor decora e nunca
reescreve, então a correção tem de vir da fonte. Foi o caso de
`Tempo curto (ST)`, que punha a tradução e a sigla lado a lado e ainda fazia o
`Tempo` virar chip de glossário colado num chip de pace — virou `em ST`, a forma
que o resto do plano já usava. Só as quintas das semanas 4 a 13 tinham isso:
terça é tiro puro, sem sigla, e sábado já escrevia `X km em MP`.

Cuidado ao mexer nisso: `Tempo` **continua sendo termo de glossário** em todos
os outros lugares. As 54 ocorrências restantes estão todas na quarta e na sexta
— os dias de bicicleta, onde não há min/km e a palavra é o único indicador de
esforço.

**O leitor de siglas decora, nunca reescreve.** O texto do treino é renderizado
como está na planilha; as siglas reconhecidas viram chips com o pace ao lado. O
que ele não reconhece aparece intacto, em vez de sumir. Os 280 treinos foram
conferidos: o texto sobrevive caractere por caractere nos dois modos.

**O parêntese de recuperação é lido primeiro.** Em `5 x 1000 (400 RI)`, o 400
é o trote de volta, não o tiro. Consumir o parêntese antes de procurar
distâncias é o que impede o app de anunciar um tempo-alvo para a recuperação.

**A rotina foi para a planilha, não ficou no código.** Ela começou como uma
constante no `index.html`, e isso deixava a planilha descrevendo uma semana que
não é a sua — segunda como descanso, quarta sem dizer que é bicicleta. Com a
aba `Rotina`, quem abre a planilha vê a semana inteira, e mudar a rotina deixa
de exigir editar JavaScript.

**A sincronização manda operações, não o estado inteiro.** Mandar o retrato
completo é mais simples de escrever e erra exatamente no caso que motiva ter
planilha: dois aparelhos offline em momentos diferentes: o último a sincronizar
apagaria o que o outro gravou. Operação a operação, elas somam. O custo é uma
fila persistida, e ela também é o que faz o app não perder nada sem rede.

**Nada que o app lê é fórmula, e o tempo de 5 km é um número de segundos.** A
planilha antiga guardava `00:30:00` como fração de dia formatada como hora —
exatamente o tipo de valor que se deforma numa conversão para o Sheets nativo.
Agora `Ritmos!B4` é `1800`. As colunas de pace continuam sendo fórmulas, mas só
para quem lê a planilha: se uma delas quebrar, o app não sente.

**As fórmulas vão com o valor já calculado junto.** Sem o `<v>` em cache, o
Google Sheets importa a fórmula e mostra a célula vazia — foi o que aconteceu na
primeira tentativa, e a aba `Ritmos` subiu com as colunas de pace em branco.

**A planilha foi refeita célula por célula, não convertida do arquivo antigo.**
O original vinha do LibreOffice com estilos legados, um gráfico e um comentário
em VML — coisas que atravessam mal a conversão para o Sheets nativo e que não
serviam para nada aqui. A que está no ar foi montada do zero a partir do mesmo
JSON que alimenta o app, então planilha e app não têm como divergir.

O gráfico "Progressão do treino longo" ficou para trás. Se fizer falta, no
Sheets são três cliques em `Plano!A5:A44` + `J5:J44`, e sai melhor que o antigo.

**Sem gráfico de aderência, sem sequência, sem badge de pendência.** O pedido
era explícito: nada cobrando treino atrasado. Um contador de dias seguidos
transformaria um dia perdido em dívida, que é o oposto disso.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | o app inteiro — três abas, sem dependências |
| `gerar-plano.mjs` | lê o `.xlsx` e injeta o plano no `index.html` |
| `fonte/Treinos.xlsx` | cópia da planilha do Google, para o gerador rodar sem rede |
| `scriptable/Treinos.js` | widget do iPhone: o treino de hoje na tela de início |
| `apps-script/Codigo.gs` | servidor opcional: `doGet`, `doPost`, `lerProgresso`, `gravarProgresso` |

## Juntar com o registro-peso

A ideia de um app só ainda está de pé, e este aqui já nasceu no formato do
outro para que a fusão seja colagem, não reescrita:

- os mesmos nomes de token de CSS (`--bg-base`, `--ink`, `--accent`, `--s1…--s16`);
- chaves de estado no mesmo formato (`treinos:v1` e `peso:v1`), legíveis lado a
  lado sem migração;
- o mesmo desenho de Apps Script (`planilha_()`, `doGet(?api=1)`, `doPost` em
  `text/plain`, `LockService`), então os dois viram um `Codigo.gs` com duas
  abas na mesma planilha;
- a barra de abas aceita uma quarta entrada: "Peso" entra como aba.
