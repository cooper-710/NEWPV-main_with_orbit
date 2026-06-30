export const FT_PER_S_TO_MPH = 0.681818;

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const number = numberOrUndefined(value);
    if (number !== undefined) return number;
  }
  return undefined;
}

function inferredVelocityMph(value) {
  const number = numberOrUndefined(value);
  if (number === undefined) return undefined;

  return number >= 125 ? number * FT_PER_S_TO_MPH : number;
}

export function pitchVelocityMph(pitch) {
  if (!pitch) return undefined;

  const explicitMph = firstNumber(
    pitch.mph,
    pitch.release_speed_mph,
    pitch.velocity_mph,
    pitch.vel_mph
  );
  if (explicitMph !== undefined) return explicitMph;

  const releaseSpeed = firstNumber(pitch.release_speed);
  if (releaseSpeed !== undefined) return releaseSpeed * FT_PER_S_TO_MPH;

  const inferred = firstNumber(
    inferredVelocityMph(pitch.velocity),
    inferredVelocityMph(pitch.vel)
  );
  if (inferred !== undefined) return inferred;

  const vx0 = numberOrUndefined(pitch.vx0) || 0;
  const vy0 = numberOrUndefined(pitch.vy0) || 0;
  const vz0 = numberOrUndefined(pitch.vz0) || 0;
  const speedFtPerS = Math.hypot(vx0, vy0, vz0);
  return speedFtPerS > 0 ? speedFtPerS * FT_PER_S_TO_MPH : undefined;
}
