---
id: 17-dinamica-frenata
titleIT: Dinamica della frenata – MGU-K e freni insieme
slideRefs: [16, 17]
order: 17
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

**Perché l’MGU-K recupera poco.** Ad alta velocità la potenza di frenata è molto più grande di $P_{\max}/\eta$: l’MGU-K è al limite di potenza. A bassa velocità, con $P_{\max}$ grande, il limite diventa la forza frenante dell’asse posteriore. Il resto è calore (slide 16–17, vedi [circuito RL ed energia](06-circuito-rl-energia-campo.md) e [effetto Joule](08-trasformatore-trasporto-joule.md)).

## Esempio numerico

Vettura illustrativa: $m = 800$ kg, $C_x A = 1{,}2$ m², $C_z A = 3{,}5$ m², $\mu = 1{,}6$, $\eta = 0{,}9$, frenata da 300 a 100 km/h ($\Delta E_k \approx 2{,}47$ MJ). Risultato: circa 1,83 s e 93 m (senza aerodinamica circa 3,56 s e 198 m).

Con $P_{\max} = 120$ kW in batteria vanno $120\ \text{kW} \cdot 1{,}83\ \text{s} \approx 0{,}22$ MJ (circa 9 %); circa 1,99 MJ ai freni, 0,23 MJ all’aria e 0,02 MJ di perdite MGU-K.

Con $P_{\max} = 350$ kW in batteria circa 0,55 MJ: meno degli 0,64 MJ del modello a decelerazione costante con lo stesso tempo, perché sotto circa 167 km/h l’MGU-K è limitata dall’asse posteriore.

## Collegamento con KERS / MGU-K

I valori 120 kW (fino al 2025) e circa 350 kW (dal 2026) sono quelli della sezione [KERS e MGU-K](10-kers-mguk.md). Fonte: [FIA, Power Unit Regulations 2014](https://www.fia.com/sites/default/files/publication/file/FIA%20F1%20Power%20Unit%20leaflet.pdf); [Formula 1, regolamento motori 2026](https://www.formula1.com/en/latest/article/more-efficient-less-fuel-and-carbon-net-zero-7-things-you-need-to-know-about.ZhtzvU3cPCv8QO7jtFxQR). Gli altri parametri sono illustrativi, non dati di una vettura reale.

## Domande da interrogazione

**D:** Perché la deportanza accorcia lo spazio di frenata?

**R:** Aumenta il carico $F_z$ e quindi la forza frenante massima $\mu F_z$. Cresce con $v^2$: conta soprattutto ad alta velocità.

**D:** Che cosa limita l’energia recuperata dall’MGU-K?

**R:** Ad alta velocità il limite di potenza: in batteria al massimo $P_{\max}$. A bassa velocità, con $P_{\max}$ grande, la forza frenante disponibile sull’asse posteriore, dove agisce l’MGU-K.

**D:** Dove va l’energia cinetica in questa frenata?

**R:** In batteria, in perdite Joule dell’MGU-K, in calore nei freni e nella resistenza dell’aria. La somma è $\tfrac12 m(v_1^2 - v_2^2)$, come nel bilancio delle slide 16–17.

**D:** Che cos’è la ripartizione di frenata ideale?

**R:** La quota anteriore che porta entrambi gli assi al limite insieme: vale la quota statica più $\mu h/L$ per il trasferimento di carico.
