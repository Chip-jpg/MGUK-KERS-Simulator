---
id: 03-faraday-neumann
titleIT: Legge di Faraday-Neumann
order: 3
level: base
---

## In breve

La **legge di Faraday-Neumann** dà la misura dell'induzione: la forza elettromotrice indotta (f.e.m.) in un circuito è uguale, cambiata di segno, alla **rapidità con cui varia il flusso** magnetico. Più il flusso cambia velocemente, più grande è la f.e.m.; dividendo per la resistenza si ottiene la corrente indotta.

## Formule

F.e.m. "di movimento" di una sbarretta di lunghezza $l$ che si muove con velocità $v$ perpendicolare a $B$:

$$\text{f.e.m.} = B \cdot l \cdot v$$

Legge di Faraday-Neumann, per una spira; con $N$ spire si moltiplica per $N$:

$$\text{f.e.m.} = -\frac{\Delta \Phi_B}{\Delta t} \qquad \text{f.e.m.} = -N\,\frac{\Delta \Phi_B}{\Delta t}$$

Corrente indotta in un circuito di resistenza $R$:

$$i = \frac{\text{f.e.m.}}{R} = -\frac{1}{R}\,\frac{\Delta \Phi_B}{\Delta t}$$

Forma istantanea (differenziale):

$$\text{f.e.m.}(t) = -\frac{d\Phi_B}{dt} \qquad i(t) = -\frac{1}{R}\,\frac{d\Phi_B}{dt}$$

Unità: $1\ \text{Wb/s} = 1\ \text{V}$.

## Spiegazione

**Da dove viene $Blv$.** Una sbarretta scorre su due binari chiusi da un filo. In un tempo $\Delta t$ percorre $v\,\Delta t$ e l'area del circuito aumenta di $\Delta S = l\,v\,\Delta t$. Il flusso aumenta di $\Delta\Phi_B = B\,l\,v\,\Delta t$, e dividendo per $\Delta t$ si ritrova $\text{f.e.m.} = Blv$: la f.e.m. di movimento è un caso particolare di Faraday-Neumann.

**Il segno meno** non cambia il valore ma il verso: la f.e.m. si oppone alla variazione di flusso. È la [legge di Lenz](04-lenz.md), che va sempre detta insieme a questa.

**Rapporto incrementale e derivata.** $\Delta\Phi_B/\Delta t$ è la variazione media nell'intervallo; facendo tendere $\Delta t$ a zero si ottiene la derivata $d\Phi_B/dt$, cioè la f.e.m. istante per istante. È la forma che serve per la [spira rotante](07-alternatore-corrente-alternata.md), dove il flusso varia come un coseno.

**Cosa aumenta la f.e.m.:** campo più intenso, area più grande, più spire, variazione più rapida. Per questo i generatori veri girano veloci e hanno molte spire.

## Esempio numerico

Esercizio tipo: $S = 5{,}0 \cdot 10^{-2}\ \text{m}^2$, il campo passa da $1{,}2 \cdot 10^{-3}\ \text{T}$ a $3{,}5 \cdot 10^{-3}\ \text{T}$ in $\Delta t = 0{,}46\ \text{s}$, $R = 4\ \text{m}\Omega$.

$$\Delta\Phi_B = S\,\Delta B = 5{,}0 \cdot 10^{-2} \cdot 2{,}3 \cdot 10^{-3} = 1{,}15 \cdot 10^{-4}\ \text{Wb}$$

$$|\text{f.e.m.}| = \frac{1{,}15 \cdot 10^{-4}}{0{,}46} = 2{,}5 \cdot 10^{-4}\ \text{V}$$

$$I = \frac{2{,}5 \cdot 10^{-4}\ \text{V}}{4 \cdot 10^{-3}\ \Omega} = 6{,}25 \cdot 10^{-2}\ \text{A} = 62{,}5\ \text{mA}$$

Una f.e.m. piccolissima dà comunque una corrente apprezzabile perché la resistenza è molto bassa.

## Collegamento con KERS / MGU-K

In frenata le ruote fanno girare velocemente il rotore dell'MGU-K: $d\Phi_B/dt$ è grande, quindi la f.e.m. indotta è grande e la corrente può caricare la batteria. Velocità di rotazione alta significa f.e.m. alta: è il motivo per cui la macchina elettrica gira molto più veloce delle ruote. Vedi [KERS e MGU-K](10-kers-mguk.md).
