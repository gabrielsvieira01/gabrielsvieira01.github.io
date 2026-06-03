/* ============================================================================
 *  Controle de sessão / autenticação (lado do cliente)
 * ----------------------------------------------------------------------------
 *  Funções usadas pelas páginas para verificar se o usuário está logado.
 *  A "sessão" vale enquanto a aba do navegador estiver aberta (sessionStorage).
 * ========================================================================== */
(function () {
  "use strict";

  var AUTH_KEY = "integradora_auth";

  // Tenta autenticar. Retorna true se usuário/senha conferem.
  function login(username, password) {
    var users = window.USERS || {};
    var u = (username || "").trim();
    if (Object.prototype.hasOwnProperty.call(users, u) && users[u] === password) {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({ user: u, ts: Date.now() }));
      return true;
    }
    return false;
  }

  function isLoggedIn() {
    return !!sessionStorage.getItem(AUTH_KEY);
  }

  function currentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_KEY)).user;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
  }

  // Protege uma página: se não estiver logado, manda de volta para o login.
  function requireAuth(redirectTo) {
    if (!isLoggedIn()) {
      window.location.replace(redirectTo || "index.html");
      return false;
    }
    return true;
  }

  window.Auth = {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    currentUser: currentUser,
    requireAuth: requireAuth
  };
})();
