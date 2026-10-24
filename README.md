# webos-tv-launcher-skill

Skill para Claude (Claude Code / Claude.ai) que monta uma **tela inicial limpa e sem propaganda
para TVs LG webOS, sem root**, usando o Developer Mode oficial da LG.

O launcher roda como app na TV e traz:

- dock com seus apps principais e grade compacta (apps de propaganda da LG escondidos);
- **clima** atual + previsão de 5 dias (Open-Meteo);
- **próximo jogo** do seu time com escudos, contagem regressiva e placar ao vivo (ESPN);
- **duas colunas de notícias** do Google Notícias, com o tema que você quiser;
- opcional, com um PC sempre ligado: **chips de status** dos seus serviços e **foto de paisagem do dia** no fundo;
- tudo em português, compatível com webOS 5 (2020) em diante.

Testado numa LG 65NANO79SNA (webOS 5.6.2) a partir de Windows.

## Instalar a skill

**Claude Code:** copie a pasta `webos-tv-launcher/` para `~/.claude/skills/`.
**Claude.ai:** baixe `webos-tv-launcher.skill` da página de Releases (ou compacte a pasta) e envie
em Configurações → Capacidades → Skills.

Depois é só pedir: *"quero deixar a home da minha TV LG mais limpa, sem anúncios"*.

## Usar sem o Claude

```powershell
npm install -g @webos-tools/cli
git clone https://github.com/OmkarK97/webos-vibehack.git
git clone https://github.com/danielmontagna86-source/webos-tv-launcher-skill.git
cd webos-vibehack
python -m venv venv; .\venv\Scripts\python.exe -m pip install websockets
..\webos-tv-launcher-skill\webos-tv-launcher\scripts\apply-template.ps1 -Target .
# edite app\config.js (cidade, time, notícias, apps)
powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar_tv.ps1 -TvHost <IP da TV>
```

O pareamento da TV (Developer Mode + `ares-novacom --getkey`) está no passo a passo do
[`SKILL.md`](webos-tv-launcher/SKILL.md). Problemas comuns: [`references/pitfalls.md`](webos-tv-launcher/references/pitfalls.md).

## Limitações honestas

- Não substitui o sistema da LG nem instala Android TV.
- No webOS 5/6, o botão **Home** de dentro de um app continua abrindo a home da LG; use o atalho
  de tecla numérica (segurar **1**). No webOS 22+ dá para redirecionar com o `home-watch.py`.
- A sessão do Developer Mode precisa ser renovada (**EXTEND**) a cada ~1000 h.

## Estrutura

```
webos-tv-launcher/
├── SKILL.md                 guia que o Claude segue
├── references/              armadilhas, widgets, serviço do PC
├── scripts/                 apply-template.ps1, make-icon.ps1
└── template/                arquivos que vão por cima do webos-vibehack
```

## Créditos e licença

Baseado em [webos-vibehack](https://github.com/OmkarK97/webos-vibehack) (OmkarK97), porta do
[tv-vibehack](https://github.com/Gathin23/tv-vibehack) (Gathin), ambos MIT. Este repositório também
é MIT. Escudos e logos de apps pertencem aos seus donos; o projeto não tem vínculo com LG, ESPN,
Google ou clubes.

Feito por Daniel Montagna · [Protheus IA Lab](https://github.com/danielmontagna86-source).
