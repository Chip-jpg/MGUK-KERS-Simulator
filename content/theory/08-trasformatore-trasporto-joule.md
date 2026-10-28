---
id: 08-trasformatore-trasporto-joule
titleIT: Trasformatore, trasporto dell’energia ed effetto Joule
order: 8
level: base
---

## In breve

Il **trasformatore statico** è formato da due bobine avvolte sullo stesso nucleo di ferro. Una tensione **alternata** nel primario crea un flusso variabile che, attraverso il nucleo, induce una tensione nel secondario. Il rapporto tra le tensioni è uguale al rapporto tra i numeri di spire. Serve per trasportare l'energia elettrica ad **alta tensione** e quindi con **bassa corrente**, riducendo le perdite per effetto Joule.

## Formule

Rapporto di trasformazione:

$$\frac{\Delta V_1}{\Delta V_2} = \frac{N_1}{N_2}$$

Trasformatore ideale (nessuna perdita): la potenza si conserva

$$\Delta V_1\, i_1 = \Delta V_2\, i_2 \qquad\Rightarrow\qquad \frac{i_1}{i_2} = \frac{N_2}{N_1}$$

Perdita Joule su una linea di resistenza $R$ che trasporta la potenza $P$ alla tensione $\Delta V$:

$$i = \frac{P}{\Delta V} \qquad P_J = R\,i^2 = R\,\frac{P^2}{\Delta V^2}$$

## Spiegazione

**Come funziona.** Nel primario circola corrente alternata, quindi il campo nel nucleo e il flusso variano di continuo. Lo stesso flusso attraversa ogni spira di entrambe le bobine: per [Faraday-Neumann](03-faraday-neumann.md) ogni spira ha la stessa f.e.m., e la tensione totale è proporzionale al numero di spire. È l'esperimento delle [due bobine sull'anello di ferro](02-esperimenti-e-principio-induzione.md). Con corrente **continua** il flusso non varia e il trasformatore non funziona.

**Elevatore e abbassatore.** Se $N_2 > N_1$ la tensione sale e la corrente scende (elevatore); se $N_2 < N_1$ succede il contrario (abbassatore). Il trasformatore non "crea" energia: alza la tensione a spese della corrente.

**Perché alta tensione.** La potenza persa in calore nei cavi è $R\,i^2$. A parità di potenza trasportata, moltiplicare la tensione per 10 divide la corrente per 10 e quindi **divide le perdite per 100**. Da qui la catena di trasporto:

centrale (alternatore) → trasformatore **elevatore** → linea ad **alta tensione** → trasformatore **abbassatore** → rete urbana.

**Centrali.** Le fonti possono essere non rinnovabili (combustibili fossili, nucleare) o rinnovabili (idroelettrico, eolico, solare…); nella maggior parte dei casi c'è un [alternatore](07-alternatore-corrente-alternata.md) mosso da una turbina, mentre il fotovoltaico produce direttamente corrente continua.

## Esempio numerico

Linea di resistenza $R = 5{,}0\ \Omega$ che deve trasportare $P = 10\ \text{MW}$ (valori illustrativi).

- A $20\ \text{kV}$: $i = 10^7 / (2{,}0\cdot10^4) = 500\ \text{A}$, $P_J = 5{,}0 \cdot 500^2 = 1{,}25\ \text{MW}$ ($12{,}5\ \%$).
- A $200\ \text{kV}$: $i = 50\ \text{A}$, $P_J = 5{,}0 \cdot 50^2 = 12{,}5\ \text{kW}$ ($0{,}125\ \%$).

Tensione $\times 10$ ⇒ perdite $\div 100$.

## Collegamento con KERS / MGU-K

Lo stesso principio $P_J = R\,i^2$ vale dentro l'auto: per scambiare molti kilowatt tra MGU-K e batteria conviene una tensione elevata e quindi una corrente minore, così cavi e avvolgimenti scaldano meno. Il calore prodotto (Joule nei conduttori, perdite nell'elettronica e nella batteria) è energia che non torna alle ruote: entra nel bilancio di [KERS e MGU-K](10-kers-mguk.md).
