import { DEMO_USERS, demoUserId } from '../../packages/db/src/seed/demo-fixtures.ts';
import { createDemoSession } from '../../packages/testing/src/supabase.ts';

const alex = DEMO_USERS.find((user) => user.key === 'alex');
if (alex === undefined) throw new Error('utilisateur de démonstration Alex absent');

const session = await createDemoSession(demoUserId('alex'), alex.email);
process.stdout.write(JSON.stringify({ cookieHeader: session.cookieHeader }));
