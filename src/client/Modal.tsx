/**
 * Portal-mounted modal shell for Model Pilot forms.
 *
 * The settings panel carries backdrop-filter and overflow:hidden, so an
 * in-tree fixed overlay is clipped or swallowed; worse, its mask competed
 * with the panel's own overlay (both z-index:1000) and intercepted clicks
 * on the panel's close button. Portaling to document.body above the panel
 * layer (z-index 2000) fixes both.
 */
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { styles } from "./styles.js";

export function Modal({ onClose, title, subtitle, children }: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.h1, fontSize: 17, marginBottom: 2 }}>{title}</div>
        {subtitle ? <div style={{ ...styles.muted, marginBottom: 6 }}>{subtitle}</div> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
