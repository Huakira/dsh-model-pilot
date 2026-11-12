/**
 * dsh-model-pilot browser half.
 *
 * Registers a standalone page into the official settings panel via the
 * `settings.section` slot. The page is self-contained (own React state +
 * same-origin HTTP to the host routes); no DOM injection, no mutation observers.
 */
import { PilotSection } from "./PilotSection.js";
import { t } from "./i18n.js";

export const name = "dsh-model-pilot";
export const inject = ["slots"];

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
}