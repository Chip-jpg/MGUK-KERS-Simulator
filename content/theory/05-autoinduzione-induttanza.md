---
id: 05-autoinduzione-induttanza
titleIT: Autoinduzione e induttanza
slideRefs: [12, 13, 14]
order: 5
level: base
---

## In breve

Un circuito percorso da corrente genera un campo magnetico che attraversa **il circuito stesso**: c'è quindi un flusso "proprio". Se la corrente cambia, cambia questo flusso e nel circuito nasce una f.e.m. indotta su se stesso: è l'**autoinduzione** (slide 12–13). La grandezza che misura quanto un circuito "reagisce" alle variazioni di corrente è l'**induttanza** $L$, misurata in henry.

## Formule

Definizione di induttanza (slide 13):

$$L = \frac{\Phi_B}{i} \qquad \Leftrightarrow \qquad \Phi_B = L\,i$$

$$1\ \text{H} = 1\ \frac{\text{Wb}}{\text{A}} = 1\ \frac{\text{V}\cdot\text{s}}{\text{A}}$$

F.e.m. autoindotta (Faraday-Neumann con $\Phi_B = L\,i$ e $L$ costante):

$$\text{f.e.m.} = -L\,\frac{\Delta i}{\Delta t}$$

Induttanza di un solenoide lungo (slide 14), con $N$ spire, sezione $S$, lunghezza $l$:

$$L = \frac{\mu_0 N^2 S}{l} \qquad \mu_0 = 4\pi \cdot 10^{-7}\ \frac{\text{T}\cdot\text{m}}{\text{A}}$$

## Spiegazione

**Perché $\Phi_B$ è proporzionale a $i$.** Il campo prodotto da un circuito è proporzionale alla corrente che lo percorre; quindi anche il flusso concatenato lo è. La costante di proporzionalità $L$ dipende solo dalla **geometria** del circuito e dal materiale (nucleo), non dalla corrente.

**Il segno meno** è ancora la [legge di Lenz](04-lenz.md): se la corrente aumenta, la f.e.m. autoindotta si oppone all'aumento (è una "forza controelettromotrice"); se la corrente diminuisce, la f.e.m. tende a mantenerla. Un'induttanza si comporta quindi come una **inerzia elettrica**: come la massa si oppone alle variazioni di velocità, $L$ si oppone alle variazioni di corrente.

**Perché $N^2$ nel solenoide.** Il campo interno è $B = \mu_0 N i / l$ (proporzionale a $N$) e il flusso va concatenato con tutte le $N$ spire (un altro fattore $N$): $N \cdot BS = \mu_0 N^2 S\,i/l$. Raddoppiare le spire quadruplica l'induttanza. Un nucleo di ferro la aumenta ancora moltissimo.

**Conseguenze.** All'apertura di un circuito con grande $L$, $\Delta i/\Delta t$ è enorme e si possono avere scintille (extracorrente di apertura). Alla chiusura la corrente non sale istantaneamente: è il [circuito RL](06-circuito-rl-energia-campo.md).

## Esempio numerico

Solenoide con $N = 500$, $S = 1{,}0 \cdot 10^{-3}\ \text{m}^2$, $l = 0{,}20\ \text{m}$, in aria:

$$L = \frac{4\pi\cdot10^{-7} \cdot 500^2 \cdot 1{,}0\cdot10^{-3}}{0{,}20} \approx 1{,}57 \cdot 10^{-3}\ \text{H} = 1{,}57\ \text{mH}$$

Se la corrente sale di $2{,}0$ A in $0{,}010$ s:

$$|\text{f.e.m.}| = 1{,}57\cdot10^{-3} \cdot \frac{2{,}0}{0{,}010} \approx 0{,}31\ \text{V}$$

## Collegamento con KERS / MGU-K

Gli avvolgimenti dello statore dell'MGU-K sono bobine con una loro induttanza: la corrente non può cambiare istantaneamente e l'elettronica di potenza (inverter) deve tenerne conto quando commuta rapidamente le correnti. L'induttanza contribuisce anche all'energia immagazzinata nel campo magnetico, vedi [Circuito RL ed energia](06-circuito-rl-energia-campo.md) e [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Che cos'è l'autoinduzione?

**R:** È la produzione di una f.e.m. indotta in un circuito a causa della variazione della sua stessa corrente, che fa variare il flusso del campo da essa generato: $\text{f.e.m.} = -L\,\Delta i/\Delta t$.

**D:** Definisci l'induttanza e la sua unità di misura.

**R:** $L = \Phi_B/i$, rapporto tra flusso concatenato e corrente. Si misura in henry: $1\ \text{H} = 1\ \text{Wb/A}$. Dipende solo da geometria e materiale.

**D:** Da cosa dipende l'induttanza di un solenoide?

**R:** $L = \mu_0 N^2 S/l$: cresce con il quadrato del numero di spire e con la sezione, diminuisce con la lunghezza. Con un nucleo ferromagnetico aumenta molto.

**D:** Perché si dice che l'induttanza è un'"inerzia elettrica"?

**R:** Perché si oppone alle variazioni di corrente, come la massa si oppone alle variazioni di velocità: la corrente in un'induttanza non può cambiare di colpo.
