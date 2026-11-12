/**
 * dsh-model-pilot browser half.
 *
 * Registers two surfaces:
 * - a standalone `settings.section` page (full provider/model/options/backup
 *   management), and
 * - an integration into the official Models settings page via the
 *   `settings.models.provider-card` + `settings.models.footer` seats so the
 *   auto-matched model capabilities are editable right where providers live.
 *
 * No DOM injection, no mutation observers — everything goes through slots.
 */
import { PilotSection } from "./PilotSection.js";
import { ProviderCardPilot, ModelsFooterPilot } from "./ModelsIntegration.js";
import { t } from "./i18n.js";

export const name = "dsh-model-pilot";
export const inject = ["slots"];

/** pi-ai adapter namespace; all its provider routes share this settingsNs. */
const PI_AI_NS = "llm-pi-ai";

export function apply(ctx: any): void {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "dsh-model-pilot",
        order: 60,
        label: () => t("nav"),
        inject: () => ({ hooks: {} }),
      },
      PilotSection,
    ),
  );

  // Inside every pi-ai provider card (custom gateway routes included).
  ctx.slots.inject("settings.models.provider-card", () =>
    ctx.slots.register(
      { name: "settings.models.provider-card", key: PI_AI_NS },
      ProviderCardPilot,
    ),
  );

  // Global strip after the provider rows + add controls.
  ctx.slots.inject("settings.models.footer", () =>
    ctx.slots.register(
      { name: "settings.models.footer", id: "dsh-model-pilot-footer", order: 50 },
      ModelsFooterPilot,
    ),
  );
}
