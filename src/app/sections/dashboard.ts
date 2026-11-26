// Management-page section "dashboard" (F08, R12): the six numbers at the top of the page. The
// numbers come from domain/dashboard.ts (single aggregate query over the tickets).
import type { ManageSection } from '../manage-sections.ts';
import { getDashboard } from '../../domain/dashboard.ts';

export const section: ManageSection | null = {
  id: 'dashboard',
  order: 10,
  view: 'sections/dashboard.ejs',
  async load({ event }) {
    return { dashboard: await getDashboard(event) };
  },
};
