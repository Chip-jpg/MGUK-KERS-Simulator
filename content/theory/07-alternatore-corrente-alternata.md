---
id: 07-alternatore-corrente-alternata
titleIT: Alternatore e corrente alternata
order: 7
level: base
---

## In breve

L’alternatore trasforma energia meccanica in energia elettrica. La corrente che produce cambia verso periodicamente: è corrente alternata.

## Formule

La presentazione stampa la tensione sinusoidale, con la resistenza interna del generatore trascurata. $V_0$ è l’ampiezza, non un valore efficace:

$$\text{f.e.m.}(t) \cong v(t) = V_0\sin(\omega t)$$

Per leggere il grafico della spira che ruota si applicano il flusso e Faraday-Neumann all’esperimento della rotazione. Non è una formula stampata accanto al disegno dell’alternatore. Con $B$ e $S$ costanti, rotazione uniforme e $\alpha(0) = 0$:

$$\Phi_B(t) = B\,S\cos(\omega t) \qquad \text{f.e.m.}(t) = N B S \omega \sin(\omega t) \qquad V_0 = N B S \omega$$

In questo modello a due poli, $\omega$ della tensione è la velocità angolare della spira.

## Spiegazione

La f.e.m. è massima quando il flusso passa per zero, perché lì il flusso cambia più in fretta, ed è nulla quando il flusso è massimo. Le frecce meccanica $\to$ elettrica non dicono che la conversione sia integrale, né che l’energia venga accumulata, né che la macchina funzioni da motore. Il disegno non documenta una macchina da competizione.

## Esempio numerico

Nessun alternatore numerico. L’ampiezza da leggere sul grafico è $V_0 = NBS\omega$.

## Collegamento con KERS / MGU-K

In frenata la macchina è usata come alternatore: il rotore riceve lavoro meccanico e una parte dell’energia diventa elettrica verso la batteria. Il verso motore è il [principio inverso](09-motore-elettrico-lorentz.md); i numeri del recupero sono in [KERS e MGU-K](10-kers-mguk.md).
