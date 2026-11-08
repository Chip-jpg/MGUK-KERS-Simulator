---
id: 15-dinamica-frenata
titleIT: Dinamica della frenata – MGU-K e freni insieme
order: 15
level: approfondimento
---

## In breve

Questa scheda serve solo a leggere la ripartizione dell’energia nel simulatore della vettura. Non è contenuto della presentazione. Le formule con cui il simulatore calcola pneumatici e aria restano nel simulatore.

## Formule

L’energia cinetica persa si legge così:

$$\Delta E_k = E_{\text{recuperata}} + E_{\text{freni}} + E_{\text{aria}} + E_{\text{perdite}}$$

$E_{\text{recuperata}}$ è l’energia elettrica arrivata in batteria. Non è $\tfrac12 LI^2$.

## Spiegazione

Due limiti, senza le formule interne del modello. Ad alta velocità il tetto di potenza dell’MGU-K satura per primo: la macchina non assorbe tutta la frenata. A bassa velocità il limite diventa l’aderenza dell’asse posteriore, l’unico asse su cui l’MGU-K agisce. Il resto della ripartizione è calore nei freni, lavoro contro l’aria e perdite di macchina. I numeri sulle barre sono il risultato di quel conto, già fatto dal simulatore.

## Esempio numerico

Nessun secondo esempio. Il caso $800\ \text{kg}$, da $300$ a $100\ \text{km/h}$, circa $2{,}47\ \text{MJ}$, è nella scheda [KERS e MGU-K](10-kers-mguk.md). Qui si leggono le quote di quello stesso $\Delta E_k$ sulle barre del simulatore.

## Collegamento con KERS / MGU-K

È lo stesso recupero di [KERS e MGU-K](10-kers-mguk.md), letto sulla vettura: quanto va in batteria, quanto no. Il calore $Ri^2$ è quello del [trasformatore e dell’effetto Joule](08-trasformatore-trasporto-joule.md), non un modello di pneumatico.
