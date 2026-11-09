---
id: 05-autoinduzione-induttanza
titleIT: Autoinduzione e induttanza
order: 5
level: base
---

## In breve

C’è autoinduzione quando il circuito induttore e il circuito indotto coincidono: una corrente variabile induce una f.e.m. nello stesso circuito. L’induttanza $L$ misura quel legame.

## Formule

Nella definizione, $\Phi_B$ è il flusso concatenato $\lambda$, non il flusso di una sola spira da moltiplicare poi un’altra volta per $N$:

$$L = \frac{\lambda}{i} \qquad 1\ \text{H} = \frac{1\ \text{Wb}}{1\ \text{A}} = \frac{1\ \text{V}\cdot\text{s}}{1\ \text{A}} = \frac{1\ \text{V}}{1\ \text{A/s}}$$

Con $L$ costante:

$$\text{f.e.m.} = -\frac{\Delta\lambda}{\Delta t} = -\frac{\Delta(Li)}{\Delta t} = -L\frac{\Delta i}{\Delta t} \qquad \text{f.e.m.} = -L\frac{di}{dt}$$

Solenoide lungo, in aria, nucleo lineare, campo interno trattato come uniforme. $\mu_0$ è la permeabilità del vuoto, non quella di un mezzo qualunque; $L$ non dipende dalla corrente solo finché il nucleo è lineare:

$$L = \mu_0\frac{N^2 S}{\ell} \qquad \mu_0 = 4\pi\cdot 10^{-7}\ \text{H/m}$$

Il fattore $N^2$ è il prodotto unico tra il campo, proporzionale a $N$, e il concatenamento con $N$ spire.

## Spiegazione

Le due frecce, corrente del generatore e corrente indotta, sono una sovrapposizione disegnata, non due correnti indipendenti nello stesso filo. Il segno meno è ancora la [legge di Lenz](04-lenz.md): la f.e.m. autoindotta si oppone alla variazione di corrente. Il simbolo grafico può indicare l’autoinduzione del circuito oppure un solenoide in serie. La permeabilità relativa di un nucleo, nel simulatore, è un’estensione lineare: non è la formula della presentazione.

## Esempio numerico

Nessun solenoide numerico. Il controllo è l’identità del henry: $1\ \text{H} = 1\ \text{Wb}/1\ \text{A}$.

## Collegamento con KERS / MGU-K

L’energia $\tfrac12 LI^2$ di questa induttanza è energia del campo magnetico, non l’energia accumulata in batteria durante la frenata. Il bilancio è nel [circuito RL](06-circuito-rl-energia-campo.md).
