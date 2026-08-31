# Registro de peso

Interface de lançamento diário de peso. A planilha do Google continua sendo o
banco de dados; esta página só escreve e lê, para que a planilha nunca mais
precise ser aberta à mão.

```
[index.html] --fetch--> [Apps Script Web App] --> [Google Sheets]
                        doGet(?api=1) / doPost      data | peso
```

## Estado

O código está pronto e testado contra um servidor que imita o Apps Script.
Falta só o que exige a sua conta Google: colar o script e publicar.

Use **qualquer planilha, em qualquer conta**. O script não guarda ID: aberto
pela própria planilha, ele descobre sozinho em qual está. A aba `Registros` e o
cabeçalho nascem na primeira gravação, então a planilha pode estar vazia.

## Publicar (uma vez, ~5 minutos)

1. Abra a planilha que você quer usar → **Extensões › Apps Script**.
   Precisa ser por aí: é isso que vincula o script à planilha e dispensa
   qualquer configuração de ID ou permissão de acesso a outro arquivo.
2. Apague o conteúdo de `Código.gs` e cole o de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Rode a função `testar` uma vez. O Google vai pedir autorização — é o próprio
   script pedindo acesso à sua planilha. O log mostra em qual conta e em qual
   planilha ele caiu, e confirma que a aba foi criada.
4. **Implantar › Nova implantação › App da Web**:
   - Executar como: **eu**
   - Quem tem acesso: **qualquer pessoa**
5. Copie a URL gerada (`https://script.google.com/macros/s/…/exec`).
6. Em [`index.html`](index.html), troque `COLE_A_URL_AQUI` por essa URL (linha 219).
7. `git add . && git commit && git push` — o GitHub Pages publica em
   `gabrielsvieira01.github.io/registro-peso/`.
8. No celular: abrir a página, menu do navegador, **adicionar à tela de início**.

Enquanto o passo 6 não acontece, a página abre com um aviso em âmbar dizendo
exatamente isso, em vez de falhar em silêncio.

### Servir pelo próprio Apps Script (opcional)

Faz o mesmo app rodar sem depender do GitHub Pages, útil se um dia a página
estática incomodar:

1. No editor do Apps Script: **+ › HTML**, nome `Pagina`.
2. Cole o conteúdo de [`apps-script/Pagina.html`](apps-script/Pagina.html).
3. Reimplante. A URL `/exec` sem parâmetros passa a devolver a interface.

Nesse modo o navegador não usa `fetch`: o HTML roda num iframe sandbox do
`googleusercontent.com`, onde uma chamada relativa não chega ao seu `doGet`. A
ponte é `google.script.run`, que também elimina qualquer discussão de CORS. A
página detecta sozinha em qual dos dois modos está — o canto superior direito
mostra `github pages` ou `apps script`.

## Mexer na interface

`index.html` é a única fonte. Depois de editar:

```bash
node sincronizar.mjs
```

Isso regenera `apps-script/Pagina.html`. Se você usa o modo servido pelo Apps
Script, cole o resultado lá e reimplante. Não edite `Pagina.html` à mão.

## Decisões

**Um registro por dia, resolvido no servidor.** `gravarPeso` procura a data
antes de escrever: se já existe, sobrescreve a linha. Isso torna a correção
trivial (reenviar o dia) e impede linha duplicada no toque duplo. Um
`LockService` cobre o caso de duas abas gravando ao mesmo tempo.

**Resposta otimista, com desfazer.** O ponto aparece no gráfico na hora, pintado
mais fraco, com um "salvando…" discreto. Se a gravação falhar, o ponto é
removido e o valor volta para o campo — a tela nunca mostra um dado que não está
na planilha.

**A planilha é a única fonte.** Cada aparelho busca o histórico do zero ao abrir,
e de novo ao voltar o foco para a aba. O `localStorage` guarda só um cache para
a página abrir com algo na tela, sempre sobrescrito pelo que vem da planilha.
Por consequência, lançar no celular e abrir no PC mostra o mesmo dado, sem
nenhum código de sincronização.

**POST sem preflight.** O corpo vai como `text/plain` (é o padrão do `fetch`
quando não se define cabeçalho), o que faz dele uma requisição simples. Qualquer
`Content-Type: application/json` dispararia um `OPTIONS`, que um web app do Apps
Script não responde. Não adicione cabeçalhos ao `fetch`.

**Média móvel por dias de calendário, não por linhas.** Com buracos no histórico
— viagem, fim de semana esquecido — as últimas 7 linhas podem cobrir um mês, e a
curva mentiria. A média só é desenhada onde há pelo menos 2 dias reais atrás dela.

**Data no cliente.** O dia é o do aparelho, não o do servidor, então o registro
cai no dia certo independente do fuso do script. O campo de data também permite
lançar um dia esquecido sem abrir a planilha.

## Erro de permissão

> `Exception: You do not have permission to access the requested document.`

Significa que o script tentou abrir uma planilha **de outra conta** — é o que
acontece se `ID_PLANILHA` estiver preenchido com o ID de uma planilha que a
conta atual não possui. Deixe `ID_PLANILHA` vazio e abra o editor pela própria
planilha (**Extensões › Apps Script**): aí não há documento externo a acessar.

`testar` imprime no log a conta em que o script roda e a planilha que ele
resolveu — compare com a dona da planilha antes de procurar em outro lugar.
Se as duas contas diferem e você não pediu isso, provavelmente há várias contas
Google logadas no navegador e o editor abriu na errada.

## Segurança

Não há senha: quem descobrir a URL do web app pode gravar na planilha. Foi uma
escolha consciente para uso pessoal — o dado é o seu peso, e o custo real de um
bot varrendo URLs é uma linha estranha na planilha, apagável à mão.

Se um dia incomodar, o conserto é pequeno: mande um campo a mais no corpo do
POST e faça `gravarPeso` rejeitar o que não bater. Continua não sendo segurança
de verdade — para isso o caminho seria OAuth com a API oficial do Sheets.

## Custo

| Peça | Custo | Limite relevante |
|---|---|---|
| Google Sheets | grátis | — |
| Apps Script (conta gratuita) | grátis | 20.000 chamadas/dia; 90 min de execução/dia |
| GitHub Pages | grátis | arquivo único, sem build |

Uso real estimado: ~3 chamadas por dia.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | o app inteiro — fonte única, sem dependências |
| `apps-script/Codigo.gs` | servidor: `doGet`, `doPost`, `lerHistorico`, `gravarPeso` |
| `apps-script/Pagina.html` | cópia gerada de `index.html`, para o modo servido |
| `sincronizar.mjs` | regenera `Pagina.html` |
