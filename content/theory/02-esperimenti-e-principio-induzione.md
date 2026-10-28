---
id: 02-esperimenti-e-principio-induzione
titleIT: Esperimenti e principio dell'induzione elettromagnetica
slideRefs: [2, 3, 4, 5, 6, 7]
order: 2
level: base
---

## In breve

Quattro esperimenti (slide 2–6) mostrano che in un circuito **senza pila** può circolare corrente: la **corrente indotta**. La conclusione comune è una sola: c'è corrente indotta **se e solo se varia il numero di linee di campo che attraversano la superficie del circuito**, cioè se varia il [flusso](01-flusso-campo-magnetico.md) $\Phi_B$ (slide 7).

## Formule

$$\Phi_B = B \cdot S \cdot \cos\alpha$$

Principio dell'induzione (forma qualitativa, slide 7):

$$\frac{\Delta \Phi_B}{\Delta t} \neq 0 \;\Longrightarrow\; \text{corrente indotta nel circuito}$$

La forma quantitativa è la [legge di Faraday-Neumann](03-faraday-neumann.md): $\text{f.e.m.} = -\Delta\Phi_B / \Delta t$.

## Spiegazione

**Esperimento 1 – spira che si muove in un campo uniforme.** Finché la spira entra o esce dalla zona del campo, la parte di superficie attraversata dalle linee cambia e il galvanometro segna corrente. Se la spira si muove restando tutta dentro il campo uniforme, il flusso non cambia e la corrente è zero.

**Esperimento 2 – spira che ruota nel campo.** Cambia l'angolo $\alpha$ tra campo e normale: il flusso varia e compare una corrente che cambia verso ogni mezzo giro. È l'idea dell'[alternatore](07-alternatore-corrente-alternata.md).

**Esperimento 3 – magnete che si avvicina a una bobina.** Avvicinando il magnete aumenta $B$ nella bobina; allontanandolo diminuisce. La corrente ha versi opposti nei due casi e dura solo finché c'è movimento. Il verso è dato dalla [legge di Lenz](04-lenz.md).

**Esperimento 4 – due bobine su un anello di ferro.** Nessun magnete in movimento: quando si chiude o si apre l'interruttore della prima bobina, la sua corrente cambia, cambia il campo nell'anello e nella seconda bobina compare corrente. A corrente costante, nulla. È il principio del [trasformatore](08-trasformatore-trasporto-joule.md).

Non conta il magnete, né il movimento in sé, né il valore del campo: conta **la variazione del flusso**.

## Esempio numerico

Spira quadrata di lato $0{,}10\ \text{m}$ ($S = 1{,}0 \cdot 10^{-2}\ \text{m}^2$) che entra perpendicolarmente in un campo $B = 0{,}30\ \text{T}$.

- Fuori dal campo: $\Phi_B = 0$.
- Tutta dentro: $\Phi_B = 0{,}30 \cdot 1{,}0 \cdot 10^{-2} = 3{,}0 \cdot 10^{-3}\ \text{Wb}$.

Durante l'ingresso il flusso cresce da 0 a $3{,}0 \cdot 10^{-3}$ Wb ⇒ corrente indotta. Quando la spira è tutta dentro e continua a muoversi, $\Delta\Phi_B = 0$ ⇒ nessuna corrente (esperimento 1).

## Collegamento con KERS / MGU-K

L'MGU-K in frenata è l'esperimento 2 "industrializzato": il rotore (di una macchina trifase, generalmente descritta come sincrona a magneti permanenti) gira rispetto agli avvolgimenti fissi, il flusso concatenato varia di continuo e negli avvolgimenti nasce corrente che carica la batteria. Dettagli in [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Qual è la conclusione comune dei quattro esperimenti delle slide 2–6?

**R:** In un circuito nasce una corrente indotta solo quando varia il numero di linee di campo che attraversano la sua superficie, cioè quando varia il flusso $\Phi_B$.

**D:** Nell'esperimento delle due bobine non si muove nulla: perché c'è corrente?

**R:** Alla chiusura o apertura dell'interruttore la corrente nella prima bobina cambia, quindi cambia il campo nell'anello e il flusso nella seconda bobina. A corrente costante non c'è induzione.

**D:** Una spira che trasla dentro un campo uniforme ha corrente indotta?

**R:** No, perché il flusso resta costante. C'è corrente solo mentre la spira entra o esce dalla zona di campo.

**D:** Che differenza c'è tra avvicinare e allontanare il magnete?

**R:** La corrente indotta ha versi opposti: il flusso aumenta in un caso e diminuisce nell'altro. Il verso preciso lo stabilisce la legge di Lenz.
