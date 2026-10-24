# Widgets: fontes de dados e como adicionar um novo

Todas as fontes são gratuitas e sem chave. A TV faz as requisições direto (XHR); quando uma fonte
bloqueia CORS, use fallback por proxy ou sirva pelo `tv_services.py` no PC.

| Widget | Fonte | Atualização |
|---|---|---|
| Clima + 5 dias | `api.open-meteo.com/v1/forecast` (`current=temperature_2m,weather_code,is_day`, `daily=weather_code,temperature_2m_max,temperature_2m_min`, `forecast_days=6`) | 15 min |
| Próximo jogo | `site.api.espn.com/apis/site/v2/sports/soccer/all/teams/<ID>/schedule?fixture=true` | 15 min; 1 min durante o jogo |
| Escudos | `a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/<ID>.png&h=128&w=128` | — |
| Notícias | `news.google.com/rss/search?q=<termo>&hl=pt-BR&gl=BR&ceid=BR:pt-419`; fallback `api.rss2json.com/v1/api.json?rss_url=` | 20 min, troca a cada 9 s |
| Status | `tv_services.py` → `/status.json` | 1 min |
| Foto do dia | `tv_services.py` → `/bg.json` (Bing HPImageArchive, `n=8`) | 5 min sem foto, depois 1 h |

## Próximo jogo — regras do `pickGame`

Percorre `events` em ordem: jogo `in` (ao vivo) ganha; `post` com menos de 4 h mostra o resultado;
senão o primeiro `pre`. `timeValid:false` → "horário a definir". `competitions[0].leg` → Ida/Volta.
Nomes de campeonato chegam em inglês: traduza no mapa `LEAGUES`.
Achar o id do time: abrir a página do clube na ESPN; o número em `/id/<ID>/` é o id.

## Weather codes (WMO) usados

0 céu limpo · 1–2 poucas nuvens · 3 nublado · 45/48 neblina · 51–57 garoa · 61–67 e 80–82 chuva ·
95+ tempestade.

## Adicionar um widget

1. Crie um `<div class="infoCard" id="...">` dentro de `#infoRow` (index.html). A faixa tem 1696px
   úteis; com 4 cartões, o clima tem 440px, o jogo 400px e as notícias dividem o resto (`.newsCol`).
   Para um 5º cartão, reduza larguras ou troque uma coluna de notícias.
2. Função `updateX()` no `app.js` usando `getText(url, ok, fail)`; atualize o DOM com `textContent`
   (nunca injete HTML vindo da internet com `innerHTML`).
3. Registre o intervalo no bloco final (`setInterval`). Seja gentil com APIs gratuitas (≥ 5 min).
4. Configuração nova vai em `config.js`, com valor padrão seguro e "vazio/null = desligado".
5. Valide: `node --check app\app.js`, procure sintaxe pós-ES2018, e instale com `-SkipSync`.

## Ideias que combinam

Cotações (AwesomeAPI `economia.awesomeapi.com.br/json/last/USD-BRL`), tabela do campeonato
(ESPN `standings`), agenda do dia (via serviço no PC, nunca credencial na TV), contador de lixo/
feira da rua, status do Home Assistant (pelo `tv_services.json` com `type: port`).
