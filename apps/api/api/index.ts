// Hono 4 exposes this adapter at `hono/vercel`; removal is tracked for the next major migration.
import { handle } from 'hono/vercel';

import { createApp } from '../src/app';

// eslint-disable-next-line @typescript-eslint/no-deprecated
export default handle(createApp());
