---
id: 09-motore-elettrico-lorentz
titleIT: Motore elettrico e forza di Lorentz (principio inverso)
slideRefs: [18, 19]
order: 9
level: approfondimento
---

## In breve

Il motore elettrico funziona con il **principio inverso dell'induzione**: invece di muovere un conduttore in un campo per ottenere corrente (generatore), si fa passare corrente in un conduttore immerso in un campo e si ottiene una **forza**, la **forza di Lorentz** $F = B\,I\,L\sin\theta$. Su una spira le forze formano una coppia che la fa ruotare. Generatore e motore sono **la stessa macchina** usata nei due versi.

## Formule

Forza su un filo rettilineo di lunghezza $L$ percorso da corrente $I$ in un campo $B$ ($\theta$ = angolo tra filo e campo):

$$F = B\,I\,L\,\sin\theta$$

Momento torcente su una bobina di $N$ spire di area $S$ ($\theta$ = angolo tra $\vec B$ e la normale alla spira):

$$M = N\,B\,I\,S\,\sin\theta$$

Potenza meccanica alla velocità angolare $\omega$ e bilancio elettrico del motore (con $\varepsilon$ = f.e.m. indotta "contraria"):

$$P_{\text{mecc}} = M\,\omega \qquad \Delta V \cdot I = R\,I^2 + \varepsilon\, I$$

## Spiegazione

**Forza di Lorentz.** Le cariche in moto nel filo subiscono una forza perpendicolare al filo e al campo (regola della mano destra), massima con il filo perpendicolare a $\vec B$.

**Dalla forza alla rotazione.** In una spira rettangolare i due lati perpendicolari al campo sono percorsi da correnti opposte: ricevono forze opposte che formano una **coppia**. Per mantenere lo stesso verso di rotazione la corrente va invertita ogni mezzo giro (collettore) oppure gli avvolgimenti vanno alimentati con correnti alternate sincronizzate con la rotazione (motori trifase).

**Principio inverso e Lenz insieme.** Quando il motore gira, le sue spire si muovono nel campo e per [Faraday-Neumann](03-faraday-neumann.md) nasce una f.e.m. indotta che, per la [legge di Lenz](04-lenz.md), si oppone alla corrente di alimentazione (forza controelettromotrice). Nel bilancio $\Delta V\,I = R\,I^2 + \varepsilon\,I$: il termine $R\,I^2$ è calore Joule, il termine $\varepsilon\,I$ è la potenza trasformata in lavoro meccanico.

**Una macchina, due ruoli.** Se l'esterno fa girare il rotore, la forza di Lorentz sulle correnti indotte **frena** la rotazione (generatore); se la batteria impone la corrente, la **spinge** (motore). La scheda di Educazione civica cita proprio i motori elettrici industriali "basati sul principio inverso dell'induzione e sulla forza di Lorentz" ([Agenda 2030, Goal 9](11-agenda-2030-goal-9.md)).

## Esempio numerico

Lato di bobina $L = 0{,}10\ \text{m}$, $I = 200\ \text{A}$, $B = 1{,}2\ \text{T}$, filo perpendicolare al campo:

$$F = 1{,}2 \cdot 200 \cdot 0{,}10 = 24\ \text{N}$$

Bobina di $N = 20$ spire, $S = 0{,}10 \cdot 0{,}050 = 5{,}0\cdot10^{-3}\ \text{m}^2$, nella posizione di coppia massima:

$$M = 20 \cdot 1{,}2 \cdot 200 \cdot 5{,}0\cdot10^{-3} = 24\ \text{N}\cdot\text{m}$$

A $\omega = 1000\ \text{rad/s}$ la potenza meccanica sarebbe $P = M\omega = 24\ \text{kW}$ (valori illustrativi).

## Collegamento con KERS / MGU-K

In accelerazione l'MGU-K è un **motore**: la batteria, tramite l'inverter, invia corrente agli avvolgimenti e la forza di Lorentz produce una coppia che si somma a quella del motore termico. Fisicamente l'MGU-K è una **macchina trifase**, generalmente descritta come **sincrona a magneti permanenti** (PMSM): magneti sul rotore, tre avvolgimenti sfasati sullo statore. La spira singola delle slide è un **modello semplificato** di questa macchina. Vedi [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Perché il motore elettrico è il "principio inverso" dell'induzione?

**R:** Nel generatore un moto in un campo produce corrente; nel motore una corrente in un campo produce forza e quindi moto. La macchina è la stessa, cambia il verso della conversione di energia.

**D:** Scrivi la forza di Lorentz su un filo e spiega da cosa dipende.

**R:** $F = BIL\sin\theta$: proporzionale a campo, corrente e lunghezza del filo; massima con filo perpendicolare al campo, nulla con filo parallelo.

**D:** Che cos'è la forza controelettromotrice di un motore?

**R:** È la f.e.m. indotta nelle spire che ruotano nel campo; per Lenz si oppone alla corrente di alimentazione. Moltiplicata per la corrente dà la potenza meccanica prodotta.

**D:** La spira delle slide è uguale all'MGU-K?

**R:** No, è un modello semplificato: l'MGU-K reale è una macchina trifase a magneti permanenti, ma il principio fisico (Faraday-Neumann, Lenz, Lorentz) è lo stesso.
