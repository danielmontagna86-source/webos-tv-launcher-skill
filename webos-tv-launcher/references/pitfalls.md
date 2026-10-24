# Armadilhas reais (sintoma → causa → correção)

Todas aconteceram de verdade numa LG webOS 5.6.2 com PC Windows. Use como tabela de diagnóstico.

## Pareamento / instalação

| Sintoma | Causa | Correção |
|---|---|---|
| `ares-setup-device : ... execução de scripts foi desabilitada` | atalho `.ps1` do npm barrado pela ExecutionPolicy | usar `ares-*.cmd` |
| `Failed to get ssh private key` | Key Server desligado (porta 9991 fechada) | ligar Key Server no app Developer Mode e repetir |
| `All configured authentication methods failed` | perfil sem chave, chave baixada em outro usuário/elevação, ou ferramenta que bloqueia leitura de `~/.ssh` | `ares-setup-device -m lgtv -i "privatekey=lgtv_webos" -i "passphrase=..."`; refazer `--getkey` sem admin no mesmo usuário |
| `exit_code: 1` mas a saída mostra os dados da TV | `| Select-Object -First N` corta o pipe e o ares sai com erro | ignorar o código ou não truncar a saída |
| `The specified value already exists <DEVICE_NAME>` | device já cadastrado | `ares-setup-device -r lgtv` e cadastrar de novo, ou só `-m` |
| App para de abrir depois de semanas | sessão do Developer Mode expirou | Developer Mode → **EXTEND** |
| TV não mostra pedido de permissão no `sync-apps.py` | no webOS 5 a opção nem existe, vem ligada | conferir portas 3000/3001 abertas; no webOS 22+: Geral → Dispositivos → "LG Connect Apps" |

## Botão Home

- **webOS 5/6:** apertar Home *dentro de um app* abre a home da LG como **sobreposição**; o app em
  primeiro plano continua sendo o Netflix etc. `getForegroundAppInfo` não emite nada → o watcher
  não tem como saber. Comprovado com log (`HOMEWATCH_DEBUG=1`): só aparece `"appId": "netflix"`.
- Quando a home aparece "sozinha" (TV ligando, ou saindo de um app), o webOS 5 reporta
  `appId: ""` (vazio), não `com.webos.app.home`. Por isso o watcher trata `""` como home.
- Interceptar a tecla exige o LG Input Hook, que exige root. Sem root: atalho na tecla numérica.
- Não rode o watcher duas vezes (duas cópias = dois launches). No Windows o `pythonw` do venv
  aparece como 2 processos (launcher do venv + interpretador): é uma instância só.

## Codificação de texto (a mais traiçoeira)

| Sintoma | Causa | Correção |
|---|---|---|
| "Uberl�ndia", "Configura��es" na TV | arquivo salvo em CP1252/ANSI; o webOS lê UTF-8 | converter `index.html`/`config.js` para UTF-8 **sem BOM** |
| "Fotos & V�deos" (nome de app) | `sync-apps.py` abre `apps.js` sem `encoding=` → CP1252 no Windows | `open(..., "w", encoding="utf-8")` (o apply-template corrige) |
| Nome do app vira "InÃƒÆ'Ã‚Âcio" e piora a cada build | script de build relê/regrava o `appinfo.json` em ANSI → dupla codificação acumulativa | gravar `"title": "Início"` (escape ASCII) e escrever com `UTF8Encoding($false)` |
| Emojis viram quadrados | webOS 5 não tem fonte de emoji colorido | ícones em SVG inline (o template já faz) |

## Compatibilidade Chrome 68 (webOS 5)

- JS: sem `?.`, `??`, `Array.prototype.flat`, `Object.fromEntries`, `replaceAll`, classes privadas.
  Use ES2017/ES5. Valide com `node --check` e uma leitura procurando esses tokens.
- CSS: sem `gap` em flex, `inset`, `aspect-ratio`, `:is()`. Use margens e `top/right/bottom/left`.
- `<script type="module">` não carrega de `file://`.

## Layout

- Painel de notícias sobreposto aos botões do topo: elementos com `position:absolute` sem uma
  linha própria. O template usa uma faixa `#infoRow` de cartões alinhados abaixo do header e esconde
  header + cartões juntos ao rolar (`body.scrolled`).
- Se mudar alturas, ajuste `DOCK_TOP` no `app.js` para ficar ~28px abaixo do fim do `#infoRow`.

## Serviço do PC / foto do dia

- Foto não aparece: o launcher abriu antes do serviço baixar a imagem. O app tenta de novo a cada
  5 min enquanto não tem foto. Conferir `http://<PC>:8765/bg.json` no navegador.
- Foto "não é paisagem": o Bing nem sempre publica paisagem; o serviço escolhe a mais recente entre
  as últimas 8 cujo título/crédito tem palavras de paisagem; se nenhuma tiver, usa a do dia.
- Chip "PC fora do ar": firewall bloqueando a 8765 ou serviço parado. Regra de entrada só no perfil
  Privado. Prova de que o tráfego da TV chega: conexão vinda do IP da TV em `TimeWait` no
  `Get-NetTCPConnection -LocalPort 8765`.

## Ferramentas de agente com travas

Se o agente roda comandos por um shell com regras de segurança (bloqueio de rede direta, de
caminhos de credencial etc.), não tente contorná-las: entregue o comando pronto para a pessoa rodar.
