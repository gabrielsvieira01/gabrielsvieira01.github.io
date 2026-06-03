/* Lógica da página de login (index.html). */
(function () {
  "use strict";

  var DEST = "filtros.html"; // para onde vai depois de logar

  // Se já estiver logado, pula direto para os filtros.
  if (window.Auth.isLoggedIn()) {
    window.location.replace(DEST);
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("loginForm");
    var userInput = document.getElementById("username");
    var passInput = document.getElementById("password");
    var errorBox = document.getElementById("loginError");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.style.display = "none";

      var ok = window.Auth.login(userInput.value, passInput.value);
      if (ok) {
        window.location.href = DEST;
      } else {
        errorBox.textContent = "Usuário ou senha incorretos.";
        errorBox.style.display = "block";
        passInput.value = "";
        passInput.focus();
      }
    });

    userInput.focus();
  });
})();
