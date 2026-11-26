// Aggregates the management-page sections that are implemented (non-null), in render order.
import type { ManageSection } from '../manage-sections.ts';
import { section as checkin } from './checkin.ts';
import { section as cancellation } from './cancellation.ts';
import { section as dashboard } from './dashboard.ts';

export const sections: ManageSection[] = [checkin, cancellation, dashboard]
  .filter((s): s is ManageSection => s !== null)
  .sort((a, b) => a.order - b.order);
