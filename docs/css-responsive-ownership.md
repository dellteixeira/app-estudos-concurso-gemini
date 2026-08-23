# CSS responsivo — ownership canônico

A partir das Fases 1–4, `public/css/responsive-system.css` é a camada canônica para layout responsivo transversal do aplicativo.

## Pertence ao responsive-system.css

- largura e gutters de `#app-dashboard`;
- grids fluidos de `.study-overview-grid` e `.grid-top`;
- primitives `.responsive-grid`, `.responsive-toolbar` e container queries opt-in;
- layout responsivo de `header.modern-header`;
- distribuição da navegação `.header-nav-tabs`;
- distribuição responsiva da `.action-bar` genérica;
- safe areas, touch targets e os quatro breakpoints oficiais.

## Permanece nos CSS de feature

`base.css`, `dashboard.css` e `features.css` podem manter aparência, tipografia, cores e compatibilidade legada já existente, mas novos ajustes responsivos transversais não devem ser adicionados ali.

`pdf-library.css` e `pdf-reader.css` continuam donos exclusivos dos layouts especializados da Biblioteca e do leitor de PDF. O sistema responsivo global não deve capturar seletores internos desses módulos.

A ordem de cascata intencional é:

`base.css` / `dashboard.css` / `features.css` → `responsive-system.css` → CSS especializados de PDF.

Assim, a camada canônica corrige o layout transversal sem retirar a autoridade final de Biblioteca e Reader sobre os seus componentes internos.

## Breakpoints oficiais

- Mobile: `<= 600px`
- Tablet: `601px–900px`
- Notebook: `901px–1200px`
- Desktop: `>= 1201px`

Novos breakpoints transversais devem usar somente essas quatro faixas. Container queries são preferíveis quando a adaptação depende do espaço real do componente.

## Auditoria

`scripts/audit-css-ownership.cjs` roda no pipeline de auditoria e verifica:

1. presença dos seletores canônicos;
2. ordem correta de carregamento: folhas legadas → `responsive-system.css` → folhas especializadas de PDF;
3. ausência de seletores especializados de PDF na camada global;
4. uso apenas dos breakpoints canônicos na camada responsiva;
5. detecção informativa da dívida legada ainda existente.

A dívida legada é mantida por compatibilidade e deve ser removida somente em pequenos lotes acompanhados de testes de regressão visual/estrutural.
