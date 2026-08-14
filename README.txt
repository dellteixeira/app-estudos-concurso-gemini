V9.43 — Vendor same-origin, zero-build

Os caminhos /vendor/*.js são servidos pelo próprio Cloudflare Worker do projeto e
armazenados no cache do edge. O Service Worker do navegador pré-carrega esses mesmos
caminhos para uso offline após a primeira preparação online.

Versões fixadas:
- @supabase/supabase-js 2.112.3
- Chart.js 4.5.1
- PDF.js 3.11.174

Nenhum npm install, terminal local ou alteração no Supabase é necessário.


V9.44 — CORREÇÃO DE AUTENTICAÇÃO / VENDOR
- Supabase JS fixado em versão pública verificada 2.111.0.
- Fallback automático no Cloudflare Worker se a origem primária falhar.
- Chart.js e PDF.js também possuem origem secundária de fallback.
- Nenhuma alteração de banco, RLS ou autenticação no Supabase é necessária.
- Manifest passa a incluir também icon-512.png.
