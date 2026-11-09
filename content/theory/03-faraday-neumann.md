---
id: 03-faraday-neumann
titleIT: Legge di Faraday-Neumann
order: 3
level: base
---

## In breve

La legge di Faraday-Neumann dà la relazione quantitativa tra la variazione del flusso e la forza elettromotrice indotta. La corrente si ricava dopo, con la legge del circuito.

## Formule

Nella catena della sbarretta, $L$ è il lavoro in joule ed $e$ è la carica, non l’induttanza:

$$\text{f.e.m.} = \frac{L}{e} = \frac{F\ell}{e} = \frac{e\,v\,B\,\ell}{e} = B\,\ell\,v$$

Legge di Faraday-Neumann, valore medio sull’intervallo $\Delta t$:

$$\text{f.e.m.} = -\frac{\Delta\Phi_B}{\Delta t}$$

La formula stampata è per una spira. Per $N$ spire uguali la f.e.m. è $N$ volte tanto: è l’unico fattore $N$, lo stesso del flusso concatenato.

Forme con la legge di Ohm resistiva, e forme istantanee:

$$i = \frac{\text{f.e.m.}}{R} = -\frac{1}{R}\frac{\Delta\Phi_B}{\Delta t}$$

$$\text{f.e.m.} = -\frac{d\Phi_B}{dt} \qquad i = -\frac{1}{R}\frac{d\Phi_B}{dt}$$

$i = \text{f.e.m.}/R$ vale per un circuito resistivo. Non è la legge di un [circuito RL](06-circuito-rl-energia-campo.md) durante il transitorio.

## Spiegazione

$B\ell v$ è il caso in cui la sbarretta, in un campo perpendicolare, cambia l’area del circuito. Il rapporto $\Delta\Phi_B/\Delta t$ è la f.e.m. media; la derivata è la f.e.m. istante per istante. Il segno meno è la [legge di Lenz](04-lenz.md). Unità: $1\ \text{Wb/s} = 1\ \text{V}$.

## Esempio numerico

Esercizio della presentazione. Nella consegna la resistenza è scritta $4\ \text{mW}$; i dati e il denominatore usano $4\ \text{m}\Omega = 4\cdot 10^{-3}\ \Omega$. Si tiene il milliohm.

$S = 5{,}0\cdot 10^{-2}\ \text{m}^2$, $B$ da $1{,}2\cdot 10^{-3}\ \text{T}$ a $3{,}5\cdot 10^{-3}\ \text{T}$, $\Delta t = 0{,}46\ \text{s}$.

$$\Phi_{B1} = 6{,}0\cdot 10^{-5}\ \text{Wb} \qquad \Phi_{B2} = 17{,}5\cdot 10^{-5}\ \text{Wb}$$

$$\Delta\Phi_B = 11{,}5\cdot 10^{-5}\ \text{Wb}$$

La presentazione calcola il modulo, trascurando il segno:

$$I = \frac{1}{4\cdot 10^{-3}}\cdot\frac{11{,}5\cdot 10^{-5}}{0{,}46} = 62{,}5\ \text{mA}$$

È una corrente media. Il valore $62{,}5\ \text{mA}$ è il risultato di quel calcolo.

## Collegamento con KERS / MGU-K

In frenata il flusso negli avvolgimenti varia in fretta, quindi la f.e.m. indotta può caricare la batteria. Il modello è in [KERS e MGU-K](10-kers-mguk.md).
