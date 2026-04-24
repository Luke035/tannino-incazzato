import type { Page } from '@playwright/test';

// Drags the active PostIt card onto the SVG region identified by svgId.
// Uses Playwright's mouse API to fire pointer events compatible with dnd-kit's
// PointerSensor (activationConstraint: { distance: 5 }).
// The svgCollisionDetection uses document.elementsFromPoint, so the pointer
// must land within the SVG path's rendered pixels.
export async function dragToRegion(page: Page, svgId: string): Promise<void> {
  const card = page.getByTestId('active-card');
  const cardBox = await card.boundingBox();
  if (!cardBox) throw new Error('active-card not found or not visible');

  const cardCx = cardBox.x + cardBox.width / 2;
  const cardCy = cardBox.y + cardBox.height / 2;

  // Get the viewport center of the target SVG path using getBoundingClientRect().
  // SVG path elements don't have a standard .boundingBox() in Playwright,
  // so we evaluate in the browser.
  const target = await page.evaluate((id: string) => {
    const el = document.querySelector(`#${id}`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, svgId);

  if (!target) throw new Error(`SVG region not found: #${svgId}`);

  await page.mouse.move(cardCx, cardCy);
  await page.mouse.down();
  // Move a small amount first to satisfy the 5px activationConstraint
  await page.mouse.move(cardCx + 8, cardCy + 8, { steps: 3 });
  // Move to target region in steps so pointermove events fire continuously
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();
}
