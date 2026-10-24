# Serviço no PC sempre ligado (opcional)

Serve para duas coisas que a TV não faz sozinha: saber o estado de serviços da casa/escritório e
pegar uma foto do dia (o Bing não libera CORS para a TV).

## O que roda

- `home-watch.py <IP_TV>`: conexão SSAP com a TV (portas 3000/3001). Abre o launcher quando a home
  da LG aparece (útil ao ligar a TV; no webOS 5 não pega o botão Home de dentro de apps).
  Na inicialização também chama `tv_services.start()`. Desligue o serviço com `TV_SERVICES=0`.
- `tv_services.py`: HTTP em `0.0.0.0:8765`, só biblioteca padrão.
  - `/status.json` → `{"updated":..., "items":[{"name","ok","detail"?}]}`
  - `/bg.json` → `{"url","title","copyright","date"}`
- `tv_services.json`: lista de checagens. Tipos:
  - `{"type":"docker","prefix":"meuprojeto"}` → todos os containers com o prefixo `Up`/healthy (detalhe `n/m`)
  - `{"type":"port","host":"127.0.0.1","port":11434}` → porta TCP aceita conexão
  - `{"type":"process","image":"App.exe"}` → processo rodando (tasklist no Windows, pgrep no resto)

Os dois JSONs ficam legíveis para qualquer aparelho da rede local. Nomes de checagem não devem
revelar nada sensível. Nunca coloque credencial em nenhum dos lados.

## Windows: autostart, firewall, teste

Autostart (pasta Inicializar do usuário, sem janela):

```powershell
$vh  = "<pasta do projeto>"
$vbs = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\tv-home-watch.vbs"
"CreateObject(""WScript.Shell"").Run """"""$vh\venv\Scripts\pythonw.exe"""" """"$vh\home-watch.py"""" <IP_TV>"", 0, False" |
  Set-Content $vbs -Encoding ASCII
wscript $vbs     # inicia agora
```

Firewall (só rede privada e só a sub-rede local; ajuste a sub-rede):

```powershell
New-NetFirewallRule -DisplayName "TV launcher - tv_services 8765" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 8765 -Profile Private -RemoteAddress 192.168.1.0/24
```

Teste: `Invoke-RestMethod http://127.0.0.1:8765/status.json | ConvertTo-Json` e o mesmo pelo IP do PC.
Depois ponha `pcServices: 'http://<IP_PC>:8765'` no `config.js` e reinstale com `-SkipSync`.

Reiniciar após editar: finalizar os `pythonw.exe` cuja linha de comando contém `home-watch.py`
(`Get-CimInstance Win32_Process`) e rodar o `.vbs` de novo.

Desfazer: apagar o `.vbs`, finalizar o processo, remover a regra de firewall, `pcServices: ''`.

## IP fixo

Reserve no roteador (DHCP reservation) o IP da TV e do PC; senão o launcher perde o serviço e o
instalador perde a TV quando o IP muda.
