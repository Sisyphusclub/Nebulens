/**
 * The title over a part of the home page, followed by an orange mark. The mark is
 * decoration: `id` sits on the words alone, so a section labelled by it is named by them.
 */
export function HomeSectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 className="home-section-title">
      <span id={id}>{children}</span>
      <span className="home-section-title__mark" aria-hidden="true">
        *
      </span>
    </h2>
  );
}
