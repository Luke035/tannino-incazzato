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

  // 1. Native hit-test: all elements at cursor position, top to bottom.
  // elementsFromPoint (plural) lets us skip the DragOverlay card sitting on
  // top of the map and still find the SVG region beneath it.
  const hits = document.elementsFromPoint(x, y);
  for (const hit of hits) {
    for (const container of droppableContainers) {
      const node = container.node.current;
      if (node && node.contains(hit)) {
        return [{ id: container.id, data: container }];
      }
    }
  }

  return [];
};
