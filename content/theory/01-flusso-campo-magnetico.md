---
id: 01-flusso-campo-magnetico
titleIT: Flusso del campo magnetico
slideRefs: [7]
order: 1
level: base
---

## In breve

Il **flusso del campo magnetico** $\Phi_B$ misura "quante linee di campo" attraversano la superficie delimitata da un circuito. Dipende da tre cose: l'intensità del campo $B$, l'area $S$ della superficie e il suo orientamento rispetto al campo (angolo $\alpha$). È la grandezza centrale di tutta l'induzione: **una corrente indotta nasce solo quando $\Phi_B$ varia nel tempo** (slide 7).

## Formule

$$\Phi_B = B \cdot S \cdot \cos\alpha$$

- $B$: campo magnetico, in tesla (T)
- $S$: area della superficie, in m²
- $\alpha$: angolo tra $\vec B$ e la **normale** (perpendicolare) alla superficie

$$1\ \text{Wb} = 1\ \text{T} \cdot \text{m}^2$$

Casi limite: $\alpha = 0$ ⇒ $\Phi_B = BS$ (massimo); $\alpha = 90^\circ$ ⇒ $\Phi_B = 0$ (le linee "scivolano" sulla superficie).

## Spiegazione

Il flusso è un prodotto "efficace": conta solo la componente di $\vec B$ perpendicolare alla superficie, cioè $B\cos\alpha$. Per questo una spira con il piano parallelo alle linee di campo ha flusso nullo anche in un campo intenso.

L'unità di misura è il **weber** (Wb). Un weber è il flusso di un campo di 1 T attraverso 1 m² perpendicolare al campo.

Il flusso può cambiare in **tre modi**, e ognuno corrisponde a un esperimento delle slide (vedi [Esperimenti e principio dell'induzione](02-esperimenti-e-principio-induzione.md)):

1. varia $B$ (avvicino un magnete, accendo una corrente in una bobina vicina);
2. varia $S$ (una sbarretta scorre su due binari e allarga il circuito);
3. varia $\alpha$ (la spira **ruota** nel campo: è il principio dell'[alternatore](07-alternatore-corrente-alternata.md)).

Se nessuna delle tre grandezze cambia, il flusso è costante e **non c'è induzione**, anche se il campo è fortissimo. Questa è l'idea che serve per la [legge di Faraday-Neumann](03-faraday-neumann.md): conta la variazione $\Delta\Phi_B$, non il valore di $\Phi_B$.

Nota: la formula $\Phi_B = BS\cos\alpha$ vale per un campo **uniforme** su una superficie **piana**. Per una bobina di $N$ spire uguali il flusso concatenato totale è $N\Phi_B$.

## Esempio numerico

Spira di area $S = 0{,}020\ \text{m}^2$ in un campo uniforme $B = 0{,}50\ \text{T}$.

- $\alpha = 0$: $\Phi_B = 0{,}50 \cdot 0{,}020 \cdot 1 = 1{,}0 \cdot 10^{-2}\ \text{Wb}$
- $\alpha = 60^\circ$: $\Phi_B = 0{,}50 \cdot 0{,}020 \cdot 0{,}5 = 5{,}0 \cdot 10^{-3}\ \text{Wb}$
- $\alpha = 90^\circ$: $\Phi_B = 0$

Ruotando la spira da $0$ a $90^\circ$ il flusso passa da $1{,}0 \cdot 10^{-2}$ Wb a zero: questa variazione è ciò che genera la f.e.m. indotta.

## Collegamento con KERS / MGU-K

Nell'MGU-K il rotore porta dei magneti e ruota davanti agli avvolgimenti dello statore: l'angolo tra campo e avvolgimenti cambia continuamente, quindi il flusso concatenato varia in modo periodico. È lo stesso meccanismo della spira che ruota (caso 3), su cui si basa il [modello del KERS / MGU-K](10-kers-mguk.md). Più veloce gira il rotore, più rapidamente varia $\Phi_B$.

## Domande da interrogazione

**D:** Che cos'è il flusso del campo magnetico e in che unità si misura?

**R:** È $\Phi_B = BS\cos\alpha$, con $\alpha$ angolo tra $\vec B$ e la normale alla superficie. Si misura in weber: $1\ \text{Wb} = 1\ \text{T}\cdot\text{m}^2$.

**D:** In quali modi si può far variare il flusso attraverso una spira?

**R:** Variando il campo $B$, l'area $S$ del circuito oppure l'angolo $\alpha$ (rotazione della spira). Ognuno corrisponde a uno degli esperimenti delle slide 2–6.

**D:** Una spira ferma in un campo magnetico molto intenso produce corrente?

**R:** No: se $B$, $S$ e $\alpha$ restano costanti il flusso non varia e non c'è corrente indotta. Conta la variazione del flusso, non il suo valore.

**D:** Quando il flusso è massimo e quando è nullo?

**R:** È massimo ($BS$) quando il campo è perpendicolare alla superficie ($\alpha = 0$); è nullo quando il campo è parallelo alla superficie ($\alpha = 90^\circ$).
