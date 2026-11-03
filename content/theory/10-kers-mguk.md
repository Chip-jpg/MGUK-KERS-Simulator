---
id: 10-kers-mguk
titleIT: KERS e MGU-K – recupero dell’energia in frenata
goal: '9'
order: 10
level: approfondimento
---

## In breve

L'**MGU-K** (Motor Generator Unit – Kinetic) è la macchina elettrica collegata al motore di una monoposto di F1, erede del **KERS** (Kinetic Energy Recovery System). In **frenata** è un **generatore** ([alternatore](07-alternatore-corrente-alternata.md)): la [coppia di Lenz](04-lenz.md) frena l'auto e l'energia cinetica diventa energia elettrica per la batteria. In **accelerazione** è un **motore**: la corrente della batteria produce coppia tramite la [forza di Lorentz](09-motore-elettrico-lorentz.md). Il recupero è limitato dalla **potenza massima**: il resto finisce in calore nei freni a disco.

## Formule

Energia cinetica da smaltire in una frenata da $v_1$ a $v_2$:

$$\Delta E_k = \frac{1}{2}\,m\left(v_1^2 - v_2^2\right)$$

$P_{\max}$ è il tetto **elettrico** assunto nel modello D8 (nel 2025 il testo FIA non chiarisce se i 120 kW siano prima o dopo la correzione fissa): con rendimento $\eta$, la potenza meccanica che l'MGU-K può assorbire dalla frenata è al massimo $P_{\max}/\eta$:

$$P_{\text{MGU-K}}(t) = \min\!\left(P_{\text{frenata}}(t),\ \frac{P_{\max}}{\eta}\right)$$

Energia accumulata in batteria in una frenata di durata $t_f$, ed energia dissipata (calore nei freni a disco + perdite Joule dell'MGU-K e del convertitore):

$$E_{\text{rec}} = \eta \int_0^{t_f} P_{\text{MGU-K}}\, dt \le P_{\max}\, t_f \qquad E_{\text{diss}} = \Delta E_k - E_{\text{rec}}$$

Potenza media richiesta dalla frenata: $\bar P = \Delta E_k / t_f$. Tempo per assorbire tutta $\Delta E_k$ alla potenza massima (in batteria ne arriva solo $\eta\,\Delta E_k$): $t = \eta\, \Delta E_k / P_{\max}$.

## Spiegazione

**Frenata = alternatore + Lenz.** Le ruote fanno girare il rotore: il flusso negli avvolgimenti varia, nasce una f.e.m. ([Faraday-Neumann](03-faraday-neumann.md)) e la corrente indotta, inviata alla batteria, genera una coppia opposta alla rotazione. **Accelerazione = motore + Lorentz.** La corrente della batteria produce una coppia che si somma a quella del motore termico.

**Batteria finita nel laboratorio.** La carica è il rapporto tra energia disponibile e capacità: $\mathrm{SoC}=E_{\mathrm{batt}}/E_{\mathrm{cap}}$. In accelerazione l'energia della batteria diminuisce; in frenata aumenta, con perdite di conversione. Il modello usa $I=P/V$ e, se si introduce resistenza interna, $P_J=RI^2$. La macchina motrice si disattiva quando la batteria è scarica e può ripartire dopo una ricarica almeno al 5 %: questa soglia è una scelta didattica del simulatore, non un dato regolamentare. Nel laboratorio della spira la capacità è illustrativamente 5 kJ; nella guida è 4 MJ, finestra utilizzabile regolamentare ΔSoC (FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2 diagramma; FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.9), distinta dai limiti di energia **per giro**.

**Prova interattiva.** In [MGU-K: accelerazione e frenata](#/sim/kers-drive) puoi osservare la stessa vettura e la stessa macchina nei due sensi di conversione; il confronto a decelerazione costante conserva i preset e i risultati analitici precedenti. Il passaggio finale è [Guida: acceleratore e freno](#/sim/drive-sim): ↑/W aumenta gradualmente l'acceleratore, ↓/S il freno, oppure usa i pedali sullo schermo. Lo scenario accelera fino a 300 km/h e frena fino a 100 km/h. I grafici mostrano accelerazione con segno, potenze e carica. Il modello longitudinale include resistenza aerodinamica e al rotolamento: la durata della frenata è calcolata e può differire dai 3 s ipotizzati nell'esempio qui sotto, mentre la variazione di energia cinetica rimane circa 2,47 MJ per 800 kg.

**Modello semplificato.** Fisicamente l'MGU-K è una macchina **trifase**, generalmente descritta come **sincrona a magneti permanenti** (PMSM), comandata da un inverter; la spira singola rotante è un **modello semplificato** dello stesso principio. Il tipo esatto di macchina scelto dai costruttori non è pubblico (Fonte: [Silicon Chip, "The 2024 Formula 1 Power Unit"](https://siliconchip.com.au/Issue/2024/May/The+2024+Formula+1+Power+Unit)) [DA VERIFICARE].

**Perché il recupero è limitato dalla potenza.** Una frenata forte dissipa milioni di joule in pochi secondi: servono centinaia di kilowatt. L'MGU-K non può inviare alla batteria più di $P_{\max}$ (limite di regolamento, ma anche di corrente e di calore Joule $R\,i^2$ negli avvolgimenti), quindi assorbe al massimo $P_{\max}/\eta$ di potenza meccanica: l'eccedenza va ai **freni a disco** e diventa calore. Anche nell'MGU-K una parte si perde in calore ($\eta < 1$).

**Numeri del regolamento.**

- 2014–2025: **120 kW**, **50.000 rpm**, **200 Nm riferiti all’albero motore**; **2 MJ/giro** MGU-K → batteria e **4 MJ/giro** batteria → MGU-K. FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3 e 5.3.2 diagramma.
- 2026: **350 kW potenza elettrica DC**, **60.000 rpm** relativi fra parti, **500 Nm riferiti all’albero motore**. FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.7, C5.18.5, C5.2.11. Il limite di erogazione dipende dalla velocità (C5.2.8); non è un limite di recupero. MGU-H assente (C5.2.1).
- Recupero 2026 al bus HV DC CU-K: **8,5 MJ/giro**, riducibili a **7 MJ** in alcuni eventi e fino a **4 MJ** in qualifica; fino a **+0,5 MJ** ai sensi di B7.2 (**massimo 9 MJ**). FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.10. B7.2 non verificato separatamente.
- Massa minima 2026: **724 kg + massa nominale pneumatici**, **726 kg + pneumatici** in qualifica. FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C4.1, C4.7. I **46 kg** di pneumatici sono una stima secondaria non verificata: totale stimato **770 kg**.
- η = **0,95** nel 2025 e **0,97** nel 2026: **correzione fissa FIA usata come stima del rendimento, non un rendimento misurato**. FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2; FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.21.

## Esempio numerico

Massa $m = 800\ \text{kg}$: **minimo regolamentare 2025**, salvo incremento per caldo, senza carburante (FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 4.1). Frenata da $300$ a $100$ km/h, cioè da $83{,}33$ a $27{,}78$ m/s, in $t_f = 3\ \text{s}$ (durata ipotetica).

$$\Delta E_k = \tfrac12 \cdot 800 \cdot \left(83{,}33^2 - 27{,}78^2\right) \approx 2{,}47 \cdot 10^6\ \text{J} = 2{,}47\ \text{MJ}$$

$$\bar P = \frac{2{,}47\ \text{MJ}}{3\ \text{s}} \approx 823\ \text{kW}$$

Con decelerazione costante la potenza di frenata scende da circa $1{,}23$ MW a $0{,}41$ MW, sempre sopra il tetto meccanico $P_{\max}/\eta$: l'MGU-K lavora a potenza massima per tutti i 3 s. Con la correzione FIA usata come stima del rendimento sopra citata:

- Con $\eta = 0{,}95$ e $P_{\max} = 120\ \text{kW}$: assorbiti meccanicamente $\tfrac{120\ \text{kW}}{0{,}95}\cdot 3\ \text{s} \approx 0{,}379\ \text{MJ}$; in batteria $E_{\text{rec}} = 120\ \text{kW}\cdot 3\ \text{s} = 0{,}36\ \text{MJ}$ (circa $15\ \%$); perdite MGU-K circa $0{,}019$ MJ; ai freni circa $2{,}090$ MJ.
- A parità di massa (800 kg, confronto di potenza e η), con $\eta = 0{,}97$ e $P_{\max} = 350\ \text{kW}$: in batteria $E_{\text{rec}} = 1{,}05\ \text{MJ}$ (circa $43\ \%$); perdite MGU-K circa $0{,}032$ MJ; ai freni circa $1{,}387$ MJ.

Il preset 2026 applica anche la massa stimata di **770 kg** (724 + 46 kg): $\Delta E_k = \tfrac12 \cdot 770 \cdot [(300/3{,}6)^2 - (100/3{,}6)^2] \approx 2{,}377\ \text{MJ}$, visualizzati come **2,38 MJ**. Con $\eta = 0{,}97$ e 350 kW per 3 s: in batteria **1,05 MJ**, perdite **0,032 MJ**, ai freni **1,294 MJ**.

Per assorbire tutti i 2,47 MJ alla potenza massima servirebbero $t = 0{,}95 \cdot 2{,}4691358\ \text{MJ} / 120\ \text{kW} \approx 19{,}5473\ \text{s}$ (in batteria solo $0{,}95 \cdot 2{,}47 \approx 2{,}35$ MJ). Il modello trascura resistenza aerodinamica e attriti.

## Collegamento con KERS / MGU-K

Catena: [flusso](01-flusso-campo-magnetico.md) che varia → f.e.m. → corrente → coppia di Lenz (frenata); al contrario, corrente → forza di Lorentz (spinta). Il bilancio è quello del [circuito RL](06-circuito-rl-energia-campo.md): energia in ingresso = energia utile + calore. Efficienza e innovazione: [Agenda 2030, Goal 9](11-agenda-2030-goal-9.md).
