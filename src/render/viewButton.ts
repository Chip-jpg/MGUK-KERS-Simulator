/**
 * "Ripristina vista" button: returns the camera of a stage to its initial pose.
 * Append `button.element` to the sim toolbar; dispose it with the sim.
 */
import { t } from '../core/i18n/it';
import { createButton, type ButtonHandle } from '../ui/controls';
import type { Stage } from './stage';

export function createResetViewButton(stage: Pick<Stage, 'resetView'>): ButtonHandle {
  return createButton({
    labelIT: t.render.resetView,
    icon: '⟲',
    variant: 'ghost',
    title: t.render.resetViewHint,
    onClick: () => stage.resetView(),
  });
}
