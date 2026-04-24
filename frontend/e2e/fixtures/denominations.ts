// Fixed set of 10 denominations used in E2E tests.
// Includes 2 multi-region cards (Prosecco, Lugana) to exercise multi-region flow.
export const DENOMINATIONS = [
  { id: 1,  name: 'Barolo',                    type: 'DOCG', regions: ['Piemonte'] },
  { id: 2,  name: 'Chianti Classico',           type: 'DOCG', regions: ['Toscana'] },
  { id: 3,  name: 'Brunello di Montalcino',     type: 'DOCG', regions: ['Toscana'] },
  { id: 4,  name: 'Soave',                      type: 'DOC',  regions: ['Veneto'] },
  { id: 5,  name: 'Amarone della Valpolicella', type: 'DOCG', regions: ['Veneto'] },
  { id: 6,  name: 'Vermentino di Sardegna',     type: 'DOC',  regions: ['Sardegna'] },
  { id: 7,  name: 'Primitivo di Manduria',      type: 'DOC',  regions: ['Puglia'] },
  { id: 8,  name: 'Oltrepò Pavese',             type: 'DOC',  regions: ['Lombardia'] },
  { id: 9,  name: 'Prosecco',                   type: 'DOC',  regions: ['Veneto', 'Friuli Venezia Giulia'] },
  { id: 10, name: 'Lugana',                     type: 'DOC',  regions: ['Veneto', 'Lombardia'] },
];

// SVG IDs for each region name — mirrors regionMapping.ts without importing Next.js code
export const REGION_TO_SVG: Record<string, string> = {
  'Piemonte':              'piedmont',
  'Toscana':               'tuscany',
  'Veneto':                'veneto',
  'Sardegna':              'sardinia',
  'Puglia':                'apulia',
  'Lombardia':             'lombardy',
  'Friuli Venezia Giulia': 'friuli-venezia-giulia',
};

// Map from denomination name -> SVG IDs for quick lookup in tests
export const DENOM_SVG_REGIONS: Record<string, string[]> = Object.fromEntries(
  DENOMINATIONS.map((d) => [d.name, d.regions.map((r) => REGION_TO_SVG[r])])
);
