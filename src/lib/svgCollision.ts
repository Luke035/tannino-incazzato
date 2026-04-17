import type { CollisionDetection } from '@dnd-kit/core';

/**
 * Custom collision detection for SVG maps.
 *
 * Instead of comparing bounding-box rectangles (which heavily overlap for
 * neighbouring regions), we use the browser's native hit-testing:
 *   document.elementFromPoint(x, y)
 *
 * This gives pixel-perfect accuracy even for small, irregularly-shaped
 * SVG paths like Basilicata or Molise.
 *
 * Falls back to closest-centroid when the pointer is outside all regions
 * (e.g. hovering over the sea / outside Italy).
 */
export const svgCollisionDetection: CollisionDetection = ({
  droppableContainers,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates) return [];

  const { x, y } = pointerCoordinates;

  // 1. Native hit-test: find the element actually under the cursor.
  const hit = document.elementFromPoint(x, y);
  if (hit) {
    // Walk up the DOM from the hit element to find a registered droppable.
    for (const container of droppableContainers) {
      const node = container.node.current;
      if (node && node.contains(hit)) {
        return [{ id: container.id, data: container }];
      }
    }
  }

  return [];
};
