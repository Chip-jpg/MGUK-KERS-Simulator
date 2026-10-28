# App desktop (Windows)

KERS Lab è disponibile anche come applicazione desktop per Windows, costruita con
[Tauri 2](https://v2.tauri.app/). L’app è un contenitore leggero attorno alla stessa build
Vite del sito (`dist/`): nessun server, nessuna connessione di rete a runtime, nessun
comando nativo personalizzato. Il codice della shell è in [`src-tauri/`](../src-tauri).

| Elemento          | Valore                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Nome prodotto     | KERS Lab                                                           |
| Identificatore    | `io.github.chipjpg.kerslab`                                        |
| Versione          | letta da `package.json` (`"version": "../package.json"`)           |
| Finestra          | 1280×800, minimo 1280×720                                          |
| Installer         | NSIS (`.exe`, per utente, senza diritti di amministratore) e MSI   |
| WebView2          | `embedBootstrapper` (vedi sotto)                                   |
| Tauri             | crate `tauri =2.12.4`, `tauri-build =2.7.3`, CLI `2.12.3` (esatte) |
| Permessi (capab.) | solo `core:default`                                                |

## Scaricare l’app

- **Release:** a ogni tag `v*` il workflow [`desktop.yml`](../.github/workflows/desktop.yml)
  allega `KERS Lab_X.Y.Z_x64-setup.exe` (NSIS) e `KERS Lab_X.Y.Z_x64_en-US.msi`
  (MSI) alla GitHub Release del tag (Releases → Assets).
- **Build manuale:** Actions → _Desktop (Windows)_ → _Run workflow_. Al termine gli installer
  sono nell’artefatto **`kers-lab-windows`** in fondo alla pagina del run (conservato 30 giorni).

Per l’uso a scuola basta l’installer NSIS: si installa nella cartella utente, senza
richiedere i diritti di amministratore.

## Compilare in locale (Windows)

Prerequisiti (una sola volta):

1. **Microsoft C++ Build Tools** (Visual Studio Build Tools, carico di lavoro
   “Sviluppo di applicazioni desktop con C++”).
2. **WebView2 Runtime**: già presente in Windows 11 e nei Windows 10 aggiornati; altrimenti
   si installa dal sito Microsoft (Evergreen Runtime).
3. **Rust** stabile tramite [rustup](https://rustup.rs/) (toolchain `stable-msvc`,
   versione ≥ 1.90).
4. **Node.js 22** (come per il sito).

Poi, nella cartella del repository:

```bash
npm ci
npm run desktop:dev     # finestra Tauri sul server Vite (http://localhost:5173), con ricarica a caldo
npm run desktop:build   # build di produzione + installer
```

Gli installer finiscono in `src-tauri/target/release/bundle/nsis/` e
`src-tauri/target/release/bundle/msi/`. `npm run tauri -- <comando>` dà accesso diretto
alla CLI (es. `npm run tauri -- info`).

Su Linux/macOS `npm run desktop:dev` funziona (servono le dipendenze di sistema di
Tauri, es. `libwebkit2gtk-4.1-dev` su Ubuntu), ma gli installer Windows vanno prodotti su
Windows: la cross-compilazione non è supportata da questo progetto, ci pensa la CI.

### Rigenerare le icone

Le icone in `src-tauri/icons/` sono generate dal disegno astratto originale
[`src-tauri/app-icon.svg`](../src-tauri/app-icon.svg) (spira, linee di campo e corrente
indotta; nessun logo):

```bash
npx tauri icon src-tauri/app-icon.svg
```

Il comando crea anche le icone Android/iOS e i loghi per Microsoft Store: non servono e non
vanno committati (si tengono solo `32x32`, `64x64`, `128x128`, `128x128@2x`, `icon.png`,
`icon.ico`, `icon.icns`).

## Come gira l’app (origine, router, worker)

- In produzione Tauri serve i file di `dist/` dal protocollo interno dell’app: su Windows
  l’origine è `http://tauri.localhost` (WebView2), su macOS/Linux `tauri://localhost`. Non
  c’è alcun server HTTP in ascolto.
- `vite.config.ts` usa `base: './'`, quindi `index.html` referenzia `./assets/…` con
  percorsi relativi che si risolvono sull’origine dell’app.
- Il router è **hash-based** (`#/teoria`, `#/sim/…`): il frammento non viene mai richiesto al
  “server”, quindi ricaricare o aprire un percorso profondo carica sempre `index.html`.
- I moduli caricati a richiesta (`import()`) sono file reali in `assets/`: stessa origine,
  nessun URL `blob:`. Tauri li serve con il MIME type corretto (`text/javascript`),
  requisito dei moduli ES.
- `localStorage` (tema) è legato all’origine: resta tra un avvio e
  l’altro. Cambiare `app.windows[].useHttpsScheme` cambierebbe l’origine e farebbe perdere
  i dati salvati: non va modificato.
- I link esterni (fonti nella teoria e nei simulatori) **non** sostituiscono la finestra
  dell’app: un piccolo hook in `src-tauri/src/lib.rs` blocca ogni navigazione che non sia
  verso l’app stessa. Le fonti vanno quindi consultate dalla versione web o copiando l’URL.

## Content Security Policy

La CSP è in `src-tauri/tauri.conf.json` (`app.security.csp`) ed è stata ricavata da
ciò che la build in `dist/` usa davvero:

| Direttiva     | Valore                             | Perché                                                                                                                                                                             |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src` | `'self'`                           | tutto è locale (offline-first).                                                                                                                                                    |
| `script-src`  | `'self'`                           | niente `eval`/`new Function`. Lo script inline di `index.html` (tema prima del primo paint) viene autorizzato da Tauri, che in build aggiunge automaticamente il suo hash SHA-256. |
| `style-src`   | `'self' 'unsafe-inline'`           | KaTeX, uPlot e l’interfaccia impostano attributi `style` dinamici.                                                                                                                 |
| `img-src`     | `'self' data: blob:`               | immagini/texture inline di Three.js e uPlot.                                                                                                                                       |
| `font-src`    | `'self' data:`                     | font KaTeX inclusi in `assets/` (e un fallback `data:font/woff` nel CSS).                                                                                                          |
| `worker-src`  | `'self'`                           | dalla v0.5.0 nessun Web Worker è in uso (era quello di `field-biot-savart`, rimosso); la direttiva resta limitata alla stessa origine.                                             |
| `connect-src` | `'self' ipc: http://ipc.localhost` | IPC interno di Tauri e richieste alla stessa origine (polyfill `modulepreload` di Vite); nessuna richiesta verso Internet.                                                         |
| `object-src`  | `'none'`                           | nessun plugin.                                                                                                                                                                     |
| `base-uri`    | `'self'`                           | impedisce di spostare la base dei percorsi relativi.                                                                                                                               |
| `form-action` | `'none'`                           | nessun form inviato.                                                                                                                                                               |

`dangerousDisableAssetCspModification: ["style-src"]` evita che Tauri aggiunga nonce/hash a
`style-src`: con un nonce presente i browser ignorano `'unsafe-inline'` e gli stili inline
di KaTeX smetterebbero di funzionare. Per `script-src` la modifica automatica resta attiva
(serve per l’hash dello script inline). In sviluppo (`devCsp`) si aggiunge solo
`ws://localhost:5173` / `http://localhost:5173` per l’HMR di Vite.

## WebView2: `embedBootstrapper`

| Modalità               | Dimensione installer | Serve Internet in installazione?                             |
| ---------------------- | -------------------- | ------------------------------------------------------------ |
| `downloadBootstrapper` | minima               | sì, se WebView2 manca (scarica il bootstrapper e il runtime) |
| `embedBootstrapper`    | +≈ 1,8 MB            | sì, se WebView2 manca (il bootstrapper scarica il runtime)   |
| `offlineInstaller`     | +≈ 127 MB            | no                                                           |

Si usa `embedBootstrapper`: WebView2 è già preinstallato su Windows 11 e sui Windows 10
aggiornati (quindi il bootstrapper quasi mai parte), l’installer resta piccolo e si evita
un download in più. Se serve installare su PC **senza WebView2 e senza rete**, si cambia
`bundle.windows.webviewInstallMode` in `{ "type": "offlineInstaller" }` e si ricompila.
Una volta installata, l’app funziona sempre completamente offline.

## Limitazioni note

- **Binario non firmato:** al primo avvio Windows SmartScreen mostra “Windows ha protetto il
  PC”. Si procede con _Ulteriori informazioni → Esegui comunque_. La firma richiede un
  certificato di code signing (a pagamento) non previsto.
- **Nessun aggiornamento automatico:** per una nuova versione si scarica e si installa il
  nuovo installer (sovrascrive la versione precedente).
- **Versioni MSI:** WiX accetta solo versioni numeriche `X.Y.Z` (al più un suffisso
  numerico); un tag con prerelease testuale (es. `v0.4.0-rc.1`) fa fallire il bundle MSI.
- **Link esterni** bloccati nella finestra dell’app (vedi sopra); aprirli nel browser
  richiederebbe il plugin `tauri-plugin-opener`, oggi non incluso per tenere minimi i
  permessi.
- Solo **Windows x64** è prodotto dalla CI; macOS/Linux non sono distribuiti.
