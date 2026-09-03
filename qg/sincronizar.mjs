/**
 * Gera apps-script/Pagina.html a partir de index.html.
 *
 * index.html é a única fonte: a cópia servida pelo doGet do Apps Script sai
 * daqui. Rode depois de mexer na interface e cole o resultado no editor.
 *
 *   node sincronizar.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origem = join(aqui, "index.html");
const destino = join(aqui, "apps-script", "Pagina.html");

const html = readFileSync(origem, "utf8");

/* O widget do iPhone raspa estas duas coisas do HTML servido. A cópia do Apps
   Script não é a que ele lê hoje, mas conferir aqui é barato e pega o dia em
   que alguém mexer no index.html e quebrar as duas de uma vez. */
const temPlano = html.includes('<script type="application/json" id="plano">');
const temUrl = /var URL_DO_APP = "(https:\/\/[^"]+)"/.test(html);
if (!temPlano || !temUrl) {
  console.error(
    "ABORTADO: o index.html perdeu " +
      [!temPlano && "o <script id=plano>", !temUrl && "a linha var URL_DO_APP"]
        .filter(Boolean)
        .join(" e ") +
      ".\nO widget do Scriptable depende dos dois."
  );
  process.exit(1);
}

const aviso =
  "<!-- GERADO por sincronizar.mjs a partir de index.html. Não edite aqui: " +
  "as mudanças voltam a ser sobrescritas. -->\n";

writeFileSync(destino, aviso + html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log(`Pagina.html gerada (${kb} kB).`);
console.log("Cole o conteúdo no arquivo Pagina.html do projeto Apps Script e reimplante.");
