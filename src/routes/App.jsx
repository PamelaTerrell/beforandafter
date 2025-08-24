import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageLayout from '../components/PageLayout';

export default function App() {
  const [email, setEmail] = useState(null);

  // Keep the email in sync with auth state (purely for the "Signed in as" line)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <PageLayout
      title="Before & After Vault"
      subtitle="Track private before-and-after transformations."
    >
     

      {email && <small>Signed in as {email}</small>}
    </PageLayout>
  );
}
