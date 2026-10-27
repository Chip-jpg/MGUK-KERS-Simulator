---
id: 06-circuito-rl-energia-campo
titleIT: Circuito RL ed energia del campo magnetico
slideRefs: [15, 16, 17]
order: 6
level: base
---

## In breve

In un circuito con un generatore, una resistenza $R$ e un'induttanza $L$, alla chiusura dell'interruttore la corrente **non sale di colpo**: l'[autoinduzione](05-autoinduzione-induttanza.md) la frena e la fa crescere con legge esponenziale (extracorrente di chiusura, slide 15). Parte dell'energia del generatore diventa calore nella resistenza (effetto Joule), parte resta **immagazzinata nel campo magnetico**: $U_M = \tfrac12 L I_0^2$ (slide 16–17).

## Formule

Corrente alla chiusura (slide 15), con $I_0 = \text{f.e.m.}/R$ e costante di tempo $\tau = L/R$:

$$i(t) = I_0\left(1 - e^{-\frac{R}{L}t}\right) = I_0\left(1 - e^{-t/\tau}\right)$$

Bilancio energetico in un intervallo $\Delta t$ (slide 16):

$$\text{f.e.m.}\cdot i\,\Delta t = R\,i^2\,\Delta t + L\,i\,\Delta i$$

Energia immagazzinata nel campo magnetico (slide 17):

$$U_M = \frac{1}{2}\,L\,I_0^2$$

## Spiegazione

**Perché l'esponenziale.** Per la legge delle maglie: $\text{f.e.m.} - L\,\Delta i/\Delta t = R\,i$. All'inizio $i = 0$: tutta la f.e.m. del generatore serve a "vincere" l'autoinduzione e la corrente cresce rapidamente. Man mano che $i$ aumenta, cresce la caduta $Ri$, resta meno tensione per far crescere la corrente e la crescita rallenta. A regime $\Delta i/\Delta t = 0$ e $i = I_0 = \text{f.e.m.}/R$, come se l'induttanza non ci fosse.

**La costante di tempo** $\tau = L/R$ (in secondi) dice quanto è "lento" il circuito: dopo $t = \tau$ la corrente è al $63{,}2\%$ di $I_0$, dopo $5\tau$ è oltre il $99\%$.

**Lettura del bilancio.** Moltiplicando la legge delle maglie per $i\,\Delta t$: a sinistra l'energia fornita dal generatore; a destra il **calore Joule** $R\,i^2\Delta t$ e il termine $L\,i\,\Delta i$, che è energia **non persa** ma accumulata nel campo. Sommando i contributi $L\,i\,\Delta i$ da $0$ a $I_0$ si ottiene l'area di un triangolo nel grafico $L\,i$ in funzione di $i$: $\tfrac12 L I_0^2$.

**Dove va questa energia all'apertura?** Il campo scompare e l'energia viene restituita al circuito (extracorrente di apertura): per questo un'induttanza può produrre scintille. Approfondimento: l'energia per unità di volume del campo è $u = B^2/(2\mu_0)$.

## Esempio numerico

$\text{f.e.m.} = 12\ \text{V}$, $R = 4{,}0\ \Omega$, $L = 0{,}20\ \text{H}$.

$$I_0 = \frac{12}{4{,}0} = 3{,}0\ \text{A} \qquad \tau = \frac{0{,}20}{4{,}0} = 0{,}050\ \text{s}$$

$$i(\tau) = 3{,}0\,(1 - e^{-1}) \approx 1{,}9\ \text{A} \qquad U_M = \tfrac12 \cdot 0{,}20 \cdot 3{,}0^2 = 0{,}90\ \text{J}$$

A regime il generatore eroga $12 \cdot 3{,}0 = 36\ \text{W}$, che diventano tutti calore Joule in $R$: l'energia del campo non cresce più.

## Collegamento con KERS / MGU-K

Il bilancio "energia fornita = Joule + energia accumulata" è lo stesso schema che usiamo per la frenata: energia cinetica = energia recuperata + perdite (Joule negli avvolgimenti, calore nei freni). Le perdite $R\,i^2$ crescono con il quadrato della corrente: anche per questo i sistemi ibridi lavorano a tensioni alte e correnti più basse. Vedi [KERS e MGU-K](10-kers-mguk.md) e [Trasformatore ed effetto Joule](08-trasformatore-trasporto-joule.md).

## Domande da interrogazione

**D:** Come varia la corrente alla chiusura di un circuito RL?

**R:** Cresce secondo $i(t) = I_0(1 - e^{-Rt/L})$, tendendo a $I_0 = \text{f.e.m.}/R$. L'autoinduzione impedisce un salto istantaneo.

**D:** Che significato ha la costante di tempo $\tau = L/R$?

**R:** È il tempo dopo cui la corrente raggiunge circa il $63\%$ del valore finale; dopo circa $5\tau$ il transitorio è praticamente finito.

**D:** Spiega il bilancio $\text{f.e.m.}\cdot i\,\Delta t = R\,i^2\Delta t + L\,i\,\Delta i$.

**R:** L'energia fornita dal generatore in $\Delta t$ si divide tra calore Joule nella resistenza e energia accumulata nel campo magnetico dell'induttanza.

**D:** Quanta energia è immagazzinata in un'induttanza?

**R:** $U_M = \tfrac12 L I_0^2$: si ottiene sommando i termini $L\,i\,\Delta i$ mentre la corrente sale da 0 a $I_0$ (area di un triangolo).
