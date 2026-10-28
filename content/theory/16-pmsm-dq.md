---
id: 16-pmsm-dq
titleIT: Macchina sincrona a magneti permanenti – modello d-q
slideRefs: [18, 19]
order: 16
level: approfondimento
---

## In breve

La spira delle slide 18–19 è un modello monofase. Una macchina reale è **trifase**: tre avvolgimenti sfasati di 120° producono un campo che ruota insieme al rotore a magneti. Guardando le correnti «dal rotore» (assi **d** e **q**) le grandezze sinusoidali diventano **costanti**: la macchina si studia come un circuito in continua. Questo modello spiega perché coppia e recupero sono limitati da **corrente**, **tensione** e quindi **potenza**.

## Formule

Tensioni a regime (motore, $\omega_e = p\,\omega_m$, $p$ = coppie polari):

$$v_d = R_s i_d - \omega_e L_q i_q \qquad v_q = R_s i_q + \omega_e L_d i_d + \omega_e \psi_m$$

Coppia e bilancio di potenza:

$$T = \tfrac{3}{2}\,p\,\big[\psi_m i_q + (L_d - L_q)\,i_d i_q\big] \qquad \tfrac{3}{2}(v_d i_d + v_q i_q) = T\,\omega_m + \tfrac{3}{2} R_s (i_d^2 + i_q^2)$$

Limiti dell’inverter (cerchio di corrente ed ellisse di tensione):

$$\sqrt{i_d^2 + i_q^2} \le I_{\max} \qquad \sqrt{v_d^2 + v_q^2} \le V_{\max} = \frac{V_{DC}}{\sqrt{3}}$$

## Spiegazione

**Dalla spira alla macchina trifase.** A correnti nulle $|v| = \omega_e \psi_m$: è la f.e.m. di picco $V_0 = NBS\omega$ dell’[alternatore](07-alternatore-corrente-alternata.md) con $\psi_m = NBS$. La coppia nasce dalla forza di Lorentz sui conduttori ([motore](09-motore-elettrico-lorentz.md)): la corrente $i_q$, in quadratura con il flusso dei magneti, è quella «utile».

**MTPA.** Con $L_d < L_q$ una piccola $i_d$ negativa aggiunge coppia di riluttanza: la curva _massima coppia per ampere_ sceglie, a ogni $|I|$, l’angolo migliore. Se $L_d = L_q$ si ha semplicemente $i_d = 0$.

**Deflussaggio.** La tensione cresce con la velocità. Oltre la **velocità base** l’ellisse di tensione si stringe e taglia il cerchio: serve $i_d < 0$ per indebolire il flusso dei magneti, la coppia massima cala e la potenza resta circa costante.

**Frenata.** Con $i_q < 0$ la coppia si oppone al moto (Lenz): $T\omega_m < 0$ e l’inverter manda potenza alla batteria, meno le perdite nel rame.

## Esempio numerico

Macchina illustrativa (non l’MGU-K): $\psi_m = 0{,}10\ \text{Wb}$, $p = 4$, $L_d = L_q$, $R_s = 0{,}020\ \Omega$, $i_d = 0$, $i_q = 300\ \text{A}$, $n = 4000$ giri/min ($\omega_m = 418{,}9\ \text{rad/s}$):

$$T = 1{,}5 \cdot 4 \cdot 0{,}10 \cdot 300 = 180\ \text{N}\cdot\text{m} \qquad P_{\text{mecc}} = 180 \cdot 418{,}9 \approx 75{,}4\ \text{kW}$$

$$P_{\text{Cu}} = 1{,}5 \cdot 0{,}020 \cdot 300^2 = 2{,}7\ \text{kW} \qquad \eta \approx \frac{75{,}4}{78{,}1} \approx 96{,}5\ \%$$

Con $V_{DC} = 600\ \text{V}$ e $I_{\max} = 400\ \text{A}$ la velocità base è circa 5750 giri/min.

## Collegamento con KERS / MGU-K

L’MGU-K è una macchina trifase, generalmente descritta come sincrona a magneti permanenti (tipo e dati reali non pubblici, [DA VERIFICARE]). Questo modello è quindi **rappresentativo**, non il progetto reale. Mostra però perché il recupero in frenata è limitato: coppia massima e potenza dipendono da $I_{\max}$, $V_{DC}$ e dalla velocità, oltre al limite di regolamento. Vedi [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Che cosa sono gli assi d e q?

**R:** Sono due assi solidali al rotore: d lungo il flusso dei magneti, q a 90° elettrici. Visti da lì, le correnti trifase sinusoidali diventano due valori costanti.

**D:** Perché sopra la velocità base la coppia massima diminuisce?

**R:** La tensione indotta cresce con $\omega$ e l’inverter ha una tensione massima: bisogna usare $i_d < 0$ per indebolire il flusso, lasciando meno corrente per $i_q$. La potenza resta circa costante.

**D:** Come cambia il segno delle grandezze in frenata?

**R:** $i_q$ diventa negativa, la coppia si oppone alla rotazione e la potenza meccanica è negativa: la macchina fa da generatore e la batteria riceve potenza meno le perdite Joule.

**D:** Che legame c’è con la spira delle slide?

**R:** A vuoto l’ampiezza della tensione di fase è $\omega_e\psi_m$, la stessa forma di $V_0 = NBS\omega$ con $\psi_m = NBS$.
