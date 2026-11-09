---
id: 06-circuito-rl-energia-campo
titleIT: Circuito RL ed energia del campo magnetico
order: 6
level: base
---

## In breve

Alla chiusura di un circuito con resistenza $R$ e induttanza $L$ in serie a un generatore in continua, la corrente totale cresce con l’esponenziale di chiusura. Una parte dell’energia del generatore scalda la resistenza; un’altra resta nel campo magnetico.

## Formule

$$i(t) = I_0\left(1 - e^{-(R/L)\,t}\right) \qquad I_0 = \frac{\text{f.e.m.}}{R}$$

Valida con f.e.m. costante, $R$ e $L$ costanti e $i(0) = 0$. A regime $i = I_0$. Durante il transitorio non vale $i = \text{f.e.m.}/R$.

Bilancio incrementale stampato, in joule:

$$\text{f.e.m.}\cdot i\cdot\Delta t = R\,i^2\cdot\Delta t + L\frac{\Delta i}{\Delta t}\cdot i\cdot\Delta t$$

Il risultato di quella somma, da $0$ a $I_0$, è l’energia del campo magnetico:

$$U_M = \frac12 L I_0^2$$

$I_0$ è la corrente finale di questo circuito. L’etichetta «massima» indica quel valore finale, non un massimo di una corrente alternata.

## Spiegazione

La corrente $i(t)$ della formula è la corrente totale, quella che parte da zero e arriva a $I_0$. Il termine transitorio opposto è la descrizione di chiusura. Una didascalia della presentazione chiama quel termine «di apertura»: non va seguita, e la presentazione non stampa una formula di apertura.

$U_M$ è l’energia magnetica di un induttore lineare. Non è la carica di una batteria, non è l’energia cinetica e non è l’energia recuperata da un KERS.

## Esempio numerico

Nessun circuito numerico. In simboli: per $t$ grande, $i \to I_0$ e l’energia magnetica si avvicina a $\tfrac12 L I_0^2$, che resta positiva se $L > 0$.

## Collegamento con KERS / MGU-K

Lo schema «energia in ingresso = calore + energia accumulata» è solo un’analogia con la frenata. In frenata l’energia che arriva in batteria non è $\tfrac12 LI^2$. Il conto del laboratorio è in [KERS e MGU-K](10-kers-mguk.md).
