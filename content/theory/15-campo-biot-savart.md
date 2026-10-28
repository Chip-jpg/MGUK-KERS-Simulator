---
id: 15-campo-biot-savart
titleIT: Campo magnetico di bobine reali (Biot-Savart)
slideRefs: [7, 14]
order: 15
level: approfondimento
---

## In breve

Nelle slide il campo magnetico è sempre **uniforme**: $\Phi_B = BS\cos\alpha$ (slide 7) e, per il solenoide, $B = \mu_0 N I/l$ e $L = \mu_0 N^2 S/l$ (slide 14). È un’idealizzazione. Il campo di una bobina reale si calcola con la **legge di Biot-Savart**, sommando i contributi di tutti i tratti di filo: così si vede dove il campo è davvero uniforme e dove non lo è.

## Formule

Contributo di un tratto di filo $\Delta\vec l$ percorso dalla corrente $I$, a distanza $r$:

$$\Delta\vec B = \frac{\mu_0 I}{4\pi}\,\frac{\Delta\vec l \times \hat r}{r^2}$$

Campo sull’asse di una spira di raggio $R$, a distanza $z$ dal centro:

$$B_z = \frac{\mu_0 I R^2}{2\,(R^2 + z^2)^{3/2}} \qquad \text{al centro: } B = \frac{\mu_0 I}{2R}$$

Solenoide ideale (infinitamente lungo, slide 14):

$$B = \mu_0\,\frac{N I}{l}$$

## Spiegazione

**Sovrapposizione.** Ogni tratto di filo produce un piccolo campo perpendicolare sia al filo sia alla congiungente; il campo totale è la somma vettoriale di tutti i contributi. Per una bobina qualsiasi la somma si fa al computer, spezzando il filo in segmenti.

**Linee di campo chiuse.** Le linee di $\vec B$ non hanno inizio né fine: escono da un’estremità della bobina e rientrano dall’altra, perché il flusso di $\vec B$ attraverso una superficie chiusa è nullo (vedi [flusso del campo magnetico](01-flusso-campo-magnetico.md)).

**Quando vale l’idealizzazione.** In un solenoide lungo ($l \gg R$) il campo interno è quasi uniforme e vale $\mu_0 N I/l$; agli estremi scende a circa metà e all’esterno non è esattamente nullo. Una spira singola non dà mai un campo uniforme. Due bobine coassiali a distanza $R$ (bobine di Helmholtz) danno invece una zona centrale molto uniforme. Per questo la formula di $L$ (slide 14) è precisa solo per solenoidi lunghi: vedi [autoinduzione e induttanza](05-autoinduzione-induttanza.md).

## Esempio numerico

Solenoide con $N = 40$, $R = 3{,}0$ cm, $l = 30$ cm, $I = 5{,}0$ A (valori iniziali del simulatore):

$$B_{\text{ideale}} = \frac{4\pi\cdot10^{-7}\cdot 40\cdot 5{,}0}{0{,}30} \approx 0{,}8378\ \text{mT}$$

Il simulatore somma i contributi dell’elica reale (40 spire, 36 segmenti per spira) e al centro trova $B \approx 0{,}8214$ mT: la differenza è $-1{,}95$ %, perché il solenoide non è infinitamente lungo ($l/R = 10$). Agli estremi ($z = \pm l/2$) il campo scende al 51 % del valore al centro, circa $0{,}42$ mT.

Con la formula della slide 14 e $S = \pi R^2$:

$$L = \frac{\mu_0 N^2 S}{l} = \frac{4\pi\cdot10^{-7}\cdot 40^2\cdot \pi\,(0{,}030)^2}{0{,}30} \approx 18{,}95\ \mu\text{H}$$

È il valore ideale: poiché il campo reale è un po’ più debole, soprattutto verso le estremità, l’induttanza vera è leggermente minore.

## Collegamento con KERS / MGU-K

L’MGU-K è una macchina trifase, generalmente descritta come sincrona a magneti permanenti (tipo e dati reali non pubblici, [DA VERIFICARE]). Al suo interno il campo nel traferro non è uniforme: dipende dalla forma degli avvolgimenti e dal ferro. Il modello uniforme delle slide spiega il principio; per progettare servono calcoli numerici del campo, come Biot-Savart ma con i materiali magnetici. Vedi anche [motore elettrico e forza di Lorentz](09-motore-elettrico-lorentz.md).

## Domande da interrogazione

**D:** Che cosa afferma la legge di Biot-Savart?

**R:** Che ogni tratto di filo $\Delta\vec l$ percorso da corrente $I$ genera un campo $\Delta\vec B = \frac{\mu_0 I}{4\pi}\frac{\Delta\vec l\times\hat r}{r^2}$; il campo totale è la somma di tutti i contributi.

**D:** Il campo di un solenoide reale è uniforme?

**R:** Solo all’interno e lontano dalle estremità, se il solenoide è lungo rispetto al raggio. Agli estremi scende a circa metà di $\mu_0 N I/l$ e fuori non è nullo.

**D:** Perché le linee di campo magnetico sono chiuse?

**R:** Perché non esistono cariche magnetiche isolate: il flusso di $\vec B$ attraverso qualunque superficie chiusa è zero, quindi ogni linea che esce rientra.

**D:** A cosa servono le bobine di Helmholtz?

**R:** Due bobine coassiali uguali a distanza pari al raggio producono al centro un campo molto uniforme; si usano in laboratorio quando serve un campo noto e regolare.
