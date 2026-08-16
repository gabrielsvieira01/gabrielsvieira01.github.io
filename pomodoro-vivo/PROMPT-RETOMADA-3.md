# Pomodoro Vivo — retomada (rodada 5)

> Cole este arquivo inteiro como primeira mensagem de um chat novo.
>
> Substitui as versões anteriores. Se alguma reaparecer, apague — dois
> documentos de retomada competindo é armadilha garantida.

---

Estou retomando o **Pomodoro Vivo**. Leia este documento inteiro antes de
escrever qualquer código: ele carrega decisões já tomadas e erros já cometidos
que eu não quero repetir.

## 1. O que é o projeto

Um app de pomodoro onde a tela inteira é uma cena viva, vista de perfil. Cada
ciclo de foco **entrega uma peça** ao usuário, que escolhe onde ela fica.
Depois de confirmar, a peça faz parte do lugar e não se move mais. O argumento
do app é "seu foco constrói este lugar" — e isso é mecânica, não metáfora.

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
BRIEFING-ILUSTRACAO.md            <- o contrato que a arte tem de obedecer
arte/*.svg                        <- 15 peças do acampamento (originais)
arte/cenario/*.svg                <- 20 peças de vegetação, pedra, sol e lua
css/main.css
js/engine/{canvasUtils,light,svgUtils,svgImport,svgPaths,loop}.js
js/camera/camera.js
js/world/{inventory,placement,sceneManager}.js
js/components/{index,common,importados}.js
js/assets/acampamento/{pecas,cenario}.js     <- GERADOS de arte/
js/themes/acampamento/{background,composition,index}.js
js/demo/harness.js
```

`pecas.js` e `cenario.js` são **gerados** a partir de `arte/`. Para editar uma
peça, edite o `.svg` e regenere — editar a string faz o original e o que roda
divergirem.

## 3. Decisões já tomadas — não reabrir

1. **O tema é ACAMPAMENTO, e é o único.** Nasceram quatro; os outros três
   foram cancelados. O recife foi abandonado porque coral/alga são formas
   orgânicas sobre as quais o olho tem expectativa forte, e geração procedural
   erra o gesto. *Não invista em generalidade de temas.*
2. **Profundidade é um PLANO CONTÍNUO, não camadas de terreno.** Nunca
   reintroduza faixas de terreno discretas. (A pilha de camadas da seção 5 é
   outra coisa: é ordem de composição, não geometria.)
3. **A paisagem existe desde 0%.** Serra, mata, gramado e lago são o *lugar*;
   o acampamento é o que se constrói. Em 0% a tela já é uma clareira bonita.
4. **A arte é ilustração autoral, não procedural.** Só a serra, a linha de
   mata do fundo e a curva de horizonte continuam procedurais (é o Prompt C do
   briefing, nunca encomendado).
5. **UM modelo de luz, uma função.** `Light.shade`. Isto foi violado e
   restaurado três vezes; ver seção 5 e a armadilha 9.
6. **Colocar é definitivo.** O usuário posiciona à vontade e confirma; depois
   disso a peça não se mexe. Foi escolha explícita de design.
7. **A fogueira é fixa.** Roda de pedras, chama e o que estiver em volta são a
   âncora: fonte de luz, ponto focal e a profundidade 0.62 onde a escala vale
   1.0. Não vão pra bandeja, não se arrastam.
8. **Escala NUNCA é livre.** Ela sai da profundidade.

## 4. Estado atual (funcionando e verificado)

**Cenário:** céu de 24h com 8 paletas interpoladas, estrelas, **sol e lua em
órbita**, duas serras por *midpoint displacement*, mata de profundidade
contínua, chão de gramado, lago na borda esquerda, feixes de sol, poeira,
moita oclusora de primeiro plano.

**20 peças de vegetação ilustradas** e **15 peças do acampamento ilustradas**,
todas importadas do SVG.

**Três fontes de luz local:** fogueira (alcance 0.62, teto 0.62), lampião
(0.24 / 0.20) e cordão de luzinhas (0.32 / 0.16).

**O acampamento é montado pelo usuário:** inventário persistido, bandeja,
arrasto com encaixe no chão ao vivo, girar, espelhar, teclado, toque.

Entregue na rodada 4, tudo verificado:

- **névoa por horário** — `fogDensity` virou chave de paleta;
- **serra** — a bruma deixou de estar assada na cor base;
- **órbita do sol e da lua** — posição e força saem da hora, e a direção da
  luz-chave sai do corpo;
- **pilha de faixas** — matou a pendência da repartição binária;
- **termo de face** nas peças do acampamento;
- **sombra projetada no chão**;
- **luz local dentro da iluminação**, não somada depois.

Custo de quadro em página recém-carregada: **7–11 ms de mediana** contra
orçamento de 33 ms a 30fps. Determinismo verificado pelo medidor da seção 6.

> As medições de tempo desta máquina **derivam muito** entre execuções — o
> mesmo código já mediu 5,2 e 8,8 ms. Confie na ordem de grandeza, não na
> comparação fina, e sempre meça em página recém-carregada.

## 5. A arquitetura que importa

### Modelo de luz — `js/engine/light.js`

**Uma função, `Light.shade(hex, palette, depth, local, peso)`, usada pelo
cenário E pelos objetos.** Ordem dos termos:

```
iluminação = ambiente (neutro) + luz local (colorida), POR CANAL
cor        = albedo × iluminação
           → deriva noturna (Purkinje), recuada onde há luz local
           → névoa por profundidade
```

**A luz local entra na ILUMINAÇÃO, não como retoque depois dela.** Ela já foi
um termo aditivo aplicado no fim, e isso tinha duas consequências:

1. Somar o mesmo `(255,152,56)·a` em toda superfície faz cores diferentes
   **convergirem** — verde escuro e marrom viravam quase o mesmo alaranjado.
2. Pior: quando a soma chegava, o ambiente já tinha destruído a cor. Às 22h o
   ambiente vale 0.16, então uma folha `#3f6b34` já era `#161d27` — sem verde
   nenhum — *antes* de o fogo tocar nela.

Separação de matiz entre superfícies iluminadas, antes e depois: folha contra
madeira **0,101 → 0,308**. O dia é bit a bit o que era: com ganho zero os três
canais valem `palette.ambient`.

A **deriva de Purkinje** recua onde a luz local alcança. Ela existe porque no
escuro o olho perde cor — mas uma superfície banhada pelo fogo não está no
escuro.

A luz local é medida **ponto a ponto**, e o tema traduz o centro de cada
elemento em ponto do mundo (`_amostradorDeLuz`). Um valor único por objeto
dava ao ápice de uma barraca de 3 m a luz que existe rente à grama.

### Face — `Common.normalDe` em `js/components/common.js`

O nome do grupo na ilustração diz para ONDE a superfície aponta, e isso era
jogado fora: toda parte de toda peça recebia peso 0.9. As peças usam
`-frente`, `-tras`, `-lado`, `-esquerda`, `-direita`, `-topo` — vocabulário
melhor que o `-luz`/`-sombra` do cenário, porque aquele é relativo ao SOL e à
noite quem manda é o fogo.

O vetor da luz é 3D: x e y da direção na tela, **z da diferença de
profundidade** entre a fonte e a peça. Sem o z, frente e costas empatam.

A face entra **multiplicando o `peso`** — que já significava "quanto desta
superfície a luz alcança". Nenhuma assinatura muda.

### A pilha de camadas — `js/world/sceneManager.js`

A cena não é "canvas, SVG, canvas". É uma pilha alternada:

```
canvas de fundo    céu, serra, chão, lago, brilho local, névoa de horizonte
  canvas faixa 0   espalhado com profundidade na faixa 0
  svg    faixa 0   peças com profundidade na faixa 0
  ... (4 faixas sobre [0.33, 0.72], que é onde peça pode ser colocada)
canvas de frente   moita, brasas, poeira, vinheta
```

**Isto matou a repartição binária.** Antes, um tufo estava OU atrás de todas
as peças OU na frente de todas. Hoje 21% dos itens do espalhado caem numa
faixa do meio — cada um deles era forçado pra trás antes.

Fatiar só o miolo é o que segura a pilha em 10 camadas. E ficou **mais barato**
que a versão de três: o brilho passou pra baixo do espalhado (era contagem
dupla) e o roteamento por faixa substituiu um laço de itens × oclusores.

Arrasto: a peça na mão vai pra camada do TOPO e só volta pra faixa certa ao
ser solta. Migrar a cada `pointermove` seria trabalho de DOM pra corrigir uma
oclusão que ninguém vê com a peça na mão.

### O plano de chão (`createPlane` em `background.js`)

A invariante: **o tamanho de um objeto é proporcional a quão abaixo do
horizonte ele está.**

```
t      = pow(depth, 1.35)              0 = horizonte, 1 = rente à câmera
y      = H(x) + (rodapé - H(x)) * t    H = curva do horizonte da clareira
escala = 0.16 + 0.84 * t               <<< mesmo t, normalizada em depth 0.62
```

**E ele é inversível de forma exata** — `background.depthAtY(x, y)`, erro de
ida e volta 2×10⁻¹⁶. É essa inversa que torna possível o arrasto, e é dela que
sai a componente z da face.

### Órbita — `ORBIT` em `background.js`

Sol e lua têm posição e força saindo da HORA. As janelas se cruzam: às 5h30 o
sol nasce à esquerda com a lua se pondo à direita. O corpo é desenhado ANTES
das serras, então se põe atrás da montanha sem nenhum recorte.

**`_lightDirX` sai do corpo, não de sorteio.** Antes a direção da luz vinha da
inclinação dos feixes de sol, sorteada no layout — dois valores independentes
que nunca se contradiziam só porque nada se movia. Os feixes foram
re-ancorados: cada um guarda a variação própria e a âncora passou a ser o sol.

Prova de que não é decoração — duas encostas, quanto de luz-chave cada uma
recebe: às 8h oeste 0,825 / leste 0,565; às 13h empatam (sol a pino); às 19h
inverte para 0,517 / 0,856.

### Dois campos de luz, e isso é DE PROPÓSITO

Quem lê `pointLight` são as PEÇAS e o espalhado. O chão recebe luz por outro
caminho: uma poça pintada em `_drawFireGlow` / `_drawLampGlow`, com geometria
própria.

**Isso parece duplicação e já foi "consertado" uma vez. A cena piorou e foi
desfeito.** Ver a armadilha 9.

### Estado do jogador — `js/world/inventory.js`

Estado puro, sem DOM. O **catálogo** (`CAMP_PLAN` em `composition.js`) diz o
que existe e onde fica por padrão — direção de arte, versionada. O
**inventário** diz o que este usuário ganhou e o que fez com isso — dado dele,
no `localStorage` (`pmv-acampamento-v1`).

Guarda `xf` e `depth`, **nunca pixels** — é o que faz a cena sobreviver a
resize e a abrir no celular depois do desktop. `provisoria: true` marca a peça
em colocação; ao recarregar, provisória volta pra bandeja.

### Colocação — `js/world/placement.js`

Pointer Events com `setPointerCapture`. **Não existe modo de edição:** só a
peça em colocação carrega `data-pmv-movel`. A escuta é no **palco**
(`#pmv-stage`), não numa camada — as peças estão espalhadas por várias raízes
SVG e uma sozinha não enxerga as outras.

`moverPeca` é o caminho rápido; `soltarPeca` é o caro (reordena, republica
oclusores, repinta, grava).

### Crescimento

- **`.pmv-appear`** — padrão. O progresso governa só a OPACIDADE.
- **`.pmv-growable`** — só a chama. A escala acompanha o progresso.

Canoa que incha é o mesmo erro que planta que aparece pronta.

## 6. Como verificar — leia antes de tirar screenshot

Não confie em ler o código: a cena roda no navegador e se mede lá. **E não
confie no medidor sem validá-lo — errei quatro instrumentos numa rodada só.**

**1. Cache do `file://`.** Sirva por HTTP. Servidor mínimo, salvo fora do
projeto, rodado com `node`; o mesmo processo grava as capturas:

```js
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT='D:\\Windows\\Documentos\\Claude\\gabrielsvieira01.github.io\\pomodoro-vivo';
const SHOTS='...\\shots';   // pasta fora do projeto
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer((q,s)=>{
  if(q.method==='POST'&&q.url.startsWith('/__shot')){
    const n=(new URL(q.url,'http://x').searchParams.get('name')||'shot').replace(/[^\w.-]/g,'_');
    const c=[]; q.on('data',d=>c.push(d));
    q.on('end',()=>{ fs.writeFileSync(path.join(SHOTS,n+'.png'),Buffer.concat(c)); s.writeHead(200).end('ok'); });
    return;
  }
  let r=decodeURIComponent(q.url.split('?')[0]); if(r==='/')r='/pomodoro.html';
  const f=path.join(ROOT,path.normalize(r).replace(/^[\\/]+/,''));
  if(!f.startsWith(ROOT))return s.writeHead(403).end();
  fs.readFile(f,(e,b)=>{ if(e)return s.writeHead(404).end();
    s.writeHead(200,{'Content-Type':(T[path.extname(f)]||'application/octet-stream')+'; charset=utf-8',
      'Cache-Control':'no-store'}); s.end(b); });
}).listen(4173);
```

**2. O laço para em aba escondida**, e a aba de preview conta como escondida.
Force quadros: `for (var i=0;i<40;i++) PMV.debug.scene._tick(1/30);`

**3. A aba pode não ter layout** — `window.innerWidth` volta 0 e a cena nasce
de tamanho zero. Fixe o tamanho em TODAS as camadas da pilha:

```js
var s=PMV.debug.scene, th=PMV.debug.theme, W=1280, H=720;
Array.prototype.forEach.call(document.querySelectorAll('#pmv-stage > *'), function(el){
  if(el.tagName.toLowerCase()==='canvas'){ el.width=W; el.height=H;
    el.getContext('2d').setTransform(1,0,0,1,0,0); }
  else el.setAttribute('viewBox','0 0 '+W+' '+H);
});
s._width=W; s._height=H;
th.rng=PMV.Engine.CanvasUtils.mulberry32(20260815);   // seed fixa pra comparar
th.background._layout=null; th.background._fgSpriteKey=null;
th.resize(W,H);
```

**4. `_updateFlicker` chama `_updateFireSource` POR DENTRO.** Congelar o
flicker fixando `_fireFlicker` à mão deixa `bg.fire.intensity` em **zero** — a
fogueira apaga e ninguém percebe. Isto invalidou várias comparações A/B antes
de ser descoberto. O jeito certo:

```js
th._updateFlicker = function(){
  this._flickerT = 1000; this._fireFlicker = 0.9; this._updateFireSource();
};
```

### Capturar a cena (pilha de 10 camadas)

A página compõe as camadas na ORDEM DO DOCUMENTO num canvas só e faz POST. O
SVG precisa ir serializado **com o CSS do projeto embutido**, senão as
transforms de posicionamento (que vivem em `.pmv-appear`) não existem na
imagem e tudo empilha na origem.

```js
var css = await fetch('css/main.css').then(r=>r.text());
function compor(W,H){
  var camadas=[].slice.call(document.querySelectorAll('#pmv-stage > *'));
  for(var i=0;i<40;i++) PMV.debug.scene._tick(1/30);
  var out=document.createElement('canvas'); out.width=W; out.height=H;
  var o=out.getContext('2d'), pend=[];
  camadas.forEach(function(el,idx){
    if(el.tagName.toLowerCase()==='canvas'){ pend.push({i:idx,tipo:'canvas',el:el}); return; }
    var svg=el.cloneNode(true);
    svg.setAttribute('width',W); svg.setAttribute('height',H);
    var sty=document.createElementNS('http://www.w3.org/2000/svg','style');
    sty.textContent=css+'\n.pmv-appear,.pmv-growable{transition:none !important}';
    svg.insertBefore(sty,svg.firstChild);
    pend.push({i:idx,tipo:'svg',url:'data:image/svg+xml;charset=utf-8,'+
      encodeURIComponent(new XMLSerializer().serializeToString(svg))});
  });
  return Promise.all(pend.map(function(p){
    if(p.tipo==='canvas') return Promise.resolve(p);
    return new Promise(function(res,rej){ var img=new Image();
      img.onload=function(){p.img=img;res(p);}; img.onerror=rej; img.src=p.url; });
  })).then(function(pr){ pr.sort(function(a,b){return a.i-b.i;});
    pr.forEach(function(p){ o.drawImage(p.tipo==='canvas'?p.el:p.img,0,0); }); return out; });
}
```

### O medidor de determinismo

**Validado em três etapas**, e as três importam: é estável (execuções seguidas
dão o mesmo veredito), é sensível (pega uma sabotagem de 0,001 px) e volta ao
verde quando a sabotagem sai. Um teste que nunca falha não vale nada.

As duas metades são necessárias: a geometria pega deriva sub-pixel que o pixel
não vê; o quadro pega mudança de sombreamento que não move geometria nenhuma.

```js
window.PMVdet = (function(){
  var CU = PMV.Engine.CanvasUtils;
  function congelar(){
    var th=PMV.debug.theme, orig=th._updateFlicker;
    th._updateFlicker=function(){
      this._flickerT=1000; this._fireFlicker=0.9; this._updateFireSource(); };
    return function(){ th._updateFlicker=orig; };
  }
  function assinar(W,H){
    var s=PMV.debug.scene, bg=PMV.debug.theme.background;
    bg._time=0; bg._embers=[]; bg._emberRng=CU.mulberry32(0x5bd1);
    s._tick(0);
    var d=s.ctx.getImageData(0,0,W,H).data, h1=5381, h2=52711;
    // Esparsa (ler o quadro inteiro trava a thread) e QUANTIZADA: gradiente
    // de canvas varia ±1 por arredondamento, e exigir igualdade exata acusa
    // isso como quebra. Rigor a mais também é medidor ruim.
    for(var p=0;p<d.length;p+=53*4){
      h1=(h1*33+(d[p]>>2))>>>0; h2=(h2*31+((d[p+1]>>2)+(d[p+2]>>2)))>>>0; }
    return h1+':'+h2;
  }
  function geometria(){
    var bg=PMV.debug.theme.background, th=PMV.debug.theme;
    function n(v){ return (typeof v==='number')? v.toFixed(4):String(v); }
    return {
      horizonte:(bg._horizonTracePts||[]).map(function(p){return n(p.x)+','+n(p.y);}).join(';'),
      serras:Object.keys(bg._ridges||{}).map(function(k){
        return k+':'+bg._ridges[k].map(function(p){return n(p.x)+','+n(p.y);}).join(';');}).join('|'),
      espalhado:(bg._scatter||[]).map(function(it){
        return [n(it.x),n(it.t),it.sprite,n(it.escala),it.band,n(it.tone),it.flip].join(',');}).join(';'),
      grao:(bg._soilSpeckles||[]).map(function(p){return n(p.x)+','+n(p.y);}).join(';'),
      manchas:(bg._soilPatches||[]).map(function(p){return n(p.x)+','+n(p.y);}).join(';'),
      feixes:(bg._shafts||[]).map(function(f){return n(f.xf)+','+n(f.tiltDeg);}).join(';'),
      lago:JSON.stringify(bg._lake||null),
      oclusores:(bg._occluders||[]).map(function(o){
        return [n(o.x),n(o.halfWidth),n(o.altura),n(o.groundY),n(o.t)].join(',');}).join(';'),
      pecas:(th._placedGroups||[]).map(function(e){
        return [e.inst.slotId,n(e.inst.x),n(e.inst.y),n(e.inst.depth),e.inst.espelhada?1:0].join(',');}).join(';')
    };
  }
  function dif(a,b){ return Object.keys(a).filter(function(k){ return a[k]!==b[k]; }); }
  return function(hora, W, H){
    W=W||1280; H=H||720;
    var th=PMV.debug.theme, desc=congelar();
    try{
      th.setTimeOverrideHour(hora);
      // AQUECIMENTO: o invariante é "a cena ASSENTA no mesmo estado". O
      // primeiro render depois de montar a cena não é esse estado - sem isto
      // o medidor acusa quebra na primeira execução e passa nas seguintes.
      th.resize(W,H); assinar(W,H);
      th.resize(W,H); var g1=geometria(), a1=assinar(W,H);
      th.resize(W,H); var g2=geometria(), a2=assinar(W,H);
      th.resize(Math.round(W*0.7), Math.round(H*0.7));
      th.resize(W,H); var g3=geometria(), a3=assinar(W,H);
      var r={ hora:hora,
        doisResizes:{ geometria:dif(g1,g2), quadro:a1===a2 },
        idaEVolta:{ geometria:dif(g1,g3), quadro:a1===a3 } };
      r.passou = !r.doisResizes.geometria.length && !r.idaEVolta.geometria.length
                 && r.doisResizes.quadro && r.idaEVolta.quadro;
      return r;
    } finally { desc(); }
  };
})();

PMVdet(22)   // { passou, doisResizes, idaEVolta }
```

Roda uma hora por vez — quatro horas numa chamada só trava a thread principal.

### Receitas

```js
PMV.debug.theme.setTimeOverrideHour(22)   // null volta ao relógio real
PMV.debug.scene.onFocusComplete(1)        // pular pro fim do progresso
PMV.debug.inventory.limpar()              // zerar bandeja e cena

// pôr tudo em cena, confirmado
var inv=PMV.debug.inventory, th=PMV.debug.theme;
inv.bandeja().slice().forEach(function(id){ inv.colocar(id,null); inv.confirmar(id); });
th._rebuildLayer();

// invariante do plano: escala cresce junto com (y - horizonte)
var pl = PMV.debug.theme.background.plane;
[0.1,0.3,0.62,0.9].map(d => [pl.groundYAt(400,d), pl.scaleAt(d)])

// ida e volta do plano (o alicerce do arrasto)
var bg=PMV.debug.theme.background;
bg.depthAtY(400, bg.groundSurfaceYf(400, 0.5))   // tem que devolver 0.5

// custo de quadro: MEDIANA e p95, nunca a média - ela é envenenada por
// stalls de compositor que não são custo do app. E meça em página
// recém-carregada; esta máquina deriva muito ao longo de uma sessão.
```

Tire screenshot em **5h, 8h, 13h, 19h e 22h**. Critério: chão e objetos mudam
de valor junto com o céu, e às 22h **nada em quadro lê como iluminado a não
ser o que a fogueira e as luminárias alcançam**.

## 7. Armadilhas conhecidas — não reintroduza

**De arquitetura:**

1. **Pivô de crescimento.** Não use as propriedades CSS individuais
   (`scale`/`rotate`) com `transform-box: view-box` — a origem vira o canto da
   tela e o objeto voa. Escreva a transform completa na propriedade
   `transform`, na ordem `translate() rotate() scale()`.
2. **Determinismo no resize.** Não leia o rng compartilhado durante
   reconstrução de geometria: cada peça deriva a própria seed. E quando
   adicionar uma decisão nova, **consuma o rng do mesmo jeito mesmo quando
   descartar o resultado** — foi assim que a órbita substituiu os sorteios de
   `bodyXf`/`bodyYf` sem reembaralhar a cena.
3. **Nunca use SMIL.** 205 animações SMIL derrubaram a cena a ~5fps. Toda
   animação é CSS, e os grupos animados precisam ter o pivô no próprio (0,0).
4. **Cor fixa em `rgba()` que não passa pelo modelo de luz** continua
   brilhando à noite. Vale também pro preto implícito: forma SVG sem `fill`
   declarado é preta por padrão — o importador trata isso.
5. **Ordem de desenho é a ordem dos filhos da camada** — e agora também QUAL
   camada. Se algo mudar a profundidade de uma peça, reordene E rerroteie.
6. **`built._depth` alimenta a névoa.** Mover uma peça sem reatribuí-lo deixa
   ela no lugar certo, do tamanho certo, com a cor errada.
7. **`getBBox` devolve a caixa em unidades de arte**, ignorando a transform do
   próprio elemento.
8. **Passe TODOS os argumentos pro `placeAtPivot`.** Esquecer `espelhada` fez
   o espelho "voltar sozinho depois de um tempo".
9. **NÃO unifique os dois campos de luz.** `pointLight` (peças e espalhado) e
   a poça pintada (chão) parecem duplicação. Foram unificados uma vez: o chão
   inundou e as peças viraram silhuetas escuras. O motivo é que **Y na tela
   significa coisas diferentes** para os dois — para um objeto é ALTURA, para
   o chão é PROFUNDIDADE (`y = H(x) + (rodapé − H(x))·t`). Uma elipse em tela
   não descreve as duas grandezas. Fazer o chão ler o campo do objeto exigiria
   converter Y em distância pelo plano primeiro — modelo novo, não conserto.
10. **`<clipPath>` só aceita FORMAS, não `<g>`.** Grupo dentro dele é ignorado
    em silêncio, o recorte fica vazio, e referência vazia faz o elemento **não
    ser renderizado**. Como a arte vem em grupos nomeados, qualquer silhueta
    de recorte precisa ser achatada com a transform assada por matriz.
11. **Nada que cresça pode morar dentro de `built.inner`.** `_publishOccluders`
    mede `inner.getBBox()`, e os oclusores alimentam o roteamento de faixas do
    espalhado inteiro. Uma sobreposição maior que a peça corrompia a cena — e
    o sintoma aparecia **às 13h**, longe da causa.
12. **A luz local tem que passar DENTRO de `Light.shade`.** O espalhado a
    somava por fora, depois do sombreamento. Quando o modelo mudou, o
    acampamento passou a receber luz como iluminação e o mato continuou
    recebendo tinta laranja por cima — dois modelos de novo, pela porta dos
    fundos. Se `addHexLight` aparecer fora da luz-chave direcional, é bug.

**De medição** (esta seção existe porque quatro instrumentos mentiram numa
rodada só):

- **`_updateFlicker` chama `_updateFireSource`.** Congelar o flicker sem
  chamá-lo apaga a fogueira. Várias comparações A/B rodaram com a fogueira
  apagada e levaram a conclusões erradas.
- **Assinatura de quadro acumula estado** se o helper avançar relógio ou rng
  entre chamadas. Compare quadros, não sequências de chamadas.
- **Igualdade exata de pixel é rigor demais** — gradiente de canvas varia ±1.
- **O primeiro render depois de montar a cena não é o estado assentado.**
  Aqueça antes de tirar a linha de base.
- **Tempo desta máquina deriva** ao longo de uma sessão. Meça em página
  recém-carregada.

**De desenho (custaram rodadas):**

- **Conífera não é triângulo**, mas o envelope geral dela é. O que tira a cara
  de triângulo é o serrilhado, com reentrância **rasa** entre galhos.
- **Folhosa não é um blob** nem um anel de bolhas iguais. Massa dominante com
  satélites de tamanhos bem diferentes.
- **Barraca sem tirantes e sem aba de porta é só um triângulo.**
- **Fogo:** a ponta é a parte mais FRIA e vermelha; o núcleo é o mais claro.
- **A cor mais clara do chão não pode ficar junto da névoa mais forte.**
- **Perspectiva aérea faz o distante DESBOTAR, não DESAPARECER.**
- **Não asse a bruma na cor base.** A serra usava ardósias escuros porque a
  névoa era forte demais; corrigida a névoa, sobrou só a metade assada e a
  serra virou a massa mais pesada de um quadro de meio-dia.
- **Lago sem margem vira faixa.**
- **Sol e lua trocam pela HORA, não pelo ambiente** — às 5h e às 19h o
  ambiente vale quase o mesmo, mas numa o sol nasce e na outra se põe.
- **Evite simetria perfeita**, exceto onde a regra é deliberada.

## 8. Pendências conhecidas

Em ordem de quanto me incomodam:

1. **O termo de face não foi verificado a olho.** As imagens A/B que eu usei
   estavam com a fogueira apagada (armadilha do `_updateFlicker`). O
   mecanismo está medido e correto; falta julgar a imagem.
2. **A arte declara face em só 48 de 168 elementos.** A barraca — a maior
   superfície da cena — nomeia `cupula-frente` e `empena-frente` e **não tem
   contraparte de trás**, então não há contra o que contrastar. `cordão` 0/18,
   `varal` 0/16, `rede` 0/14, `lampião` 0/11, `canoa` 0/11. Destravar o termo
   de face é rodada de ILUSTRAÇÃO, não de código.
3. **Peça não faz sombra em peça.** Foi construído e **revertido** com motivo
   medido: o custo de quadro dobrava, inclusive de dia com zero sombras
   desenhadas (um `<g clip-path>` é composto todo quadro mesmo vazio), em
   troca de efeito visual marginal. A projeção cônica funciona — sombra de A
   sobre o plano de B é a silhueta de A escalada em torno da fonte por
   `dist(L,B)/dist(L,A)` — mas não vale o preço na forma em que foi feita.
4. **A roda de pedras é quase invisível em 0%.** O documento pede que em 0% a
   tela já seja uma clareira com a roda esperando ser acesa; hoje ela lê mais
   como uma mancha.
5. **Nada valida a colocação semanticamente.** As travas impedem o
   fisicamente errado, não o semanticamente errado — nada impede a canoa longe
   do lago.
6. **`js/demo/harness.js` já não é uma vitrine.** Virou a interface de
   verdade do recurso. O nome e a pasta `demo/` mentem sobre o que ele é.
7. **O Prompt C do briefing nunca foi encomendado**: serra, linha de mata e a
   curva de horizonte continuam procedurais.
8. **A peça 15 (fogueira grande) só é usada pela lenha.**

## 9. Como quero trabalhar

**Rodadas curtas com screenshot**, não entrega grande. Mostre a cena
renderizada e me pergunte antes de seguir empilhando coisa.

O erro mais caro deste projeto foi eu não conseguir julgar minha própria saída
visual: eu achava que estava lendo como coral e não estava. Prefiro ver e
decidir a cada passo.

Quando eu apontar que algo "está estranho" na cena, **procure a causa
estrutural antes de ajustar constante**. As últimas vezes que fiz isso, a
causa era duplicação, um valor medido no lugar errado, ou um termo aplicado na
ordem errada — nunca o número em si.

**E valide o instrumento antes de confiar nele.** Uma rodada inteira produziu
conclusões erradas porque quatro medições diferentes mentiram em silêncio. Um
medidor tem que ser estável entre execuções, sensível a uma quebra injetada de
propósito, e voltar ao verde quando ela sai.
