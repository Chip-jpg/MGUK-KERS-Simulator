---
id: 13-filo-logico-interrogazione
titleIT: Filo logico per l'interrogazione
slideRefs: [7, 8, 10, 11, 17, 18, 19, 20, 23]
goal: '9'
order: 13
level: base
---

## In breve

Una pagina per ripassare tutto il percorso in sei passaggi, più un **copione di circa 5 minuti** da esporre in prima persona. La catena è:

**Faraday-Neumann → alternatore → MGU-K in frenata → energia ed effetto Joule → Goal 9 → Art. 32.**

## Formule

Le sei formule da saper scrivere alla lavagna, nell'ordine del discorso:

$$\Phi_B = B\,S\cos\alpha \qquad \text{f.e.m.} = -\frac{\Delta\Phi_B}{\Delta t} \qquad i = \frac{\text{f.e.m.}}{R}$$

$$\text{f.e.m.}(t) = V_0\sin(\omega t),\quad V_0 = NBS\omega \qquad F = B\,I\,L\sin\theta$$

$$\Delta E_k = \tfrac12\,m\,(v_1^2 - v_2^2) \qquad P_J = R\,i^2$$

## Spiegazione

**La catena in sei passaggi.**

1. **Faraday-Neumann** ([03](03-faraday-neumann.md)): se il flusso varia nasce una f.e.m. $= -\Delta\Phi_B/\Delta t$; il segno meno è la [legge di Lenz](04-lenz.md).
2. **Alternatore** ([07](07-alternatore-corrente-alternata.md)): una bobina che ruota in un campo ha flusso che varia come un coseno, quindi f.e.m. sinusoidale $V_0\sin(\omega t)$.
3. **MGU-K in frenata** ([10](10-kers-mguk.md)): l'MGU-K è un alternatore collegato alle ruote; la coppia di Lenz frena l'auto e l'energia cinetica diventa elettrica. In accelerazione è un motore (principio inverso, [forza di Lorentz](09-motore-elettrico-lorentz.md)).
4. **Energia e Joule** ([06](06-circuito-rl-energia-campo.md), [08](08-trasformatore-trasporto-joule.md)): non si recupera tutto; la potenza massima limita il recupero e le perdite $R\,i^2$ diventano calore.
5. **Goal 9** ([11](11-agenda-2030-goal-9.md)): tecnologia che aumenta l'efficienza (target 9.4) grazie a ricerca e innovazione (9.5); collegati Goal 7 e 13.
6. **Art. 32** ([12](12-art-32-costituzione.md)): meno sprechi ed emissioni proteggono la salute come interesse della collettività.

**Copione orale (circa 5 minuti).**

Il mio percorso parte dall'induzione elettromagnetica e arriva alla Formula 1, per poi chiudersi con l'Agenda 2030 e la Costituzione.

Comincio dagli esperimenti: una spira che si muove in un campo, una spira che ruota, un magnete che si avvicina a una bobina, due bobine su un anello di ferro. In tutti i casi c'è corrente indotta solo quando cambia il numero di linee di campo che attraversano il circuito, cioè quando varia il flusso, che definisco come $\Phi_B = BS\cos\alpha$ e misuro in weber.

La legge di Faraday-Neumann dice quanto vale la forza elettromotrice indotta: è uguale all'opposto della rapidità con cui varia il flusso, f.e.m. uguale a meno delta phi su delta t. Dividendo per la resistenza ottengo la corrente. Per esempio, nell'esercizio delle slide, con una superficie di cinque centesimi di metro quadro, un campo che passa da 1,2 a 3,5 millitesla in 0,46 secondi e una resistenza di 4 milliohm, ottengo una corrente di 62,5 milliampere.

Il segno meno è la legge di Lenz: la corrente indotta si oppone alla variazione che l'ha prodotta. Non è un dettaglio, è la conservazione dell'energia: se la corrente aiutasse la variazione, avrei energia dal nulla.

Se faccio ruotare una bobina in un campo, il flusso varia come un coseno e la forza elettromotrice diventa sinusoidale, con ampiezza $V_0 = NBS\omega$: questo è l'alternatore, la macchina che produce l'energia elettrica nelle centrali. Poi i trasformatori alzano la tensione, così la corrente nelle linee è bassa e le perdite per effetto Joule, che dipendono dal quadrato della corrente, diminuiscono.

A questo punto arrivo alla Formula 1. L'MGU-K è una macchina elettrica collegata al motore. In frenata funziona da generatore: le ruote fanno girare il rotore, il flusso varia, si induce corrente che carica la batteria, e per la legge di Lenz nasce una coppia che frena la macchina. In accelerazione funziona al contrario, da motore: la batteria manda corrente e la forza di Lorentz, $F = BIL$, produce una coppia. È il principio inverso dell'induzione. Devo precisare che la macchina reale è trifase, a magneti permanenti: la spira delle slide è un modello semplificato, ma la fisica è la stessa.

Ho fatto un calcolo con una massa illustrativa di 800 chili: frenando da 300 a 100 chilometri orari bisogna togliere circa 2,5 megajoule. Se la frenata dura tre secondi, servirebbero più di 800 kilowatt, ma fino al 2025 l'MGU-K poteva assorbire al massimo 120 kilowatt: quindi recupera circa 0,36 megajoule e il resto diventa calore nei freni a disco. Dal 2026 il limite è salito a circa 350 kilowatt. Il recupero, quindi, è limitato dalla potenza.

Questo mi porta all'Agenda 2030, in particolare al Goal 9: il target 9.4 chiede di rendere le industrie più sostenibili, aumentando l'efficienza nell'uso delle risorse e adottando tecnologie più pulite; il 9.5 chiede più ricerca e innovazione. Recuperare energia che altrimenti diventerebbe calore è proprio aumentare l'efficienza, e la stessa idea si usa nei motori elettrici industriali e nei treni a levitazione magnetica. Collego anche il Goal 7, sull'energia, e il Goal 13, sul clima.

Infine l'articolo 32 della Costituzione: la Repubblica tutela la salute come diritto fondamentale dell'individuo e interesse della collettività. Meno sprechi di energia significano meno consumi e meno emissioni, e quindi un ambiente più sano per tutti. Come approfondimento ricordo che dal 2022 anche gli articoli 9 e 41 parlano esplicitamente di tutela dell'ambiente.

In sintesi: dalla variazione di un flusso magnetico si arriva a una tecnologia che recupera energia, e da qui a un tema di sostenibilità e di salute pubblica.

## Esempio numerico

I tre numeri da ricordare (e saper rifare):

- slide 10: $I = \dfrac{5{,}0\cdot10^{-2}\cdot 2{,}3\cdot10^{-3}}{0{,}46 \cdot 4\cdot10^{-3}} = 62{,}5\ \text{mA}$;
- frenata: $\Delta E_k = \tfrac12\cdot800\cdot(83{,}33^2-27{,}78^2) \approx 2{,}47\ \text{MJ}$ (massa illustrativa);
- recupero: $120\ \text{kW}\cdot 3\ \text{s} = 0{,}36\ \text{MJ}$; con $350\ \text{kW}$: $1{,}05\ \text{MJ}$.

## Collegamento con KERS / MGU-K

Il passaggio 3 della catena è quello su cui il discorso deve "fermarsi" di più: frenata = alternatore + Lenz, accelerazione = motore + Lorentz, limite di potenza, calore nei freni. Tutti i dettagli e le fonti sui numeri del regolamento sono in [KERS e MGU-K](10-kers-mguk.md); i termini in [Glossario](14-glossario.md).

## Domande da interrogazione

**D:** Riassumi in una frase il collegamento tra induzione e Goal 9.

**R:** La legge di Faraday-Neumann-Lenz permette di costruire generatori che recuperano energia in frenata invece di sprecarla in calore: è innovazione tecnologica per l'efficienza, cioè i target 9.4 e 9.5.

**D:** Perché la spira delle slide è solo un modello?

**R:** Perché l'MGU-K reale è una macchina trifase con magneti permanenti e inverter; la spira singola rende evidente il principio (flusso variabile, f.e.m. sinusoidale, coppia di Lenz) senza i dettagli costruttivi.

**D:** Qual è il passaggio dall'efficienza all'Art. 32?

**R:** Meno energia sprecata significa meno energia da produrre e meno emissioni a parità di servizio: si protegge la salute come interesse della collettività.
