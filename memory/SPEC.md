# Lux Player MVP

## O que faz
Lux Player é um reprodutor premium local para playlists M3U, M3U8 e XStream. O catálogo é vazio até o usuário importar uma fonte; não há conteúdo de demonstração.

## Persistência
Perfis, playlists importadas, itens normalizados, Minha lista e progresso de reprodução ficam no IndexedDB do navegador (`lux-player-db`, store `app-state`). A estrutura foi mantida simples para uma futura migração para Cloudflare D1.

## Fluxos principais
- Na primeira visita, criar um de até quatro perfis locais com nome, avatar/emoji e PIN opcional.
- Importar arquivo M3U/M3U8/TXT local, URL M3U/M3U8 ou XStream com servidor, usuário e senha.
- Navegar por Início, Ao vivo, Filmes, Séries e Minha lista; a home mostra hero, Continuar assistindo e rails por categoria.
- As abas de catálogo exibem grade paginada de 48 itens, navegação primeira/anterior/próxima/última e salto direto. A importação URL processa até 500.000 itens, cobrindo integralmente a lista de teste com aproximadamente 411 mil entradas.
- Séries são agrupadas pelo título-base (ignorando marcador SxxExx e ano para deduplicação). Cada card abre uma tela com temporadas, episódios ordenados, progresso individual e avanço contínuo para o episódio seguinte, inclusive entre temporadas.
- Abrir o player com HLS via hls.js/nativo, fullscreen, volume, velocidade, legendas, picture-in-picture, progresso e próximo episódio.
- Mídias HTTP, imagens com certificado inválido e manifests HLS passam pelo proxy HTTPS do backend. Streams IPTV MPEG-TS contínuos são remuxados para MP4 fragmentado em navegadores H.264/AAC e transcodificados para WebM VP8/Opus quando esses codecs não estão disponíveis.

## Dados e limites do MVP
- `MediaItem` é a unidade normalizada; séries M3U são agrupadas por `group` e identificadores SxxExx.
- A classificação prioriza grupos CANAIS/PPV e `.ts` como ao vivo; títulos SxxExx/1x02 em VOD como séries; demais `.mp4/.mkv/.avi` como filmes. Catálogos antigos no IndexedDB são migrados automaticamente pela versão de catálogo.
- O backend só faz parsing transitório de URL/XStream em `/api/playlists/parse-url`; não armazena catálogo.
- Não há autenticação, pagamentos, EPG, anúncios, catálogo externo ou IA no MVP.
- XStream importa canais, VOD e séries; o detalhamento de episódios XStream será uma evolução, enquanto episódios M3U com SxxExx já suportam próximo episódio.

## Auth
Não há login. PIN é opcional e local por perfil.