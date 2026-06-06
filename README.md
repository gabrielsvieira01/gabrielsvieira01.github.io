# Preparação para a Integradora

Banco de questões das integradoras anteriores (7º período), com tela de login,
página de filtros e página de resolução das questões. Site **estático**, pronto
para ser hospedado no **GitHub Pages** (sem servidor, sem build).

## Como funciona (fluxo)

```
index.html  →  filtros.html  →  quiz.html
 (login)        (escolhe          (resolve as
                ano/assunto)       questões)
```

1. **`index.html`** — tela de login. Verifica usuário/senha e, se estiver certo,
   leva para os filtros.
2. **`filtros.html`** — escolhe os anos e assuntos. Ao clicar em **Começar
   treino**, salva a seleção e **redireciona para outra página**. Tem também um
   botão **"Ver resumos dos assuntos"** que leva ao `resumos.html`.
3. **`quiz.html`** — lê os filtros escolhidos e roda o treino (questões,
   gabarito comentado e resultado final).
4. **`resumos.html`** — site de estudo: resumos (fisiopatologia, diagnóstico e
   tratamento) por assunto + seção de como/quais assuntos mais caem, com barra
   de navegação entre as especialidades. Permite **filtrar "o que mais cai" por
   prova** (os resumos se reorganizam e ocultam o que não caiu naquela prova) e
   tem uma **barra de busca** para localizar assuntos.

A "sessão" de login dura enquanto a aba do navegador estiver aberta
(`sessionStorage`). Ao fechar a aba, é preciso logar de novo.

## Estrutura dos arquivos

```
.
├── index.html              # Login
├── filtros.html            # Seleção de filtros (+ botão para os resumos)
├── quiz.html               # Resolução das questões
├── resumos.html            # Site de resumos por assunto
├── 404.html                # Redireciona para o login
├── .nojekyll               # Faz o GitHub Pages servir a pasta assets/ sem processar
└── assets/
    ├── css/
    │   ├── styles.css       # Estilos principais (extraídos do site original)
    │   ├── login.css        # Estilos só da tela de login
    │   └── resumos.css      # Estilos do site de resumos
    ├── data/
    │   └── questions.js     # Banco de questões (os dados)
    └── js/
        ├── users.js         # >>> LISTA DE LOGINS (edite aqui) <<<
        ├── auth.js          # Controle de sessão/login
        ├── login.js         # Lógica da tela de login
        ├── filtros.js       # Lógica da tela de filtros
        ├── quiz.js          # Lógica da resolução das questões
        └── resumos.js       # Navegação/scrollspy dos resumos
```

> Os textos dos resumos ficam direto no **`resumos.html`** (cada assunto é um
> bloco `<article class="subject">`). Para editar/complementar um resumo, basta
> alterar o texto desse arquivo.

## ➕ Como adicionar / mudar logins

Abra **`assets/js/users.js`** e edite a lista. Cada linha é
`"usuario": "senha",`:

```js
window.USERS = {
  "admin":  "integradora2025",
  "aluno":  "medicina",
  "turma":  "setimo7",
  "joao":   "umaSenhaQualquer"   // <- novo login adicionado
};
```

Salve, faça o commit/push (veja abaixo) e o novo login já funciona.

> 💡 **As alterações aparecem na hora.** O `users.js` é carregado sempre sem
> cache (cache-busting), então, depois que o GitHub Pages publica a alteração
> (~1 min após o push), basta **recarregar a página** que os novos logins/senhas
> valem. Não precisa limpar o cache do navegador.
>
> ⚠️ **Importante:** quem **já está logado** continua logado até **fechar a aba**
> do navegador (a sessão fica guardada em `sessionStorage`). Ou seja, mudar a
> senha de alguém não desconecta quem já entrou — só impede um **novo login** com
> a senha antiga. Para forçar a saída, feche a aba ou use F12 → Application →
> Clear site data.

> ⚠️ **Aviso de segurança.** Como o site é estático (não há servidor), as senhas
> ficam no código e podem ser vistas por quem inspecionar a página. Isso serve
> para **controlar o acesso casual** de colegas — **não** use senhas
> importantes nem reaproveite senhas de outros serviços aqui.

## 📝 Como adicionar / editar questões

As questões ficam em **`assets/data/questions.js`**, numa lista no formato:

```js
{
  "year": "2025.1",
  "qnum": 12,
  "topic": "Pediatria",
  "enunciado": "Texto da questão...",
  "alternativas": [
    { "letra": "A", "texto": "..." },
    { "letra": "B", "texto": "..." }
  ],
  "correta": "B",
  "resposta": "Comentário/explicação do gabarito."
}
```

O arquivo é grande (uma só linha com todas as questões). Recomendado editar com
um editor de código e cuidado com as aspas. Os campos `year` e `topic` precisam
bater com os valores usados nos filtros (veja `ALL_YEARS` e `TOPIC_ORDER` em
`assets/js/filtros.js`).

## 🚀 Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git branch -M main
   git push -u origin main
   ```
2. No GitHub, vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Selecione a branch **main** e a pasta **/ (root)**, e clique em **Save**.
5. Aguarde ~1 minuto. O site ficará em:
   `https://SEU_USUARIO.github.io/SEU_REPO/`

A página inicial (`index.html`) é o login.

## 💻 Testar localmente

Como tudo é estático, basta abrir o `index.html` no navegador. Para um teste
mais fiel (com os caminhos funcionando como no servidor), rode um servidor
local na pasta do projeto:

```bash
# Python 3
python -m http.server 8000
# depois abra http://localhost:8000
```

---

Gerado a partir do arquivo `integradora_v2.html` original, separando login,
filtros e resolução de questões em páginas distintas.
