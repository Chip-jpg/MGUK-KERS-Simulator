---
id: 07-alternatore-corrente-alternata
titleIT: Alternatore e corrente alternata
slideRefs: [18, 19, 21]
order: 7
level: base
---

## In breve

L'**alternatore** trasforma energia meccanica in energia elettrica: una bobina di $N$ spire ruota con velocità angolare costante $\omega$ in un campo magnetico uniforme (o, equivalentemente, un magnete ruota dentro bobine fisse). Il flusso varia come un coseno e la f.e.m. indotta è **sinusoidale**: $\text{f.e.m.}(t) = V_0 \sin(\omega t)$ (slide 18–19). La corrente che ne risulta cambia verso periodicamente: è la **corrente alternata** (AC).

## Formule

Flusso attraverso una spira che ruota (angolo $\alpha = \omega t$):

$$\Phi_B(t) = B\,S\cos(\omega t)$$

F.e.m. indotta in $N$ spire (Faraday-Neumann in forma istantanea):

$$\text{f.e.m.}(t) = -N\,\frac{d\Phi_B}{dt} = N B S \omega \sin(\omega t) = V_0 \sin(\omega t)$$

$$V_0 = N B S \omega \qquad \omega = 2\pi f = \frac{2\pi}{T}$$

Valore efficace (approfondimento): $V_{\text{eff}} = V_0/\sqrt{2}$.

## Spiegazione

**Da dove viene il seno.** Il flusso è massimo quando il piano della spira è perpendicolare a $\vec B$ e nullo quando è parallelo. Derivando $\cos(\omega t)$ si ottiene $-\omega\sin(\omega t)$, e il segno meno di [Faraday-Neumann](03-faraday-neumann.md) lo rende positivo. Risultato importante: **la f.e.m. è massima quando il flusso è nullo** (lì il flusso cambia più rapidamente) e nulla quando il flusso è massimo.

**Cosa fa aumentare $V_0$:** più spire, campo più intenso, spira più grande, rotazione più veloce. La frequenza della tensione coincide con quella di rotazione (nel modello a due poli).

**Alternatore e dinamo (slide 21).** L'alternatore fornisce corrente **alternata** (AC). La dinamo è la stessa macchina con un **collettore a lamelle** che inverte i collegamenti ogni mezzo giro: la tensione in uscita ha sempre lo stesso segno, cioè corrente **continua** (DC), anche se pulsante. Nelle centrali elettriche si usano alternatori: la turbina (a vapore, idraulica, eolica) fa ruotare il rotore e l'energia viene poi trasportata con i [trasformatori](08-trasformatore-trasporto-joule.md).

**Lenz anche qui.** Se l'alternatore eroga corrente, nella bobina circola corrente e il campo esercita una coppia che si oppone alla rotazione ([legge di Lenz](04-lenz.md)): per mantenere $\omega$ costante la turbina deve fornire lavoro. Più potenza elettrica si preleva, più è "dura" da far girare.

## Esempio numerico

$N = 100$, $B = 0{,}20\ \text{T}$, $S = 1{,}0\cdot10^{-2}\ \text{m}^2$, frequenza $f = 50\ \text{Hz}$:

$$\omega = 2\pi \cdot 50 \approx 314\ \text{rad/s}$$

$$V_0 = 100 \cdot 0{,}20 \cdot 1{,}0\cdot10^{-2} \cdot 314 \approx 63\ \text{V} \qquad V_{\text{eff}} \approx \frac{63}{\sqrt 2} \approx 44\ \text{V}$$

Raddoppiando la velocità di rotazione raddoppia anche $V_0$.

## Collegamento con KERS / MGU-K

In frenata l'MGU-K è un alternatore: il rotore, collegato meccanicamente al motore e quindi alle ruote, gira e induce f.e.m. alternate negli avvolgimenti dello statore. Un convertitore elettronico (inverter) le trasforma in continua per caricare la batteria. **Attenzione:** la macchina reale è **trifase** (tre gruppi di avvolgimenti sfasati di 120°), con magneti permanenti sul rotore; la spira singola delle slide è un modello semplificato dello stesso principio. Vedi [Motore elettrico](09-motore-elettrico-lorentz.md) e [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Ricava la f.e.m. di una spira che ruota in un campo uniforme.

**R:** $\Phi_B = BS\cos(\omega t)$; con $N$ spire $\text{f.e.m.} = -N\,d\Phi_B/dt = NBS\omega\sin(\omega t) = V_0\sin(\omega t)$.

**D:** In quale posizione della spira la f.e.m. è massima?

**R:** Quando il piano della spira è parallelo al campo: il flusso è nullo ma varia nel modo più rapido.

**D:** Che differenza c'è tra alternatore e dinamo?

**R:** L'alternatore produce corrente alternata. La dinamo, grazie al collettore a lamelle che inverte i contatti ogni mezzo giro, produce corrente continua.

**D:** Perché un alternatore che eroga corrente è più difficile da far girare?

**R:** Per la legge di Lenz la corrente indotta genera una coppia opposta alla rotazione: l'energia elettrica prodotta viene dal lavoro meccanico fatto contro questa coppia.
