---
id: 11-agenda-2030-goal-9
titleIT: Agenda 2030 - Goal 9 (imprese, innovazione e infrastrutture)
slideRefs: [21, 22, 23]
goal: '9'
order: 11
level: base
---

## In breve

L'**Agenda 2030** dell'ONU contiene 17 Obiettivi di sviluppo sostenibile. Il **Goal 9** chiede di "costruire un'infrastruttura resiliente e promuovere l'innovazione ed una industrializzazione equa, responsabile e sostenibile". Il recupero di energia in frenata (MGU-K) è un esempio concreto dei target **9.4** (tecnologie più pulite ed efficienti) e **9.5** (ricerca e innovazione). Collegamenti secondari: **Goal 7** (energia ed efficienza energetica) e, come semplice menzione, **Goal 13** (clima).

## Formule

Il filo fisico che collega induzione e sostenibilità è il rendimento:

$$\eta = \frac{E_{\text{utile}}}{E_{\text{fornita}}} \qquad E_{\text{persa}} = (1-\eta)\,E_{\text{fornita}}$$

Energia recuperata in frenata, limitata dalla potenza ([KERS e MGU-K](10-kers-mguk.md)):

$$E_{\text{rec}} \le P_{\max}\, t_f \qquad 1\ \text{kWh} = 3{,}6\ \text{MJ}$$

## Spiegazione

**I due target (testo italiano UNRIC).** Fonte: [UNRIC – ONU Italia, Obiettivo 9](https://unric.org/it/obiettivo-9-costruire-uninfrastruttura-resiliente-e-promuovere-linnovazione-ed-una-industrializzazione-equa-responsabile-e-sostenibile/); stesso testo in [Camera dei deputati, documentazione Agenda 2030](https://temi.camera.it/leg18/agenda/OCD37_11/imprese-innovazione-e-infrastrutture.html).

> **9.4** «Entro il 2030, migliorare le infrastrutture e riconfigurare in modo sostenibile le industrie, aumentando l'efficienza nell'utilizzo delle risorse e adottando tecnologie e processi industriali più puliti e sani per l'ambiente, facendo sì che tutti gli stati si mettano in azione nel rispetto delle loro rispettive capacità»

> **9.5** «Aumentare la ricerca scientifica, migliorare le capacità tecnologiche del settore industriale in tutti gli stati – in particolare in quelli in via di sviluppo – nonché incoraggiare le innovazioni e incrementare considerevolmente, entro il 2030, il numero di impiegati per ogni milione di persone, nel settore della ricerca e dello sviluppo e la spesa per la ricerca – sia pubblica che privata – e per lo sviluppo»

Nota: il testo è riportato dalla traduzione italiana diffusa da UNRIC e dalla Camera; la punteggiatura esatta va confrontata con la pagina ufficiale [DA VERIFICARE].

**Perché l'MGU-K c'entra.** Il 9.4 parla di efficienza nell'uso delle risorse e di tecnologie più pulite: recuperare energia che altrimenti diventerebbe calore nei freni è esattamente aumentare l'efficienza. Il 9.5 parla di ricerca e capacità tecnologica: macchine elettriche compatte e potenti, batterie e inverter sono campi di ricerca industriale, e la stessa fisica della frenata rigenerativa si usa su auto ibride ed elettriche, treni e tram.

**Gli esempi della scheda.** La scheda di Educazione civica collega il Goal 9 a: **mobilità sostenibile**; **treni a levitazione magnetica (Maglev)**, dove (nei sistemi a levitazione elettrodinamica) correnti indotte e [legge di Lenz](04-lenz.md) producono forze di levitazione e frenatura; **motori elettrici industriali**, basati sul principio inverso dell'induzione e sulla [forza di Lorentz](09-motore-elettrico-lorentz.md).

**Goal 7 e Goal 13.** Il [Goal 7](https://unric.org/it/agenda-2030-i-17-obiettivi-di-sviluppo-sostenibile/obiettivo-7-energia-pulita-e-accessibile/) riguarda l'energia pulita e l'efficienza energetica: il trasporto ad alta tensione con i [trasformatori](08-trasformatore-trasporto-joule.md) e il recupero in frenata riducono gli sprechi. Il [Goal 13](https://unric.org/it/agenda-2030-i-17-obiettivi-di-sviluppo-sostenibile/obiettivo-13-lotta-contro-il-cambiamento-climatico/) (lotta al cambiamento climatico) è collegato perché meno energia sprecata significa, a parità di servizio, meno combustibile bruciato ed emissioni minori.

## Esempio numerico

Con le regole fino al 2025 l'MGU-K poteva inviare alla batteria al massimo 2 MJ per giro (Fonte: [FIA, Power Unit Regulations 2014](https://www.fia.com/sites/default/files/publication/file/FIA%20F1%20Power%20Unit%20leaflet.pdf)):

$$2\ \text{MJ} = \frac{2}{3{,}6}\ \text{kWh} \approx 0{,}56\ \text{kWh}$$

Su una gara ipotetica di 50 giri il tetto massimo è $50 \cdot 2 = 100$ MJ, cioè circa $28$ kWh: energia che senza recupero sarebbe diventata solo calore nei freni.

## Collegamento con KERS / MGU-K

La catena è: [induzione](03-faraday-neumann.md) → generatore in frenata → energia recuperata invece che dissipata → maggiore efficienza (9.4) grazie a ricerca e innovazione tecnologica (9.5). Il passo successivo è il legame con la salute collettiva: [Art. 32 della Costituzione](12-art-32-costituzione.md).

## Domande da interrogazione

**D:** Perché hai scelto il Goal 9?

**R:** Perché l'MGU-K è un esempio di innovazione tecnologica che aumenta l'efficienza nell'uso dell'energia: realizza il target 9.4 (tecnologie più pulite ed efficienti) e il 9.5 (ricerca e capacità tecnologiche).

**D:** Che cosa chiede il target 9.4?

**R:** Entro il 2030 migliorare le infrastrutture e riconfigurare le industrie in modo sostenibile, aumentando l'efficienza nell'uso delle risorse e adottando tecnologie e processi più puliti.

**D:** Come entra la legge di Lenz nel Goal 9?

**R:** Nei treni Maglev e nei freni a correnti parassite, dove le correnti indotte si oppongono al moto, e nella frenata rigenerativa, dove la coppia di Lenz frena il veicolo producendo energia elettrica.

**D:** Che legame c'è con i Goal 7 e 13?

**R:** Goal 7: efficienza energetica, meno sprechi. Goal 13: meno energia sprecata significa meno combustibile e meno emissioni, quindi un contributo alla lotta al cambiamento climatico.
