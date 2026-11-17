import {
  demoChapterId,
  demoFormationId,
  demoModuleId,
  demoUserId,
  DEMO_USERS,
} from '@learny/db/seed/fixtures';

const alex = DEMO_USERS.find((user) => user.key === 'alex');

process.stdout.write(
  JSON.stringify({
    formationId: demoFormationId('sap'),
    moduleId: demoModuleId('sap', 3),
    chapterId: demoChapterId('sap', 3, 2),
    userId: demoUserId('alex'),
    email: alex?.email ?? 'alex.perrin@demo.learny.test',
  }),
);
