import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { createDemoSession } from '@learny/testing/supabase';

const alex = DEMO_USERS.find((user) => user.key === 'alex');
if (alex === undefined) throw new Error('utilisateur de démonstration Alex absent');

const session = await createDemoSession(demoUserId('alex'), alex.email);
process.stdout.write(JSON.stringify({ cookieHeader: session.cookieHeader }));
