---
id: 13-filo-logico
titleIT: 'Il filo logico: da Faraday all’Art. 32'
goal: '9'
order: 13
level: base
---

## In breve

Una pagina di sintesi che collega tutte le sezioni in sei passaggi:

**Faraday-Neumann → alternatore → MGU-K in frenata → energia ed effetto Joule → Goal 9 → Art. 32.**

Dalla variazione di un flusso magnetico si arriva a una tecnologia che recupera energia, e da qui a un tema di sostenibilità e di salute pubblica.

## Formule

Le formule principali, nell’ordine della catena:

$$\Phi_B = B\,S\cos\alpha \qquad \text{f.e.m.} = -\frac{\Delta\Phi_B}{\Delta t} \qquad i = \frac{\text{f.e.m.}}{R}$$

$$\text{f.e.m.}(t) = V_0\sin(\omega t),\quad V_0 = NBS\omega \qquad F = B\,I\,L\sin\theta$$

$$\Delta E_k = \tfrac12\,m\,(v_1^2 - v_2^2) \qquad P_J = R\,i^2$$

## Spiegazione

1. **Faraday-Neumann** ([03](03-faraday-neumann.md)): c’è corrente indotta solo quando varia il [flusso](01-flusso-campo-magnetico.md) $\Phi_B$; la f.e.m. vale $-\Delta\Phi_B/\Delta t$. Il segno meno è la [legge di Lenz](04-lenz.md): la corrente indotta si oppone alla variazione che l’ha prodotta, come richiede la conservazione dell’energia.
2. **Alternatore** ([07](07-alternatore-corrente-alternata.md)): una bobina che ruota in un campo ha un flusso che varia come un coseno, quindi una f.e.m. sinusoidale di ampiezza $V_0 = NBS\omega$. È la macchina che produce l’energia elettrica nelle centrali; i [trasformatori](08-trasformatore-trasporto-joule.md) alzano poi la tensione per ridurre le perdite nelle linee.
3. **MGU-K in frenata** ([10](10-kers-mguk.md)): l’MGU-K è un alternatore collegato alle ruote; la coppia di Lenz frena l’auto e l’energia cinetica diventa elettrica, immagazzinata in batteria. In accelerazione funziona da motore, grazie alla [forza di Lorentz](09-motore-elettrico-lorentz.md): è il principio inverso. La macchina reale è trifase, generalmente descritta come sincrona a magneti permanenti; il modello a una spira ne mostra il principio.
4. **Energia ed effetto Joule** ([06](06-circuito-rl-energia-campo.md), [08](08-trasformatore-trasporto-joule.md)): non si recupera tutto. La potenza massima dell’MGU-K limita il recupero e il resto diventa calore, quasi tutto nei freni a disco e in piccola parte nelle perdite $R\,i^2$ della macchina. Con aderenza e aerodinamica il quadro si completa nella [dinamica della frenata](15-dinamica-frenata.md).
5. **Goal 9** ([11](11-agenda-2030-goal-9.md)): recuperare energia che altrimenti diventerebbe calore significa aumentare l’efficienza (target 9.4) grazie a ricerca e innovazione (target 9.5); sono collegati il Goal 7 (energia) e il Goal 13 (clima).
6. **Art. 32** ([12](12-art-32-costituzione.md)): la Repubblica tutela la salute come diritto dell’individuo e interesse della collettività; meno sprechi ed emissioni contribuiscono a un ambiente più sano. Dal 2022 anche gli articoli 9 e 41 parlano esplicitamente di tutela dell’ambiente.

## Esempio numerico

I tre numeri che attraversano la catena:

- induzione: $I = \dfrac{5{,}0\cdot10^{-2}\cdot 2{,}3\cdot10^{-3}}{0{,}46 \cdot 4\cdot10^{-3}} = 62{,}5\ \text{mA}$ (esercizio della sezione [Faraday-Neumann](03-faraday-neumann.md));
- frenata: $\Delta E_k = \tfrac12\cdot800\cdot(83{,}33^2-27{,}78^2) \approx 2{,}47\ \text{MJ}$ (massa illustrativa);
- recupero: $120\ \text{kW}\cdot 3\ \text{s} = 0{,}36\ \text{MJ}$ (limite fino al 2025); con circa $350\ \text{kW}$ (dal 2026): $1{,}05\ \text{MJ}$.

## Collegamento con KERS / MGU-K

Il passaggio 3 è il centro della catena: frenata = alternatore + Lenz, accelerazione = motore + Lorentz, recupero limitato dalla potenza, il resto calore nei freni. Dettagli e fonti sui numeri del regolamento sono in [KERS e MGU-K](10-kers-mguk.md); i termini sono nel [Glossario](14-glossario.md).
