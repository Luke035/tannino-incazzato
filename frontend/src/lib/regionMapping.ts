// Maps Italian region names -> @svg-maps/italy IDs
export const REGION_TO_SVG_ID: Record<string, string> = {
  'Abruzzo': 'abruzzo',
  "Valle D'Aosta": 'aosta-valley',
  "Valle D'aosta": 'aosta-valley',
  'Puglia': 'apulia',
  'Basilicata': 'basilicata',
  'Calabria': 'calabria',
  'Campania': 'campania',
  'Emilia Romagna': 'emilia-romagna',
  'Friuli Venezia Giulia': 'friuli-venezia-giulia',
  'Lazio': 'lazio',
  'Liguria': 'liguria',
  'Lombardia': 'lombardy',
  'Marche': 'marche',
  'Molise': 'molise',
  'Piemonte': 'piedmont',
  'Sardegna': 'sardinia',
  'Sicilia': 'sicily',
  'Trentino-Alto Adige': 'trentino-south-tyrol',
  'Provincia Autonoma di Bolzano': 'trentino-south-tyrol',
  'Provincia Autonoma di Trento': 'trentino-south-tyrol',
  'Toscana': 'tuscany',
  'Umbria': 'umbria',
  'Veneto': 'veneto',
};

// Maps @svg-maps/italy IDs -> display names in Italian
export const SVG_ID_TO_DISPLAY: Record<string, string> = {
  'abruzzo': 'Abruzzo',
  'aosta-valley': "Valle d'Aosta",
  'apulia': 'Puglia',
  'basilicata': 'Basilicata',
  'calabria': 'Calabria',
  'campania': 'Campania',
  'emilia-romagna': 'Emilia-Romagna',
  'friuli-venezia-giulia': 'Friuli-Venezia Giulia',
  'lazio': 'Lazio',
  'liguria': 'Liguria',
  'lombardy': 'Lombardia',
  'marche': 'Marche',
  'molise': 'Molise',
  'piedmont': 'Piemonte',
  'sardinia': 'Sardegna',
  'sicily': 'Sicilia',
  'trentino-south-tyrol': 'Trentino-Alto Adige',
  'tuscany': 'Toscana',
  'umbria': 'Umbria',
  'veneto': 'Veneto',
};

export function regionToSvgId(region: string): string {
  return REGION_TO_SVG_ID[region] ?? region.toLowerCase().replace(/\s+/g, '-');
}

export function svgIdToDisplay(id: string): string {
  return SVG_ID_TO_DISPLAY[id] ?? id;
}
