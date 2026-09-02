import PageLayout from '../components/PageLayout';

export default function Privacy() {
  return (
    <PageLayout
      title="Privacy & sharing"
      subtitle="A clear guide to what stays private and what becomes public."
      description="Learn how privacy and sharing work in Before & After Vault."
    >
      <div className="prose-card card">
        <section>
          <h2>Your vault</h2>
          <p>Your projects and project entries are intended for your account. Signing in is required to open and manage them.</p>
        </section>
        <section>
          <h2>What sharing means</h2>
          <p>Items posted to Community are public. Anyone with the link may view, save, or redistribute a public image, caption, and any attribution you choose to include. Avoid sharing private documents, precise locations, or images you do not have permission to publish.</p>
        </section>
        <section>
          <h2>Unsharing and deletion</h2>
          <p>Unsharing removes an item from Community and disables its public page. Where a separate public image copy exists, the app also requests its removal. Deleting a community post requests removal of its associated uploaded files and record. Copies previously saved by other people cannot be recalled.</p>
        </section>
        <section>
          <h2>Account and service data</h2>
          <p>Your email address is used for authentication but is not displayed publicly by the app. The site uses Supabase for authentication and data storage and Vercel Analytics on ordinary, nonsensitive pages. Analytics is excluded from sign-in, recovery, and authentication callback routes.</p>
        </section>
        <aside className="privacy-callout">
          <strong>Before posting:</strong> remove anything visible in the photo that could identify a home address, child, medical record, financial document, or private account.
        </aside>
      </div>
    </PageLayout>
  );
}
