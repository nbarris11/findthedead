export function ProfileMapFallback({ note }: { note: string }) {
  return (
    <div className="profile-map profile-map-fallback">
      <p className="muted">{note}</p>
    </div>
  );
}
