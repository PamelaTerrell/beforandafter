// components/BeforeAfterCard.jsx
import { publicUrl } from "../lib/getPublicUrl";

export default function BeforeAfterCard({ pair }) {
  const beforeSrc = publicUrl(pair.before_path);
  const afterSrc  = publicUrl(pair.after_path);

  return (
    <article className="ba-card" aria-label="Before and After comparison">
      <div className="grid">
        <figure>
          <img src={beforeSrc} alt="Before" />
          <figcaption>Before</figcaption>
        </figure>
        <figure>
          <img src={afterSrc} alt="After" />
          <figcaption>After</figcaption>
        </figure>
      </div>
      {pair.caption && <p className="caption">{pair.caption}</p>}
      <style jsx>{`
        .ba-card { display: grid; gap: 10px; }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        figure { margin: 0; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }
        img { width: 100%; height: 100%; object-fit: cover; display: block; }
        figcaption { text-align: center; font-size: 12px; padding: 6px; background: #f8fafc; }
        .caption { font-size: 14px; color: #374151; }
        @media (max-width: 720px) {
          .grid { grid-template-columns: 1fr 1fr; } /* stays side-by-side on phones too */
        }
      `}</style>
    </article>
  );
}
