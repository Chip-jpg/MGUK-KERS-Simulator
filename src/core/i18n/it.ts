/**
 * All user-facing UI strings (Italian). Code never hard-codes UI text: import
 * `it` (or `t`) and read the key. Theory content lives in content/theory/*.md.
 *
 * Owners extend this object (A3 for shell/UI keys, sims via orchestrator change
 * request) — keep keys in English, values in Italian.
 */
export const it = {
  app: {
    name: 'KERS Lab',
    tagline: 'Dall’induzione di Faraday all’MGU-K',
    documentTitle: 'KERS Lab — Dall’induzione di Faraday all’MGU-K',
    skipToContent: 'Vai al contenuto',
    loading: 'Caricamento…',
    offlineNote: 'Funziona anche senza connessione.',
    comingSoon: 'In arrivo',
  },
  nav: {
    label: 'Navigazione principale',
    theory: 'Teoria',
    simulators: 'Simulatori',
    theoryList: 'Sezioni di teoria',
    simList: 'Elenco dei simulatori',
  },
  theme: {
    toggle: 'Cambia tema',
    dark: 'Tema scuro',
    light: 'Tema chiaro',
    switchToLight: 'Passa al tema chiaro',
    switchToDark: 'Passa al tema scuro',
  },
  controls: {
    reset: 'Reimposta',
    pause: 'Pausa',
    play: 'Avvia',
    resume: 'Riprendi',
    step: 'Avanza di un passo',
    stepShort: 'Passo',
    showFormulas: 'Mostra formule',
    hideFormulas: 'Nascondi formule',
    value: 'Valore',
    toolbar: 'Comandi della simulazione',
    invalidNumber: 'Valore non valido: inserisci un numero tra',
    and: 'e',
    on: 'Attivo',
    off: 'Disattivo',
  },
  theory: {
    indexTitle: 'Teoria',
    indexIntro: 'Sezioni sintetiche: dalla legge di Faraday all’MGU-K, un passo alla volta.',
    toc: 'Indice',
    previous: 'Precedente',
    next: 'Successiva',
    levelBase: 'base',
    levelAdvanced: 'approfondimento',
    goToSim: 'Apri il simulatore',
    empty: 'I contenuti teorici sono in preparazione.',
    notFound: 'Sezione di teoria non trovata.',
    mathErrors: 'Alcune formule non sono state interpretate correttamente.',
    goal: 'Obiettivo',
    pager: 'Navigazione tra le sezioni',
    sectionOf: 'Sezione',
    /** Fixed section headings of every theory file (§4.4), in order. */
    headings: [
      'In breve',
      'Formule',
      'Spiegazione',
      'Esempio numerico',
      'Collegamento con KERS / MGU-K',
    ],
  },
  sim: {
    indexTitle: 'Simulatori',
    indexIntro: 'Scegli un simulatore: scena 3D, parametri e grafici in tempo reale.',
    theoryLink: 'Vai alla teoria',
    simplifiedModel: 'Modello semplificato',
    parameters: 'Parametri',
    formulas: 'Formule',
    plots: 'Grafici',
    notAvailable: 'Simulatore non ancora disponibile.',
    comingSoonBody:
      'Questo simulatore è in preparazione: qui compariranno la scena 3D, i parametri, le formule e i grafici.',
    open: 'Apri il simulatore',
    loadError: 'Impossibile caricare il simulatore.',
    scene: 'Scena',
    sceneLabel: 'Scena interattiva',
    formulasOverlay: 'Formule in evidenza',
    titles: {
      faraday: 'Flusso e legge di Faraday-Neumann',
      lenz: 'Legge di Lenz',
      'alternator-motor': 'Alternatore ⇄ motore (MGU-K)',
      'kers-braking': 'Frenata e recupero di energia',
      'joule-transformer': 'Trasformatore e perdite Joule',
      'rl-energy': 'Autoinduzione, circuito RL, energia',
      'car-dynamics': 'Dinamica della vettura: frenata combinata MGU-K + freni',
    },
  },
  errors: {
    notFound: 'Pagina non trovata.',
    backHome: 'Torna alla teoria',
    generic: 'Si è verificato un errore.',
  },
} as const;

/** Shape of the Italian string table. */
export type Strings = typeof it;

/** Short alias: `t.nav.theory`. */
export const t: Strings = it;
