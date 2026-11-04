---
id: 15-dinamica-frenata
titleIT: Dinamica della frenata – MGU-K e freni insieme
order: 15
level: approfondimento
---

## In breve

Nella sezione [KERS e MGU-K](10-kers-mguk.md) la decelerazione è costante. Qui la vettura frena **al limite di aderenza**: gli pneumatici danno una forza massima $\mu F_z$, la **deportanza** aumenta il carico $F_z$ ad alta velocità e la **resistenza aerodinamica** frena da sola. L’MGU-K agisce solo sull’**asse posteriore**: la quota recuperata dipende da velocità, aderenza e limite di potenza.

## Formule

Carico verticale e resistenza aerodinamica:

$$F_z = m g + \tfrac12 \rho\, C_z A\, v^2 \qquad D = \tfrac12 \rho\, C_x A\, v^2$$

Pneumatico (Pacejka semplificata, picco $\mu F_z$ allo scorrimento $\kappa^*$) e decelerazione:

$$F_x = F_z\,\mu \sin\big(C \arctan(B\kappa - E(B\kappa - \arctan B\kappa))\big) \qquad m a = F_x + D$$

MGU-K sull’asse posteriore ($P_{\max}$ è il limite **elettrico**) e bilancio energetico:

$$F_{\text{MGU-K}} = \min\Big(F_{x,\text{post}},\ \frac{P_{\max}}{\eta\, v}\Big)$$

$$\tfrac12 m (v_1^2 - v_2^2) = E_{\text{MGU-K}} + E_{\text{freni}} + E_{\text{aero}}$$

## Spiegazione

**Aderenza e ABS ideale.** La forza frenante cresce con lo scorrimento $\kappa$ fino al picco, poi cala: un ABS ideale lavora vicino a $\kappa^*$.

**Trasferimento di carico.** In frenata il carico passa dal posteriore all’anteriore, di una quantità $\Delta F_z = F_x h / L$. La **ripartizione di frenata** decide quale asse arriva prima al limite; quella ideale li porta al limite insieme.

**Perché l’MGU-K recupera poco.** Ad alta velocità la potenza di frenata è molto più grande di $P_{\max}/\eta$: l’MGU-K è al limite di potenza. A bassa velocità, con $P_{\max}$ grande, il limite diventa la forza frenante dell’asse posteriore. Il resto è calore (vedi [circuito RL ed energia](06-circuito-rl-energia-campo.md) e [effetto Joule](08-trasformatore-trasporto-joule.md)).

## Esempio numerico

Vettura illustrativa: $m = 800$ kg, $C_x A = 1{,}2$ m², $C_z A = 3{,}5$ m², $\mu = 1{,}6$, $\eta = 0{,}95$, frenata da 300 a 100 km/h ($\Delta E_k \approx 2{,}47$ MJ). Risultato: circa 1,83 s e 93 m (senza aerodinamica circa 3,56 s e 198 m).

Con $P_{\max} = 120$ kW in batteria vanno $120\ \text{kW} \cdot 1{,}83\ \text{s} \approx 0{,}22$ MJ (circa 9 %); circa 2,01 MJ ai freni, 0,23 MJ all’aria e 0,01 MJ di perdite MGU-K.

Con $P_{\max} = 350$ kW con lo stesso η in batteria circa 0,56 MJ: meno degli 0,64 MJ del modello a decelerazione costante con lo stesso tempo, perché sotto circa 162,5 km/h l’MGU-K è limitata dall’asse posteriore.

η = 0,95 è la correzione fissa FIA usata come stima del rendimento, non un rendimento misurato (FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.2); il preset 2026 usa η = 0,97 (FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.21).

## Collegamento con KERS / MGU-K

I valori 120 kW (fino al 2025) e 350 kW di potenza elettrica DC assoluta dell’ERS-K (dal 2026) sono quelli della sezione [KERS e MGU-K](10-kers-mguk.md). Fonti: [FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025), Art. 5.3.3](https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf); [FIA 2026 F1 Regulations Section C, Issue 21 (19 Oct 2026), C5.2.7](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf). Gli altri parametri della vettura sono illustrativi, non dati di una vettura reale.
