---
id: 04-lenz
titleIT: Legge di Lenz
slideRefs: [11]
order: 4
level: base
---

## In breve

**Legge di Lenz (slide 11):** la corrente indotta ha un verso tale che il campo magnetico da essa generato **si oppone alla variazione del flusso** che l'ha prodotta. Se il flusso aumenta, il campo indotto è opposto a quello esterno; se diminuisce, è concorde e cerca di "mantenerlo". È il segno meno nella [legge di Faraday-Neumann](03-faraday-neumann.md).

## Formule

$$\text{f.e.m.} = -\frac{\Delta \Phi_B}{\Delta t}$$

Regola dei segni:

$$\frac{\Delta\Phi_B}{\Delta t} > 0 \;\Rightarrow\; \vec B_{\text{ind}} \text{ opposto a } \vec B_{\text{est}} \qquad \frac{\Delta\Phi_B}{\Delta t} < 0 \;\Rightarrow\; \vec B_{\text{ind}} \text{ concorde con } \vec B_{\text{est}}$$

Potenza dissipata dalla corrente indotta (che deve essere fornita da chi provoca la variazione):

$$P = \text{f.e.m.} \cdot i = R\,i^2$$

## Spiegazione

**Come si trova il verso.** (1) Guarda il campo esterno nella spira; (2) chiediti se il flusso sta aumentando o diminuendo; (3) il campo indotto deve contrastare questa variazione; (4) con la regola della mano destra ricavi il verso della corrente che produce quel campo.

**Magnete e bobina.** Se avvicino il polo nord a una bobina, la faccia della bobina rivolta verso il magnete diventa anch'essa un polo nord e **respinge** il magnete. Se lo allontano, diventa un polo sud e lo **attira**, frenando l'allontanamento.

**Perché è così: conservazione dell'energia.** Se la corrente indotta aiutasse la variazione, otterremmo energia dal nulla (moto perpetuo): il segno meno garantisce che l'energia elettrica sia pagata con lavoro meccanico.

**Effetti pratici.** Le correnti parassite (di Foucault) in un conduttore massiccio che si muove in un campo creano forze frenanti: si usano nei freni elettromagnetici e nella levitazione magnetica (Maglev), citata nel collegamento con l'[Agenda 2030](11-agenda-2030-goal-9.md).

## Esempio numerico

Nell'esempio della slide 10 il campo **aumenta** da $1{,}2$ a $3{,}5$ mT: la corrente indotta di $62{,}5$ mA crea un campo opposto a quello esterno.

Altro caso: spinta di un magnete verso una bobina con $\text{f.e.m.} = 0{,}10\ \text{V}$ e $R = 2{,}0\ \Omega$.

$$i = \frac{0{,}10}{2{,}0} = 0{,}050\ \text{A} \qquad P = R\,i^2 = 2{,}0 \cdot (0{,}050)^2 = 5{,}0 \cdot 10^{-3}\ \text{W}$$

Questi 5 mW non sono "gratis": sono la potenza meccanica che la mano spende contro la forza di Lenz.

## Collegamento con KERS / MGU-K

È il cuore della **frenata rigenerativa**. Quando l'MGU-K funziona da generatore, la corrente indotta negli avvolgimenti produce un campo che si oppone alla rotazione del rotore: nasce una **coppia frenante** (coppia di Lenz). Più corrente si manda alla batteria, più forte è la frenata elettrica. Vedi [KERS e MGU-K](10-kers-mguk.md).

## Domande da interrogazione

**D:** Enuncia la legge di Lenz.

**R:** La corrente indotta circola in verso tale da generare un campo magnetico che si oppone alla variazione di flusso che l'ha generata. Matematicamente è il segno meno della legge di Faraday-Neumann.

**D:** Perché la legge di Lenz è legata alla conservazione dell'energia?

**R:** Se la corrente indotta favorisse la variazione, il sistema si autoalimenterebbe creando energia dal nulla. Opponendosi, obbliga chi muove il magnete a compiere lavoro, che si trasforma in energia elettrica e calore.

**D:** Avvicino il polo nord di un magnete a una bobina: cosa succede?

**R:** Il flusso aumenta, la bobina genera un campo opposto: la faccia vicina al magnete diventa un polo nord e lo respinge.

**D:** Che ruolo ha la legge di Lenz nell'MGU-K?

**R:** In frenata la corrente indotta crea una coppia che si oppone alla rotazione: è la coppia frenante che rallenta l'auto mentre la sua energia cinetica viene convertita in energia elettrica.
