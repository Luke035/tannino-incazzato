import { describe, it, expect } from 'vitest';
import { regionToSvgId, svgIdToDisplay } from '../regionMapping';

describe('regionToSvgId', () => {
  it('maps known Italian names to SVG IDs', () => {
    expect(regionToSvgId('Toscana')).toBe('tuscany');
    expect(regionToSvgId('Puglia')).toBe('apulia');
    expect(regionToSvgId('Lombardia')).toBe('lombardy');
    expect(regionToSvgId('Emilia Romagna')).toBe('emilia-romagna');
  });

  it('maps autonomous provinces to trentino-south-tyrol', () => {
    expect(regionToSvgId('Provincia Autonoma di Bolzano')).toBe('trentino-south-tyrol');
    expect(regionToSvgId('Provincia Autonoma di Trento')).toBe('trentino-south-tyrol');
  });

  it('falls back to kebab-case for unknown regions', () => {
    expect(regionToSvgId('Unknown Region')).toBe('unknown-region');
  });
});

describe('svgIdToDisplay', () => {
  it('maps known SVG IDs to Italian display names', () => {
    expect(svgIdToDisplay('tuscany')).toBe('Toscana');
    expect(svgIdToDisplay('apulia')).toBe('Puglia');
    expect(svgIdToDisplay('lombardy')).toBe('Lombardia');
    expect(svgIdToDisplay('emilia-romagna')).toBe('Emilia-Romagna');
  });

  it('falls back to the ID itself for unknown SVG IDs', () => {
    expect(svgIdToDisplay('unknown-region')).toBe('unknown-region');
  });
});
