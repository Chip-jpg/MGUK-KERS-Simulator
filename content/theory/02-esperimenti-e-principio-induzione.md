---
id: 02-esperimenti-e-principio-induzione
titleIT: Esperimenti e principio dell’induzione elettromagnetica
order: 2
level: base
---

## In breve

Quattro esperimenti portano alla stessa conclusione: c’è corrente indotta quando varia il numero di linee di $\vec B$ che attraversano la superficie del circuito, cioè quando varia il [flusso](01-flusso-campo-magnetico.md) $\Phi_B$.

## Formule

$$\Phi_B = B\,S\cos\alpha$$

$$\frac{\Delta\Phi_B}{\Delta t} \neq 0 \;\Longrightarrow\; \text{corrente indotta nel circuito chiuso}$$

La forma quantitativa è la [legge di Faraday-Neumann](03-faraday-neumann.md).

## Spiegazione

**Esperimento 1.** Una spira si sposta con velocità perpendicolare a $\vec B$ ed entra o esce dalla regione tra i poli: cambia l’area immersa. Se la spira resta tutta dentro un campo uniforme costante, il flusso non cambia e non c’è corrente indotta.

**Esperimento 2.** La spira ruota con velocità angolare $\omega$: cambia l’orientamento e quindi il flusso. Qui non c’è ancora una formula sinusoidale.

**Esperimento 3.** Un magnete si avvicina o si allontana da una bobina: cambia $B$ e il verso della corrente si inverte. Il verso è la [legge di Lenz](04-lenz.md).

**Esperimento 4.** Due bobine su un anello ferromagnetico. Alla chiusura dell’interruttore del primario la corrente primaria varia, il campo varia e nel secondario, non alimentato, compare una corrente. A corrente primaria costante l’induzione cessa. È un transitorio, non un capitolo a parte.

## Esempio numerico

Nessun numero nuovo. Il caso limite dell’esperimento 1 è già quantitativo in senso logico: area immersa costante e $B$ uniforme costante danno $\Delta\Phi_B = 0$.

## Collegamento con KERS / MGU-K

La frenata rigenerativa è l’esperimento 2 applicato a una macchina che gira: il flusso concatenato varia e, a circuito chiuso sulla batteria, nasce corrente. Dettaglio nel [modello KERS / MGU-K](10-kers-mguk.md).
