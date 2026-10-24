---
name: webos-tv-launcher
description: Monta uma tela inicial (launcher) limpa e sem propaganda para TV LG webOS, sem root, via Developer Mode — com clima, próximo jogo do time, notícias, status de serviços e foto do dia. Use sempre que alguém quiser trocar, limpar, personalizar ou "deixar com cara de Android/Google TV" a home de uma TV LG / webOS, tirar anúncios da LG, instalar app .ipk na TV, usar ares-cli / webOS Dev Manager / Developer Mode, ou montar widgets numa TV LG — mesmo que não diga "launcher". Also use for LG TV custom home screen, webOS homebrew without root, ares-install, sideload webOS app.
---

# Launcher para TV LG webOS (sem root)

Guia para levar alguém de "a home da minha LG é lenta e cheia de anúncio" até um launcher próprio
instalado como app, com widgets, sem root e sem perder garantia. Tudo foi validado numa LG
65NANO79SNA com **webOS 5.6.2** (2020) a partir de um PC Windows.

## Expectativa certa, antes de começar

Diga isto logo, porque muda o que a pessoa vai querer:

- **Não existe** Android TV/Google TV para instalar numa LG: o hardware e o sistema são da LG.
- **Sem root não dá para substituir a home da LG.** O que dá é um launcher que roda **como app**
  (instalado pelo Developer Mode oficial da LG) e é aberto por um atalho de tecla numérica.
- **Botão Home:** no webOS 22+ dá para redirecionar com um watcher num PC. No **webOS 5/6, não**:
  a home da LG abre por cima do app e a TV não avisa ninguém (ver `references/pitfalls.md`).
  O "Home" vira **segurar a tecla 1** do controle.
- Quem quer a experiência Google TV de verdade: Google TV Streamer/Chromecast na HDMI + TV
  configurada para ligar na última entrada + HDMI-CEC (SIMPLINK). Ofereça como alternativa.

## Visão geral do fluxo

1. Descobrir modelo e versão do webOS (Configurações → Suporte → Informações da TV).
2. Ativar Developer Mode na TV e parear o PC (ares-cli).
3. Clonar o `webos-vibehack` e aplicar o template desta skill.
4. Configurar `app/config.js` (cidade, time, notícias, apps do dock).
5. Sincronizar apps, empacotar, instalar e abrir (`instalar_tv.ps1`).
6. Atalho na tecla 1, limpar anúncios da home da LG.
7. Opcional: serviço no PC sempre ligado (status + foto do dia) e watcher do botão Home.

Peça a versão do webOS antes de qualquer código: decide se o botão Home funciona e se o CSS/JS
precisa da compatibilidade com Chrome 68 (webOS 5) — o template já é compatível.

## 1–2. Developer Mode e pareamento

Na TV: instalar o app **Developer Mode** da LG Content Store, entrar com uma conta gratuita de
webostv.developer.lge.com, ligar **Dev Mode Status** (a TV reinicia), abrir o app de novo e ligar
**Key Server**. Anotar IP e **Passphrase**. A sessão dura ~1000h; renovar com **EXTEND**.

No PC (Node.js instalado):

```powershell
npm install -g @webos-tools/cli
ares-setup-device.cmd -a lgtv -i "host=<IP_TV>" -i "port=9922" -i "username=prisoner" -i "default=true"
ares-novacom.cmd --device lgtv --getkey --passphrase <PASSPHRASE>
ares-setup-device.cmd -m lgtv -i "privatekey=lgtv_webos" -i "passphrase=<PASSPHRASE>"
ares-device.cmd --device lgtv --system-info     # deve listar modelName/sdkVersion
```

Três armadilhas que derrubam quase todo mundo aqui:
- Use os comandos **`.cmd`**: os atalhos `.ps1` do npm esbarram na política de scripts do PowerShell.
- O `--getkey` só funciona com o **Key Server ligado** (porta 9991). "Failed to get ssh private key" = desligado.
- Rode o `--getkey` no **mesmo usuário e sem "Executar como administrador"** de quem vai usar o ares
  depois; chave criada como admin costuma não ser lida pelo shell normal.

Depois do pareamento, o Key Server pode ser desligado.

## 3. Projeto e template

```powershell
git clone https://github.com/OmkarK97/webos-vibehack.git
cd webos-vibehack
python -m venv venv
.\venv\Scripts\python.exe -m pip install websockets
<pasta-da-skill>\scripts\apply-template.ps1 -Target .
```

O `apply-template.ps1` copia `template/` por cima do clone (app.js, style.css, index.html,
config.js, tv_services.py, home-watch.py, instalar_tv.ps1), corrige o `sync-apps.py` para gravar
`apps.js` em UTF-8, põe o título "Início" com escape ASCII no `appinfo.json` e gera o ícone.
Em macOS/Linux, copie os arquivos de `template/` à mão e use o `install.sh` do projeto.

## 4. Configurar

Tudo do usuário fica em `app/config.js` — não espalhe valores pelo código:
- `dockApps` / `hiddenApps`: ids vêm de `python sync-apps.py <IP> --list`. A lista padrão já
  esconde os apps de propaganda da LG Brasil (LG Channels, Streaming Week, Gaming Portal...).
- `weather`: cidade, lat/lon, timezone (Open-Meteo, sem chave).
- `team`: id do time na ESPN (Palmeiras 2029, Flamengo 819, Corinthians 874, São Paulo 2026,
  Santos 2674) ou `null` para esconder o card.
- `news`: duas colunas do Google Notícias (`title` + `query`).
- `pcServices`: vazio, ou `http://<IP_PC>:8765` se usar o serviço opcional.

Tema verde e branco: bloco THEME no topo do `style.css` (degradê, listras, véu da foto) e as cores
do `make-icon.ps1`. Para outro time, troque só essas cores.

## 5. Instalar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar_tv.ps1 -TvHost <IP_TV>
```

Na 1ª vez a TV pede para permitir o dispositivo (pareamento SSAP, usado pelo `sync-apps.py`):
aceitar com o controle. Sucesso = última linha `FIM OK | ...`. Depois, para mudanças só de layout,
use `-SkipSync`. Antes de instalar, valide: `node --check app\app.js`.

## 6. Acabamento na TV

- **Atalho:** com o launcher aberto, segurar a tecla **1** até aparecer "Acesso Rápido" e confirmar.
- **Home da LG mais limpa:** Configurações → Geral → Configurações adicionais → Configurações da
  Página Inicial: desligar Promoção e Recomendação de conteúdo; "Tela ao ligar" = última entrada.
  Desligar Live Plus. Não logar com conta LG.
- **Anúncios restantes:** DNS com bloqueio (AdGuard Home/Pi-hole) — não pega anúncio dentro do YouTube.

## 7. Opcionais no PC sempre ligado

Leia `references/pc-services.md` antes. Resumo: o `home-watch.py` mantém conexão com a TV e sobe o
`tv_services.py` (porta 8765), que entrega `status.json` (chips verde/vermelho dos serviços listados
em `tv_services.json`) e `bg.json` (foto do dia do Bing, preferindo paisagem). Autostart no Windows
por um `.vbs` na pasta Inicializar; firewall liberado só no perfil **Privado**.

Expor uma porta na rede local e criar inicialização automática são decisões do dono do PC:
explique o que fica visível na rede e peça confirmação antes de configurar.

## Quando algo der errado

Consulte `references/pitfalls.md` — lista os sintomas reais e a causa de cada um (acento virando
"Ã‚", emoji virando quadrado, botão Home que não redireciona, "authentication failed", layout
sobreposto, foto que não aparece). `references/widgets.md` explica as APIs dos widgets e como
adicionar um novo sem quebrar no Chrome 68.

## Créditos

Base: [webos-vibehack](https://github.com/OmkarK97/webos-vibehack) (OmkarK97, MIT), porta do
[tv-vibehack](https://github.com/Gathin23/tv-vibehack) (Gathin). Mantenha os créditos e a licença
MIT ao redistribuir.
