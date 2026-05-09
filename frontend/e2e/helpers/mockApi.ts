import type { Page } from '@playwright/test';
import { DENOMINATIONS } from '../fixtures/denominations';
import { HINT_RESPONSE, MEMORIZE_TIP_RESPONSE, REVIEW_RESPONSE } from '../fixtures/aiResponses';

const MOCK_USER = { id: 1, email: 'e2e-test@sommelier.test', first_name: 'Test', last_name: 'User' };

// Intercepts all backend API calls and returns deterministic fixture data.
// Call this before navigating to any page.
export async function mockApi(
  page: Page,
  options?: { denominations?: typeof DENOMINATIONS }
): Promise<void> {
  const denoms = options?.denominations ?? DENOMINATIONS;

  await page.route('**/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  );

  await page.route('**/denominations', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(denoms) })
  );

  await page.route('**/hint', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(HINT_RESPONSE) })
  );

  await page.route('**/memorize', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MEMORIZE_TIP_RESPONSE) })
  );

  await page.route('**/review', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(REVIEW_RESPONSE) })
  );
}
