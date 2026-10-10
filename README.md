# Lux Player 3.0

Aplicacao web para importar e organizar playlists M3U, M3U8 e XStream em uma
biblioteca pessoal. A interface oferece perfis locais, canais ao vivo, filmes,
series, lista pessoal e progresso de reproducao. Importe somente conteudo que
voce tem permissao para acessar.

## Funcionalidades

- Importacao de playlists por arquivo ou URL.
- Catalogo pesquisavel de canais, filmes e series, com temporadas e episodios.
- Perfis locais, favoritos e continuacao de reproducao.
- Player com suporte a HLS, controles de reproducao e avancar episodio.
- Persistencia local no IndexedDB do navegador.
- Backend FastAPI para parsing de playlists e proxy de midia.

O catalogo comeca vazio. As playlists e os dados do navegador nao sao enviados
para um servico de conta ou sincronizados entre dispositivos.

## Tecnologias

- Frontend: React 19, TypeScript, Vite e Tailwind CSS.
- Backend: FastAPI, Python e MongoDB.
- Testes: pytest e Playwright.

## Executar localmente

Requisitos: Node.js, Yarn, Python, MongoDB e Git.

1. Configure o backend:

   ```bash
   cp backend/.env.example backend/.env
   cd backend
   python -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   uvicorn server:app --host 0.0.0.0 --port 8001 --reload
   ```

2. Em outro terminal, inicie o frontend:

   ```bash
   cd frontend
   yarn install
   yarn dev
   ```

Abra `http://localhost:3000`. O Vite encaminha as chamadas `/api` para o
backend em `http://localhost:8001`.

## Configuracao

Copie `backend/.env.example` para `backend/.env` e ajuste a URL do MongoDB e as
origens permitidas para o seu ambiente. O arquivo `.env` local e ignorado pelo
Git; nao coloque senhas, tokens ou URLs privadas em commits publicos.

## Verificacoes

```bash
cd frontend && yarn typecheck && yarn build
cd backend && pytest
```

Os testes do backend esperam a API disponivel em `http://localhost:8001`.
