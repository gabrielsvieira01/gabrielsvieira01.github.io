(function (PMV) {
  'use strict';

  // Namespace dos componentes visuais - reutilizáveis e agnósticos de tema.
  // Cada um expõe create(svgRoot, opts) -> { group, inner, meta, applyLight },
  // onde meta.biasType (ex.: 'clownfish') dá a dica de onde a fauna deve
  // nascer com viés real.
  //
  // A arte é procedural e seedada, não asset estático: a mesma seed devolve
  // sempre o mesmo indivíduo, mas seeds diferentes dão coral, alga e leque
  // diferentes uns dos outros. Ver common.js para o contrato de coordenadas
  // (origem na base, geometria pra y negativo) e para o porquê de a
  // animação viver no grupo interno.
  //
  // Ordem de carga: este arquivo, depois common.js, depois os organismos.
  PMV.Components = PMV.Components || {};
})(window.PMV = window.PMV || {});
