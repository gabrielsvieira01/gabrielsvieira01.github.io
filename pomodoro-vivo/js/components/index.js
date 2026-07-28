(function (PMV) {
  'use strict';

  // Namespace reservado para componentes visuais reutilizáveis e
  // agnósticos de tema (Coral, Anemone, Algae, Fish...). Cada componente
  // expõe create(svgRoot, opts) -> { group, meta }, onde meta.biasType
  // (ex.: 'clownfish') dá dica de onde a fauna deve nascer com viés real.
  // Populado conforme a arte SVG gerada pelo Gemini é integrada - nenhum
  // componente é desenhado à mão aqui.
  PMV.Components = PMV.Components || {};
})(window.PMV = window.PMV || {});
