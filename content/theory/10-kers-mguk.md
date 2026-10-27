---
id: 10-kers-mguk
titleIT: KERS e MGU-K - recupero dell'energia in frenata
slideRefs: [8, 11, 17, 18, 19]
goal: '9'
order: 10
level: approfondimento
---

## In breve

L'**MGU-K** (Motor Generator Unit – Kinetic) è la macchina elettrica collegata al motore di una monoposto di F1; è l'erede del **KERS** (Kinetic Energy Recovery System). In **frenata** funziona da **generatore**: è un [alternatore](07-alternatore-corrente-alternata.md) e la [coppia di Lenz](04-lenz.md) frena l'auto mentre la sua energia cinetica diventa energia elettrica per la batteria. In **accelerazione** funziona da **motore**: la batteria fornisce corrente e la [forza di Lorentz](09-motore-elettrico-lorentz.md) produce coppia. Il recupero è limitato soprattutto dalla **potenza massima**: il resto dell'energia finisce in calore nei freni a disco.

## Formule

Energia cinetica da smaltire in una frenata da $v_1$ a $v_2$:

$$\Delta E_k = \frac{1}{2}\,m\left(v_1^2 - v_2^2\right)$$

$P_{\max}$ è il limite sulla potenza **elettrica** dell'MGU-K (quella che arriva alla batteria): con rendimento $\eta$, la potenza meccanica che l'MGU-K può assorbire dalla frenata è al massimo $P_{\max}/\eta$:

$$P_{\text{MGU-K}}(t) = \min\!\left(P_{\text{frenata}}(t),\ \frac{P_{\max}}{\eta}\right)$$

Energia accumulata in batteria in una frenata di durata $t_f$, ed energia dissipata (calore nei freni a disco + perdite Joule dell'MGU-K e del convertitore):

$$E_{\text{rec}} = \eta \int_0^{t_f} P_{\text{MGU-K}}\, dt \le P_{\max}\, t_f \qquad E_{\text{diss}} = \Delta E_k - E_{\text{rec}}$$

Potenza media richiesta dalla frenata: $\bar P = \Delta E_k / t_f$. Tempo per recuperare tutta $\Delta E_k$ alla potenza massima: $t = \eta\, \Delta E_k / P_{\max}$.

## Spiegazione

**Frenata = alternatore + Lenz.** Le ruote fanno girare il rotore a magneti: il flusso negli avvolgimenti varia, nasce una f.e.m. ([Faraday-Neumann](03-faraday-neumann.md)) e la corrente indotta, inviata alla batteria, genera una coppia opposta alla rotazione. **Accelerazione = motore + Lorentz.** La batteria invia corrente agli avvolgimenti e la coppia elettrica si somma a quella del motore termico.

**Modello semplificato.** Fisicamente l'MGU-K è una macchina **trifase**, generalmente descritta come **sincrona a magneti permanenti** (PMSM), comandata da un inverter; la spira singola rotante delle slide è un **modello semplificato** dello stesso principio. Il tipo esatto di macchina scelto dai costruttori non è pubblico (Fonte: [Silicon Chip, "The 2024 Formula 1 Power Unit"](https://siliconchip.com.au/Issue/2024/May/The+2024+Formula+1+Power+Unit)) [DA VERIFICARE].

**Perché il recupero è limitato dalla potenza.** Una frenata forte dura pochi secondi ma dissipa milioni di joule: servono centinaia di kilowatt. L'MGU-K non può inviare alla batteria più di $P_{\max}$ di potenza elettrica (limite di regolamento, ma anche di dimensioni della macchina, corrente nella batteria e calore Joule $R\,i^2$ negli avvolgimenti), quindi assorbe meccanicamente al massimo $P_{\max}/\eta$: la parte eccedente va ai **freni a disco**, che la trasformano in calore. Anche della potenza assorbita una parte si perde in calore nell'MGU-K (rendimento $\eta < 1$).

**Numeri del regolamento.**

- Fino al 2025: MGU-K massimo **120 kW**; al massimo **2 MJ per giro** dall'MGU-K alla batteria e **4 MJ per giro** dalla batteria all'MGU-K. Fonte: [FIA, Formula One Power Unit Regulations 2014 (leaflet)](https://www.fia.com/sites/default/files/publication/file/FIA%20F1%20Power%20Unit%20leaflet.pdf); [Honda, Powertrain MGU-H / MGU-K](https://global.honda/en/tech/motorsports/Formula-1/Powertrain_MGU-H_MGU-K/).
- Dal 2026: MGU-K fino a circa **350 kW**, MGU-H eliminata. Fonte: [Formula 1, "7 things you need to know about the 2026 F1 engine regulations"](https://www.formula1.com/en/latest/article/more-efficient-less-fuel-and-carbon-net-zero-7-things-you-need-to-know-about.ZhtzvU3cPCv8QO7jtFxQR).
- Energia recuperabile per giro nel 2026: **circa 7–9 MJ** secondo fonti secondarie, variabile per evento e sessione [DA VERIFICARE]. Fonte: [Honda, 2026 Regulations Overview](https://global.honda/en/F1/features/2026_Commentary/regulations/); [PlanetF1](https://www.planetf1.com/news/fia-miami-gp-energy-recharge-rules-no-reduction-update-clarification).
- Massa minima 2026: **768 kg** = 722 kg (auto + pilota, senza carburante) + 46 kg di pneumatici stimati. Fonte: [FIA, comunicato sui regolamenti 2026](https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond); [Formula 1, "FIA unveils Formula 1 regulations for 2026 and beyond"](https://www.formula1.com/en/latest/article/fia-unveils-formula-1-regulations-for-2026-and-beyond-featuring-more-agile.75qJiYOHXgeJqsVQtDr2UB).

## Esempio numerico

Massa $m = 800\ \text{kg}$: **valore tondo illustrativo, non la massa regolamentare**. Frenata da $300$ a $100$ km/h, cioè da $83{,}33$ a $27{,}78$ m/s, in $t_f = 3\ \text{s}$ (durata ipotetica).

$$\Delta E_k = \tfrac12 \cdot 800 \cdot \left(83{,}33^2 - 27{,}78^2\right) \approx 2{,}47 \cdot 10^6\ \text{J} = 2{,}47\ \text{MJ}$$

$$\bar P = \frac{2{,}47\ \text{MJ}}{3\ \text{s}} \approx 820\ \text{kW}$$

Con decelerazione costante la potenza di frenata scende da circa $1{,}23$ MW a $0{,}41$ MW, sempre sopra il tetto meccanico $P_{\max}/\eta$: l'MGU-K lavora a potenza massima per tutti i 3 s. Con un rendimento illustrativo $\eta = 0{,}9$:

- Con $P_{\max} = 120\ \text{kW}$: assorbiti meccanicamente $\tfrac{120\ \text{kW}}{0{,}9}\cdot 3\ \text{s} \approx 0{,}40\ \text{MJ}$; in batteria $E_{\text{rec}} = 120\ \text{kW}\cdot 3\ \text{s} = 0{,}36\ \text{MJ}$ (circa $15\%$); perdite MGU-K circa $0{,}04$ MJ; ai freni circa $2{,}07$ MJ.
- Con $P_{\max} = 350\ \text{kW}$: in batteria $E_{\text{rec}} = 1{,}05\ \text{MJ}$ (circa $43\%$); perdite MGU-K circa $0{,}12$ MJ; ai freni circa $1{,}30$ MJ.

Per recuperare tutti i 2,47 MJ a 120 kW servirebbero $t = 0{,}9 \cdot 2{,}47\ \text{MJ} / 120\ \text{kW} \approx 18{,}5\ \text{s}$ di frenata. Il modello trascura resistenza aerodinamica e attriti, che nella realtà dissipano anch'essi una parte dell'energia.

## Collegamento con KERS / MGU-K

Catena: [flusso](01-flusso-campo-magnetico.md) che varia → f.e.m. → corrente → coppia di Lenz (frenata); al contrario, corrente → forza di Lorentz (spinta). Il bilancio energetico è lo stesso del [circuito RL](06-circuito-rl-energia-campo.md): energia in ingresso = energia utile + calore. Il collegamento con l'efficienza e l'innovazione è in [Agenda 2030, Goal 9](11-agenda-2030-goal-9.md).

## Domande da interrogazione

**D:** Che cosa fa l'MGU-K in frenata e in accelerazione?

**R:** In frenata è un generatore: la rotazione induce corrente che carica la batteria e la coppia di Lenz rallenta l'auto. In accelerazione è un motore: la corrente della batteria produce, tramite la forza di Lorentz, una coppia che spinge l'auto.

**D:** Calcola l'energia cinetica da smaltire tra 300 e 100 km/h con $m = 800$ kg.

**R:** $\Delta E_k = \tfrac12 \cdot 800\,(83{,}33^2 - 27{,}78^2) \approx 2{,}47$ MJ. La massa è un valore illustrativo.

**D:** Perché l'MGU-K non recupera tutta l'energia della frenata?

**R:** Perché la frenata richiede centinaia di kW per pochi secondi, mentre l'MGU-K può inviare alla batteria al massimo $P_{\max}$ di potenza elettrica (120 kW fino al 2025): in 3 s solo 0,36 MJ in batteria (circa il 15 %). Il resto va in calore nei freni a disco (circa 2,07 MJ) e in perdite Joule dell'MGU-K (circa 0,04 MJ).

**D:** La spira delle slide è un buon modello dell'MGU-K?

**R:** Per il principio sì, ma è semplificato: la macchina reale è trifase, con magneti permanenti e inverter. Il principio fisico, cioè Faraday-Neumann, Lenz e Lorentz, è lo stesso.
