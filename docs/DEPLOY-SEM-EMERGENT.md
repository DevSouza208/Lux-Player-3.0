# Lux 3.0 — infraestrutura independente da Emergent

A plataforma tem dois componentes diferentes:

1. Frontend React/TypeScript servido no GitHub Pages.
2. API FastAPI/HTTPX/FFmpeg servida em um processo Python de longa duração,
   necessária para playlists por URL, Xtream, imagens HTTP, HLS e remux MPEG-TS.

## Publicar a API independente no Render

O repositório contém `render.yaml`, `backend/Dockerfile`,
`backend/requirements.deploy.txt` e `backend/standalone.py`. A entrada
standalone reutiliza os parsers e o proxy da Emergent, **sem depender de MongoDB**.

1. Conecte sua conta Render e autorize o repositório `DevSouza208/Lux-Player-3.0`.
2. Importe o repositório como Blueprint no painel Render.
   O serviço `lux-player-iptv-api` é configurado a partir do Dockerfile do backend.
3. Configure **`LUX_ALLOWED_HOSTS`** com domínios dos servidores que o Lux
   está autorizado a acessar (separados por vírgula, sem protocolo e sem senha).
   Inclua os hosts de mídia/imagens/redirecionamento necessários. Com a variável
   vazia o proxy recusa solicitações: não expomos um proxy aberto na internet.
4. Verifique `https://SEU-SERVICO.onrender.com/api/health`. Deve responder
   `{"status":"ok","service":"lux-player-iptv","configured":true}`.
5. Em **GitHub → repositório → Settings → Secrets and variables → Actions →
   Variables**, crie a variável de repositório **`LUX_API_ORIGIN`** com valor
   `https://SEU-SERVICO.onrender.com` (sem `/api` ao final).
6. Execute **Actions → Publish Lux Player frontend → Run workflow**.
   O GitHub Pages será recompilado apontando para a sua API externa.
7. Teste com uma playlist pública autorizada: importar por URL, navegar,
   mostrar imagens e reproduzir HLS/MPEG-TS.

## Como o frontend alterna de ambiente

- Em dev/Emergent, sem `VITE_API_ORIGIN`, as rotas permanecem `/api/*`.
- No GitHub Pages, a variável `LUX_API_ORIGIN` é inserida no build
  como `VITE_API_ORIGIN`, e as rotas passam para
  `https://SEU-SERVICO.onrender.com/api/*`.
- Não coloque credenciais de fornecedores no GitHub ou em variáveis Vite:
  variáveis `VITE_*` tornam-se públicas no bundle.

## Cuidados antes de atender vários usuários

O protótipo ainda não tem autenticação remota, cotas de banda, limitação por
usuário ou isolamento de provedores. Use como ambiente de testes com poucos
usuários e domínios explícitos. HTTPX confere a allowlist também em redirects,
mas é necessário configurar controles de rede de saída e de taxa para uma API
exposta em produção. Tráfego de vídeo pode consumir muita banda e CPU;
serviços gratuitos podem hibernar ou limitar streaming. Não use um proxy aberto
para fontes arbitrárias em uma implantação pública.

O MongoDB do antigo `backend/server.py` só é necessário para endpoints legados
de status. O novo `backend/standalone.py` preserva o funcionamento IPTV sem
executar o MongoDB local da Emergent. Mantenha a preview antiga apenas para
comparação até os testes de migração passarem.
