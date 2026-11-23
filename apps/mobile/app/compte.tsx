// Account sheet (SPEC-3102 EF-4, BR-NAV-01): the modal route of the account disc.
import { useRouter } from 'expo-router';

import { AccountSheet } from '../src/features/shell/AccountSheet';

export default function CompteRoute() {
  const router = useRouter();
  return (
    <AccountSheet
      onClose={() => {
        router.back();
      }}
    />
  );
}
