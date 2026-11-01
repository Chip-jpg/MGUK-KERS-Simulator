import { PRESETS } from '../kers-braking/model';
import { createButton } from '../../ui/controls';
import { el } from '../../ui/dom';

/** Reuse the established regulation presets without their analytical braking parameters. */
export function createDrivePresets(onSelect: (powerKw: number) => void) {
  const buttons = PRESETS.map((preset) => {
    const button = createButton({
      labelIT: preset.labelIT,
      title: `MGU-K: ${preset.values.Pmax} kW. Riparte con la stessa carica iniziale.`,
      onClick: () => onSelect(preset.values.Pmax),
    });
    button.element.dataset['preset'] = preset.id;
    button.element.setAttribute('aria-pressed', 'false');
    return button;
  });
  const element = el(
    'section',
    {
      class: 'drive-presets',
      attrs: { 'aria-label': 'Preset 2025 e 2026' },
    },
    [
      el('h3', { text: 'Assetto MGU-K: 2025 / 2026' }),
      el(
        'div',
        { class: 'drive-presets__buttons' },
        buttons.map((b) => b.element),
      ),
      el('p', {
        text: 'Confronta 120 kW e fino a 350 kW. Ogni preset riavvia la prova con la stessa carica iniziale.',
      }),
      el('details', {}, [
        el('summary', { text: 'Differenza tra gli assetti e fonti' }),
        el('p', {
          text: 'Nel 2026 la MGU-K è più potente e la MGU-H è eliminata. Qui la MGU-H non è simulata: i preset cambiano solo i limiti elettrici MGU-K di erogazione e recupero. Massa, motore termico e capacità batteria restano illustrativi e invariati.',
        }),
        ...PRESETS.map((preset) =>
          el('p', {}, [
            `${preset.id}: `,
            ...preset.sources.map((source) =>
              el('a', {
                text: source.labelIT,
                attrs: { href: source.url, target: '_blank', rel: 'noopener noreferrer' },
              }),
            ),
          ]),
        ),
      ]),
    ],
  );
  const updatePower = (powerKw: number): void => {
    PRESETS.forEach((preset, i) => {
      buttons[i]?.element.setAttribute('aria-pressed', String(powerKw === preset.values.Pmax));
    });
  };
  return {
    element,
    updatePower,
    dispose() {
      buttons.forEach((button) => button.dispose());
      element.remove();
    },
  };
}
