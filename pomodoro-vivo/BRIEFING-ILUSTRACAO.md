# Briefing de ilustração — Pomodoro Vivo (acampamento)

Prompts para encomendar a arte vetorial do projeto. São escritos para devolver
**SVG que o código consegue importar sem retrabalho**.

O que faz a arte ser reaproveitável não é o estilo — é obedecer ao contrato da
seção 1. Arte linda que não obedece ao contrato **não entra**: ou ela ignora o
modelo de luz (e continua brilhando às 22h), ou não sabe onde encostar no chão.

## Como usar

| Prompt | O que encomenda | Quando |
|---|---|---|
| **A** | Os 15 objetos do acampamento | agora — é o que falta |
| **B** | Estampas de vegetação (pinheiro, folhosa, moita, tufo) | quando a mata procedural incomodar |
| **C** | Serra e curva de horizonte | por último — é o mais arriscado |

Cole a **seção 1 inteira** antes do prompt escolhido. Ela é o contrato, e é a
parte que não pode ser resumida.

### O que NÃO encomendar

Estas coisas continuam procedurais de propósito, e pedir ilustração delas
quebraria o app:

- **Céu** — é cor pura acionada pelo horário (8 paletas ao longo de 24h). Uma
  ilustração de céu congelaria o relógio, que é metade da graça.
- **Luz da fogueira, halo, brasas, estrelas, névoa** — são *iluminação*, não
  desenho. Vivem no modelo de luz.
- **A cena montada** — nunca peça "uma ilustração do acampamento". A cena é
  composta em tempo real, e cada peça precisa se mover, crescer e acender por
  conta própria. Peça as PEÇAS.

---

## 1. O contrato (colar antes de qualquer prompt)

> Preciso de ilustração vetorial em SVG para um app que compõe a cena em tempo
> real. As peças passam por um modelo de iluminação próprio e são posicionadas
> por código, então o formato importa tanto quanto o desenho. Siga estas regras
> à risca — arte que não as siga não pode ser usada.
>
> **1. Cor chapada, sempre.** Cada forma recebe UM `fill` sólido em hexadecimal.
> Proibido: gradiente, `<defs>`, `<linearGradient>`, `<radialGradient>`,
> `filter`, `rgba()`, `opacity` usada para escurecer, sombra assada, textura,
> máscara. O motivo é concreto: cada `fill` é reescrito em tempo de execução
> pelo modelo de luz, que escurece a peça à noite e a acende com a luz da
> fogueira. Qualquer cor que não seja um hex sólido escapa desse modelo e fica
> brilhando às 22h no meio de uma cena escura.
>
> **2. Volume por FACE, não por sombreado.** Para dar tridimensionalidade, use
> faces separadas com cores diferentes (uma face clara virada pra luz, uma face
> escura virada pra sombra), como um origami. Não use degradê nem meio-tom.
>
> **3. Sem contorno preto.** Silhueta forte resolve. Se precisar separar duas
> massas da mesma cor, use um tom mais escuro da própria cor.
>
> **4. Sistema de coordenadas.** Cada objeto vem no seu próprio SVG, com:
> - a **origem (0,0) no ponto em que o objeto encosta no chão** (o centro da
>   pegada dele, não o canto do desenho);
> - a geometria crescendo para **Y NEGATIVO** (para cima);
> - escala onde **1000 unidades = o lado curto da tela**. Então um objeto de
>   250 unidades de largura ocupa 25% do lado curto. Uso prático: 100 unidades
>   ≈ 1 metro do mundo real.
> - `viewBox` folgado o bastante para caber tudo, ex.: `viewBox="-200 -300 400 320"`.
>
> **5. Sem transform no elemento raiz.** Nada de `transform` no `<svg>` nem no
> `<g>` mais externo — esse slot pertence ao código, que posiciona e escala a
> peça. Transforms em grupos internos podem.
>
> **6. Paleta curta e nomeada.** No máximo 6 cores por objeto. Liste-as no fim
> com um nome semântico cada (`lona-frente`, `lona-lado`, `sombra-interna`,
> `corda`, `madeira`). Reutilize a mesma cor sempre que for o mesmo material —
> cada cor distinta vira um registro no modelo de luz.
>
> **7. Partes nomeadas.** Cada parte que se move, aparece sozinha ou brilha
> sozinha vai num `<g id="...">` próprio, em português e sem acento
> (`aba-porta`, `tirantes`, `chama-lingua-1`). Ordem no documento = ordem de
> desenho, do fundo para a frente.
>
> **8. Nada externo.** Sem imagem embutida, sem fonte, sem CSS com cor, sem
> `<use>`, sem referência a arquivo. Só `<path>`, `<rect>`, `<ellipse>`,
> `<circle>`, `<polygon>` e `<g>`.
>
> **Direção de arte:** vetorial chapado, silhueta forte, dessaturado. A cena é
> uma clareira de mata ao entardecer; os objetos do acampamento são a única
> coisa de cor mais quente no quadro, então nada de neon nem de saturação alta.
>
> **Antes de me entregar, verifique você mesmo:** a string do SVG não contém
> `gradient`, `filter`, `rgba`, `opacity`, `defs` nem `stroke:#000`; a origem
> está na base; a geometria está em Y negativo; há no máximo 6 hex distintos.

---

## 2. Prompt A — os objetos do acampamento

> [colar a seção 1 acima]
>
> Preciso de **15 objetos de um acampamento na mata**, cada um num SVG separado.
> Entregue um por vez, na ordem da tabela, e espere meu OK antes do próximo.
>
> | # | Objeto | Largura × Altura (unidades) | Observações |
> |---|---|---|---|
> | 1 | Roda de pedras de fogueira | 90 × 26 | Vista de perfil e um pouco de cima: a roda é uma ELIPSE achatada, não um círculo. 7 a 9 pedras irregulares. Entregue em DOIS grupos: `pedras-tras` e `pedras-frente` (a chama vai entre os dois). Inclua a cova de terra queimada. |
> | 2 | Chama | 50 × 85 | 3 a 5 línguas chapadas, cada uma num `<g id="chama-lingua-N">` próprio (elas animam separadamente). Três temperaturas: ponta mais vermelha e FRIA, núcleo mais claro junto da lenha — muita ilustração inverte isso e vira plástico derretido. Sem contorno, sem brilho. |
> | 3 | Tronco caído (banco) | 180 × 42 | Deitado. Casca e a face cortada da ponta em cores diferentes. |
> | 4 | Barraca canadense | 250 × 160 | **Mais larga que alta**, abas abrindo na base. Precisa de `aba-porta` (abertura em V com interior escuro, uma metade enrolada e amarrada) e `tirantes` (2-3 cordas até estacas FORA da pegada). Sem esses dois é só um triângulo colorido. Três quartos: empena da frente + água lateral mais escura. |
> | 5 | Mochila encostada | 38 × 62 | Inclinada, como se apoiada. Alças e bolso frontal visíveis. |
> | 6 | Lampião em poste | 30 × 155 | Grupo `vidro` separado — ele acende sozinho. |
> | 7 | Tripé de cozinha com panela | 115 × 125 | Três pernas (a de trás mais escura), panela pendurada por gancho. |
> | 8 | Pilha de lenha | 105 × 55 | Toras empilhadas, faces cortadas viradas pra frente. |
> | 9 | Toco / segunda cadeira | 48 × 46 | Um toco de árvore serve. |
> | 10 | Varal de bandeirinhas | 420 × 70 | Corda em catenária (barriga no meio) com 8-12 triângulos alternando 3 cores. Origem no PONTO ESQUERDO da corda, não no centro. |
> | 11 | Segunda barraca, menor | 200 × 130 | Formato diferente da #4 (cúpula, por exemplo) — repetir o mesmo desenho denuncia. |
> | 12 | Cordão de luzinhas | 420 × 60 | Como a #10, mas com bulbos. Cada bulbo num grupo `luz-N`: eles acendem. |
> | 13 | Rede armada | 230 × 65 | Curva de rede pendurada, com as pontas amarradas. Origem no ponto esquerdo. |
> | 14 | Canoa encostada | 350 × 65 | De lado, meio inclinada, com um remo. |
> | 15 | Fogueira grande | 70 × 120 | Versão maior da #2, mesma estrutura de grupos. |
>
> Comece pelo #4 (a barraca) — é o mais difícil e o que define se o estilo
> funciona. Mostre e espere meu retorno antes de seguir.

---

## 3. Prompt B — estampas de vegetação

> [colar a seção 1 acima]
>
> Preciso de **estampas de vegetação** que o código vai espalhar pela cena em
> escalas e profundidades diferentes. Não é uma paisagem — são peças soltas,
> repetidas dezenas de vezes.
>
> Entregue, cada uma num SVG separado, com origem na base do tronco:
>
> - **4 coníferas distintas**, 300 unidades de altura. Conífera NÃO é um
>   triângulo: são galhos empilhados, cada um saindo do tronco, descendo e
>   afinando até a ponta, formando uma silhueta serrilhada. Faça as 4
>   claramente diferentes entre si (mais larga, mais alta e magra, inclinada,
>   com falha de um lado). Evite simetria perfeita.
> - **3 folhosas distintas**, 260 unidades. Copa NÃO é um blob só: é uma massa
>   principal com 3-5 massas satélites de tamanhos bem diferentes, mais alta
>   que larga. Tronco visível com uma bifurcação.
> - **3 moitas**, 90 unidades. Baixas e largas.
> - **3 tufos de mato**, 40 unidades. Poucas lâminas, saindo de um ponto só.
> - **4 pedras soltas**, 45 unidades. Contorno irregular, uma face de topo mais
>   clara e uma de base mais escura.
>
> Cada uma com no máximo 3 cores. Como serão repetidas muitas vezes, o que
> importa é a **silhueta** — detalhe interno some na escala pequena e só custa
> peso.
>
> Comece pelas 4 coníferas.

---

## 4. Prompt C — serra e horizonte

> [colar a seção 1 acima]
>
> Preciso da **paisagem de fundo**, e ela tem uma exigência incomum: precisa
> funcionar em qualquer proporção de tela, de celular em pé a monitor
> horizontal. Por isso não peço um quadro — peço tiras que o código estica.
>
> Entregue 3 SVGs, todos com `viewBox="0 0 2000 400"` (proporção larga; o código
> estica na horizontal e ancora numa altura):
>
> 1. **Serra distante** — cordilheira, uma silhueta preenchida só. Picos agudos
>    e vales em V, com detalhe fino encaixado no detalhe grosso. Não pode
>    mergulhar até a linha de base nas duas bordas, senão lê como um morro
>    isolado no meio da tela em vez de cordilheira continuando pra fora do
>    quadro. Cor única.
> 2. **Serra próxima** — mesma ideia, mais baixa, perfil um pouco diferente.
>    Cor única, mais escura.
> 3. **Linha de mata** — uma faixa de copas de árvore vista de longe, contínua
>    da borda esquerda à direita, alturas variadas. Cor única. É a parede de
>    floresta que fecha a clareira.
>
> Além disso, e **é a peça mais importante**: a **curva do horizonte da
> clareira** — uma polilinha suave, levemente ondulada, atravessando as 2000
> unidades, oscilando no máximo ±40 unidades em torno da altura média. Entregue
> como um `<path>` só, sem preenchimento, com `id="horizonte"`.
>
> Essa curva não é decoração: é ela que o código consulta para saber a altura
> do chão em cada ponto e onde cada objeto encosta. As três tiras acima devem
> ser desenhadas de forma coerente com ela.

---

## 5. Checklist de aceite

Antes de integrar qualquer peça, confiro:

- [ ] Nenhuma ocorrência de `gradient`, `filter`, `rgba`, `defs`, `opacity`, `stroke:#000`
- [ ] Origem (0,0) na base; geometria em Y negativo
- [ ] Sem `transform` no raiz
- [ ] ≤ 6 hex distintos, e o mesmo material sempre com o mesmo hex
- [ ] Partes móveis/acendíveis em grupos com `id`
- [ ] Abre num navegador e a silhueta lê a 1/4 do tamanho

## 6. Como a peça entra no código

Um importador percorre o SVG, recolhe cada `fill`/`stroke` e reinscreve todos
por `built.paint(el, attr, hex)` — que é o roteador do modelo de luz. É por
isso que a regra da cor chapada não é preciosismo: se a cor vier num gradiente,
não existe um hex único para reinscrever, e a peça sai do modelo de luz.

Peças que **emitem** luz (chama, vidro do lampião, bulbo) vão por
`built.paintEmissive()`, que não as escurece à noite.

O posicionamento continua com o plano de chão (`createPlane` em
`js/themes/acampamento/background.js`): ele resolve onde a peça encosta e com
que escala, a partir do `depth` do slot em `composition.js`. A ilustração
substitui o DESENHO, nunca o modelo.
