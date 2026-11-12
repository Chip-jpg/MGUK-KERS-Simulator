---
id: 10-kers-mguk
titleIT: KERS e MGU-K – recupero dell’energia in frenata
goal: '9'
order: 10
level: approfondimento
---

## In breve

L’MGU-K è la macchina elettrica del recupero di energia cinetica. In frenata lavora da [alternatore](07-alternatore-corrente-alternata.md): la [coppia di Lenz](04-lenz.md) frena e una parte dell’energia cinetica diventa energia elettrica verso la batteria. In accelerazione lavora da [motore](09-motore-elettrico-lorentz.md). La presentazione dell’induzione non descrive questo sistema: quanto segue è il ponte con il laboratorio.

## Formule

Energia cinetica da togliere, ponte di meccanica, non una formula della presentazione:

$$\Delta E_k = \frac12 m\left(v_1^2 - v_2^2\right)$$

A tetto di potenza elettrico per tutta la frenata, l’energia che arriva in batteria è $P_{\max}\,t_f$. Non è $\tfrac12 LI^2$: quella è solo l’[energia magnetica](06-circuito-rl-energia-campo.md) dell’induttore.

## Spiegazione

La f.e.m. di Faraday-Neumann, a circuito chiuso sulla batteria, produce la corrente la cui coppia di Lenz si oppone alla rotazione. Il tetto $P_{\max}$ limita quanta energia elettrica si può mandare in batteria; il resto dell’energia cinetica non è recuperato. Una f.e.m. a vuoto non equivale a quel recupero.

## Esempio numerico

Caso del laboratorio, non un dato della presentazione: $m = 800\ \text{kg}$ (minimo regolamentare 2025 senza carburante, FIA 2025 Technical Regulations Art. 4.1; salvo l’incremento per caldo dell’Art. 4.7, +5 kg in gara se è dichiarato Heat Hazard), da $300$ a $100\ \text{km/h}$ cioè da $300/3{,}6$ a $100/3{,}6\ \text{m/s}$, in $t_f = 3\ \text{s}$.

$$\Delta E_k = \frac12\cdot 800\cdot\left[\left(\frac{300}{3{,}6}\right)^2 - \left(\frac{100}{3{,}6}\right)^2\right] \approx 2{,}47\ \text{MJ}$$

A tetto per tutti i $3\ \text{s}$: con $P_{\max} = 120\ \text{kW}$ arrivano in batteria $0{,}36\ \text{MJ}$; con $P_{\max} = 350\ \text{kW}$ arrivano $1{,}05\ \text{MJ}$. Fonti dei due tetti e della massa: registro `docs/OPEN_FACTS.md` del progetto. Il resto di $\Delta E_k$ non torna in batteria.

## Collegamento con KERS / MGU-K

Recuperare energia che altrimenti diventerebbe calore nei freni è il collegamento con il [Goal 9](11-agenda-2030-goal-9.md). La ripartizione più dettagliata, nel simulatore della vettura, si legge nella [guida alla frenata](15-dinamica-frenata.md).
