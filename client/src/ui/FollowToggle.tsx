import { useCosmos } from "../store";

// Auto-follow: keep the mind-light itself in the camera's focus — wherever
// it goes, the spectator goes with it.

export function FollowToggle() {
  const followMind = useCosmos((s) => s.followMind);
  const toggleFollow = useCosmos((s) => s.toggleFollow);
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  if (ignitionAt == null) return null;

  return (
    <button
      className={`follow-box${followMind ? " active" : ""}`}
      onClick={toggleFollow}
      title="keep the mind in focus"
    >
      <span className="follow-dot" />
      auto follow
    </button>
  );
}
