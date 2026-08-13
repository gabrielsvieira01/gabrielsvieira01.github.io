# Pomodoro Vivo — retomada (rodada 3)

> Cole este arquivo inteiro como primeira mensagem de um chat novo.
>
> **Este documento substitui o `PROMPT-REINICIO.md`.** Aquele descreve como
> pendente um trabalho que já foi feito (portar o fundo e os três primeiros
> objetos). Se concordar, apague o antigo — dois documentos de retomada
> competindo é armadilha garantida.

---

Estou retomando o **Pomodoro Vivo**. Leia este documento inteiro antes de
escrever qualquer código: ele carrega decisões já tomadas e erros já cometidos
que eu não quero repetir.

## 1. O que é o projeto

Um app de pomodoro onde a tela inteira é uma cena viva, vista de perfil. Cada
ciclo de foco concluído faz a cena evoluir. A cena é a recompensa: o argumento
do app é "seu foco constrói este lugar".

Página estática — HTML + CSS + JS puro. Sem build, sem framework, sem
dependência externa. Publicado no GitHub Pages. Entrada: `pomodoro.html`.

## 2. Onde está o código

```
D:\Windows\Documentos\Claude\gabrielsvieira01.github.io\pomodoro-vivo
```

**Atenção:** existe uma cópia velha em `D:\Windows\Downloads\git\...`. Foi
descartada. Nunca leia nem edite de lá.

```
pomodoro.html
BRIEFING-ILUSTRACAO.md          <- prompts prontos para encomendar a arte
css/main.css
js/engine/{canvasUtils,svgUtils,loop}.js
js/camera/camera.js
js/world/sceneManager.js
js/components/{index,common,rodaDePedras,chama,barraca}.js
js/themes/acampamento/{background,composition,index}.js
js/demo/harness.js
```

## 3. Decisões já tomadas — não reabrir

1. **O tema é ACAMPAMENTO, e é o único.** Nasceram quatro (recife, acampamento,
   parque, jardim); os outros três foram cancelados. O recife foi construído e
   abandonado porque coral/alga/anêmona são formas orgânicas sobre as quais o
   olho tem expectativa forte, e geração procedural erra o gesto — saiu bambu,
   cápsula de remédio, triângulo com bolinha. Objeto construído (barraca,
   fogueira, lampião) tem lógica estrutural: acertou proporção e ângulo, lê.
   *Não invista em generalidade de temas. A abstração já existe; use, mas não
   gaste esforço nem deixando-a mais genérica nem removendo-a.*
2. **Profundidade é um PLANO CONTÍNUO, não camadas.** A primeira versão tinha
   três faixas de terreno discretas; foram substituídas por um plano de chão
   único. Não reintroduza faixas.
3. **A paisagem existe desde 0%.** Serra, mata e chão são o *lugar*; o
   acampamento é o que se constrói. Em 0% a tela já é uma clareira bonita com
   a roda de pedras esperando ser acesa — não um vazio. No recife, 0% era um
   deserto, e isso matava o app na primeira impressão.
4. **A arte vai virar ilustração autoral, inclusive o terreno.** Ver seção 8.

## 4. Estado atual (funcionando e verificado)

**Cenário procedural:** céu de 24h com 8 paletas interpoladas, estrelas, um
único corpo celeste que faz sol e lua (cor e raio saem da paleta, então ele
esfria e encolhe em vez de trocar de elemento), duas serras por *midpoint
displacement*, mata de profundidade contínua, chão de clareira com sulcos,
grão, manchas, mato e pedras, feixes de sol, poeira, moita oclusora de
primeiro plano.

**Três objetos SVG:** `RodaDePedras` (em duas metades, com a chama entre elas),
`Chama` (línguas chapadas com animação CSS), `Barraca`.

**Fogueira como fonte de luz local** — segundo termo do sombreamento.

Medições da última rodada: custo do quadro **2,5 ms** de mediana (orçamento
33 ms a 30fps), determinismo estável, 117 itens no espalhado.

## 5. A arquitetura que importa

### Modelo de luz (o ativo mais caro do projeto — preserve)

Tabela de paletas por hora. Cada keyframe define céu, cor/força da luz-chave,
ambiente e cor da névoa. **Tudo** em quadro passa por uma função de
sombreamento única, então terreno, objetos e céu escurecem juntos. Foi
construído porque, antes dele, o fundo mudava com a hora e o chão não — e a
cena lia como céu de pôr-do-sol com montanhas em vez de um lugar de verdade.

Dois termos:
- **global** — ambiente + luz-chave direcional (`shadeTerrain`, `strokeLitRim`)
- **local** — a fogueira (`fireLightAt(x, y)`), aditiva, que decai com a
  distância e **decai mais rápido na vertical** porque o fogo está no chão. É
  essa assimetria que dá a assinatura de acampamento à noite.

### O plano de chão (`createPlane` em `background.js`)

A invariante: **o tamanho de um objeto é proporcional a quão abaixo do
horizonte ele está.** Antes, Y e escala eram duas contas independentes e nada
obrigava as duas a concordarem — era essa a causa real da cara de bolo de
camadas, não a estética das faixas.

```
t      = pow(depth, 1.35)              0 = horizonte, 1 = rente à câmera
y      = H(x) + (rodapé - H(x)) * t    H = curva do horizonte da clareira
escala = 0.16 + 0.84 * t               <<< mesmo t
```

`depth 0.62` é onde a escala vale 1.0 (tamanho natural do componente). O piso
de 0.16 é trapaça deliberada: em perspectiva exata, objeto no horizonte teria
tamanho zero.

API: `plane.tFor/groundYAt/scaleAt/yAtT/horizonYAt`, e os atalhos
`groundSurfaceYf(x, depth)`, `planeTFor(depth)`, `planeScaleFor(depth)`.

### Contrato de componente

```js
PMV.Components.Barraca = { create: function (svgRoot, opts) { … return built; } };
```

`opts`: `seed, scale, refUnit, sceneHeight, depth, variant, palette, fire`.
`built` vem de `PMV.Components.Common.build()` e tem
`{ group, inner, meta, paint, paintEmissive, applyLight }`.

Regras rígidas:
- **Origem (0,0) = ponto onde o objeto encosta no chão.** Geometria cresce
  para Y **negativo**.
- O componente **não** mexe no `transform` de `built.group` — esse slot é do
  `placeAtPivot`. Geometria vai em `built.inner` ou abaixo.
- Toda cor passa por `built.paint(el, 'fill'|'stroke', hex)`. Coisas que
  *emitem* luz (chama, vidro de lampião) usam `built.paintEmissive()`.
  **Nunca** escreva `fill` direto num elemento.

### Crescimento e composição

`--pmv-growth` (0→1) multiplica a escala final, com transição CSS. Cada slot
tem `threshold` (quando começa) e `growSpan` (quanto de progresso leva).

**Objeto construído APARECE, não incha** — `growSpan` curto (~0.04). Quem faz
a chegada ser suave é a transição CSS de 1600ms. A chama é a exceção
proposital: `growSpan` 0.95, porque ela é o mostrador de quanto já foi feito.

`composition.js` tem o plano autoral de slots e a tabela de progressão inteira,
com os itens ainda não construídos **reservados** (o tema pula componente que
não existe, nada quebra).

| Progresso | O que aparece | |
|---|---|---|
| 0.00 | roda de pedras | ✅ |
| 0.05 | primeira chama | ✅ |
| 0.11 | tronco caído (banco) | ⬜ |
| 0.18 | barraca | ✅ |
| 0.25 | mochila | ⬜ |
| 0.32 | lampião num poste | ⬜ |
| 0.39 | tripé de cozinha com panela | ⬜ |
| 0.46 | pilha de lenha | ⬜ |
| 0.54 | segunda cadeira / toco | ⬜ |
| 0.62 | varal de bandeirinhas | ⬜ |
| 0.70 | segunda barraca, menor | ⬜ |
| 0.78 | cordão de luzinhas | ⬜ |
| 0.86 | rede | ⬜ |
| 0.94 | canoa | ⬜ |
| 1.00 | fogueira no tamanho cheio | ✅ |

## 6. Como verificar — leia antes de tirar screenshot

Não confie em ler o código: a cena roda no navegador e se mede lá. **Duas
armadilhas fazem o screenshot mentir, as duas em silêncio** (o console mostra
o estado novo, a tela mostra o velho). Já custaram uma rodada inteira de
prints falsos.

**1. Cache do `file://`.** Abrir do disco faz o Chrome guardar os `.js` e
ignorar edições, mesmo com reload forçado. **Sirva por HTTP.** Servidor mínimo,
salve fora do projeto e rode com `node`:

```js
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='D:\\Windows\\Documentos\\Claude\\gabrielsvieira01.github.io\\pomodoro-vivo';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((q,s)=>{
  let r=decodeURIComponent(q.url.split('?')[0]); if(r==='/')r='/pomodoro.html';
  const f=path.join(ROOT,path.normalize(r).replace(/^[\\/]+/,''));
  if(!f.startsWith(ROOT))return s.writeHead(403).end();
  fs.readFile(f,(e,b)=>{ if(e)return s.writeHead(404).end();
    s.writeHead(200,{'Content-Type':(T[path.extname(f)]||'application/octet-stream')+'; charset=utf-8',
      'Cache-Control':'no-store'}); s.end(b); });
}).listen(4173,()=>console.log('http://localhost:4173'));
```

**2. O laço para em aba escondida.** `SceneManager` chama `loop.stop()` quando
`document.hidden` — economia de bateria proposital (um pomodoro passa os 25
minutos numa aba de fundo). Aba de painel de preview conta como escondida,
então **o canvas congela**. Force quadros à mão antes de capturar:

```js
for (var i = 0; i < 40; i++) PMV.debug.scene._tick(1/30);
```

### Receitas que funcionam

```js
PMV.debug.theme.setTimeOverrideHour(22)   // null volta ao relógio real
PMV.debug.scene.onFocusComplete(1)        // pular pro fim do progresso

// invariante do plano: escala tem que crescer junto com (y - horizonte)
var pl = PMV.debug.theme.background.plane;
[0.1,0.3,0.62,0.9].map(d => [pl.groundYAt(400,d), pl.scaleAt(d)])

// determinismo: dois resizes do MESMO tamanho têm que dar a mesma cena
th.resize(w,h); var a=snapshot(); th.resize(w,h); var b=snapshot(); a===b

// custo de quadro: medir MEDIANA e p95, nunca a média — a média é envenenada
// por um stall de compositor de 1,4s que não é custo do app
```

Tire screenshot em **5h, 8h, 13h, 19h e 22h**, em 0% e 100%. Critério: o chão e
os objetos mudam de valor junto com o céu, e às 22h **nada em quadro lê como
iluminado a não ser o que a fogueira alcança**.

## 7. Armadilhas conhecidas — não reintroduza

**De arquitetura:**
1. **Pivô de crescimento.** Não use as propriedades CSS individuais
   (`scale`/`rotate`/`translate`) com `transform-box: view-box` — a origem vira
   o (0,0) do viewBox, ou seja o canto da tela, e o objeto voa do canto ao
   crescer. Escreva a transform completa na propriedade `transform`, na ordem
   `translate() rotate() scale()`.
2. **Determinismo no resize.** Não leia o rng compartilhado durante
   reconstrução de geometria: cada peça deriva a própria seed fixa e instancia
   um `mulberry32` local. Sem isso, dois resizes do mesmo tamanho reembaralham
   a cena inteira.
3. **Nunca use SMIL (`<animateTransform>`).** 205 animações SMIL derrubaram a
   cena a ~5fps num navegador real. Toda animação é CSS, e os grupos animados
   precisam ter o pivô no próprio (0,0) local.
4. **Cor fixa em `rgba()` que não passa pelo modelo de luz** continua brilhando
   à noite. Aconteceu com a textura das rochas do recife. É a razão de toda a
   regra de cor chapada no briefing de ilustração.
5. **Gradiente vertical dentro de `fillRect` estreito** deixa um retângulo de
   bordas duras visível. Use radial cobrindo o canvas todo.
6. **Objeto no `prototype` que fecha sobre a cena.** O plano precisou virar
   fábrica por instância — no prototype, todas as cenas dividiriam o mesmo
   objeto.

**De desenho (custaram rodadas):**
- **Conífera não é triângulo**, mas o envelope GERAL dela é. O que tira a cara
  de triângulo é o serrilhado por cima — e a reentrância entre galhos tem que
  ser **rasa** (~70% da largura do galho). Reentrância funda vira pilha de
  losangos.
- **Folhosa não é um blob**, e também não é um anel de bolhas iguais — isso é
  desenho de nuvem de quadrinhos. Precisa de uma massa dominante com satélites
  de tamanhos bem diferentes. E **só funciona na meia distância**: perto vira
  moita gigante, longe vira pirulito (bola num palito). Nas duas pontas, use
  conífera.
- **Tronco só acima de ~26px.** Abaixo disso é um risco de 1px sob uma massa
  redonda, que é literalmente o desenho de um pirulito.
- **Barraca sem tirantes e sem aba de porta é só um triângulo.** E linha reta
  denuncia erro de proporção de um jeito que forma orgânica não denuncia —
  canadense é mais larga que alta, com abas abrindo na base.
- **Fogo:** a ponta é a parte mais FRIA e vermelha, o núcleo junto da lenha é o
  mais claro. Muita ilustração inverte e vira plástico derretido.
- **A cor mais clara do chão não pode ficar junto da névoa mais forte** — as
  duas somadas davam uma faixa pálida atravessando o meio do quadro que lia
  como lâmina d'água.
- **Perspectiva aérea faz o distante DESBOTAR, não DESAPARECER.** Se a peça não
  tem valor sobrando pra perder, ela some — foi o que aconteceu com a serra ao
  meio-dia na primeira tentativa.
- **Evite simetria perfeita** em tudo.

## 8. O que vem agora — rodada 3

Decidi que a arte vai virar **ilustração autoral, inclusive o terreno**. O plano
de chão foi construído justamente como a costura disso: ele separa

- **o modelo** — curva de horizonte + expoente de perspectiva. Leve,
  consultável, reflui por proporção de tela. Responde onde a peça encosta e que
  tamanho tem ali.
- **a pintura** — o que preenche do horizonte para baixo. Hoje procedural,
  amanhã ilustrada, desenhada **em cima da curva declarada**.

**`BRIEFING-ILUSTRACAO.md` já tem os prompts prontos** (contrato + 3 prompts:
objetos, vegetação, terreno). Leia antes de encomendar ou integrar qualquer
coisa.

O trabalho de código da rodada 3 é o **importador**: percorrer o SVG recebido,
recolher cada `fill`/`stroke` e reinscrever todos por `built.paint()` (ou
`paintEmissive()` para o que emite luz), descartando o `<svg>` externo e
enxertando os filhos em `built.inner`. É a regra de cor chapada que torna isso
possível: sem um hex único por forma, não há o que reinscrever, e a peça sai do
modelo de luz.

### Pendências conhecidas

- **Luz da fogueira é um valor por objeto**, calculado da origem dele. A face da
  barraca virada pro fogo não fica mais clara que a de trás. Dá pra resolver
  com um termo por elemento.
- `PROMPT-REINICIO.md` está obsoleto (ver topo deste arquivo).

## 9. Como quero trabalhar

**Rodadas curtas com screenshot**, não entrega grande. Mostre a cena renderizada
e me pergunte antes de seguir empilhando objetos.

O erro mais caro deste projeto foi eu não conseguir julgar minha própria saída
visual: eu achava que estava lendo como coral e não estava. Prefiro ver e
decidir a cada passo.
