import { containsForbiddenTerm } from './types';

/**
 * Vocabulary guard — throws in dev, logs in prod, if forbidden outcome
 * terms (hire, reject, rank, etc.) appear in rendered text.
 * Called from a development-only effect in AppShell.
 */
export function auditRenderedText(root: HTMLElement): string[] {
  const violations: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    if (containsForbiddenTerm(text)) {
      violations.push(text.trim().slice(0, 80));
    }
  }
  return violations;
}
