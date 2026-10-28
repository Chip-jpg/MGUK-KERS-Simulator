---
id: 09-motore-elettrico-lorentz
titleIT: Motore elettrico e forza di Lorentz (principio inverso)
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

**Forza di Lorentz.** Le cariche in moto nel filo subiscono una forza perpendicolare a filo e campo (regola della mano destra), massima con filo perpendicolare a $\vec B$.

**Dalla forza alla rotazione.** In una spira rettangolare i due lati perpendicolari al campo sono percorsi da correnti opposte: ricevono forze opposte che formano una **coppia**. Per non invertire il verso di rotazione la corrente va invertita ogni mezzo giro (collettore) o fornita come corrente alternata sincronizzata con la rotazione (motori trifase).

**Principio inverso e Lenz insieme.** Quando il motore gira, le sue spire si muovono nel campo e per [Faraday-Neumann](03-faraday-neumann.md) nasce una f.e.m. indotta che, per la [legge di Lenz](04-lenz.md), si oppone alla corrente di alimentazione (forza controelettromotrice). Nel bilancio $\Delta V\,I = R\,I^2 + \varepsilon\,I$: il termine $R\,I^2$ è calore Joule, il termine $\varepsilon\,I$ è la potenza trasformata in lavoro meccanico.

**Una macchina, due ruoli.** Se l'esterno fa girare il rotore, la forza di Lorentz sulle correnti indotte **frena** la rotazione (generatore); se la batteria impone la corrente, la **spinge** (motore). La scheda di Educazione civica cita i motori elettrici industriali come esempio ([Agenda 2030, Goal 9](11-agenda-2030-goal-9.md)).

## Esempio numerico

Valori illustrativi. Lato di bobina $L = 0{,}10\ \text{m}$, $I = 200\ \text{A}$, $B = 1{,}2\ \text{T}$, filo perpendicolare al campo:

$$F = 1{,}2 \cdot 200 \cdot 0{,}10 = 24\ \text{N}$$

Bobina di $N = 20$ spire, $S = 0{,}10 \cdot 0{,}050 = 5{,}0\cdot10^{-3}\ \text{m}^2$, nella posizione di coppia massima:

$$M = 20 \cdot 1{,}2 \cdot 200 \cdot 5{,}0\cdot10^{-3} = 24\ \text{N}\cdot\text{m}$$

## Collegamento con KERS / MGU-K

In accelerazione l'MGU-K è un **motore**: tramite l'inverter la batteria alimenta gli avvolgimenti e la forza di Lorentz produce una coppia che si somma a quella del motore termico. Fisicamente è una **macchina trifase**, generalmente descritta come **sincrona a magneti permanenti** (PMSM: magneti sul rotore, tre avvolgimenti sfasati sullo statore; tipo esatto [DA VERIFICARE]). Il modello a una spira ne è una **versione semplificata**. Vedi [KERS e MGU-K](10-kers-mguk.md).
