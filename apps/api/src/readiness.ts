export const workerCapabilitiesKey = 'worker:capabilities';
const maximumAgeMs = 45000;

/** Only a recent worker report can establish that isolated builds actually work. */
export function deploymentReadiness(value: string | null | undefined, now = Date.now()) {
  let report: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(value || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) report = parsed as Record<string, unknown>; } catch { /* Missing or damaged reports are unavailable, never ready. */ }
  const checkedAt = typeof report.checkedAt === 'string' ? report.checkedAt : null;
  const age = checkedAt ? now - Date.parse(checkedAt) : NaN;
  const workerOnline = Number.isFinite(age) && age >= -5000 && age <= maximumAgeMs;
  const dockerAvailable = workerOnline && report.dockerAvailable === true;
  const sourceBuildsAvailable = dockerAvailable && report.sourceBuildsAvailable === true;
  const dynamicRuntimeAvailable = sourceBuildsAvailable && report.dynamicRuntimeAvailable === true;
  const supportedRuntimeFrameworks = dynamicRuntimeAvailable && Array.isArray(report.supportedRuntimeFrameworks)
    ? report.supportedRuntimeFrameworks.filter((item): item is string => typeof item === 'string' && /^[a-z0-9-]{1,40}$/.test(item)) : [];
  const reason = !workerOnline
    ? 'The deployment worker has not reported a recent readiness check. Static and prebuilt uploads remain available.'
    : typeof report.reason === 'string' && report.reason ? report.reason.slice(0,1000)
    : !dockerAvailable ? 'The worker cannot reach a Linux Docker engine. Source builds and server applications need isolated containers.'
    : !sourceBuildsAvailable ? 'Isolated source builds are disabled on this worker.'
    : !dynamicRuntimeAvailable ? 'Static source builds are available; server application runtimes are disabled.'
    : 'The worker reports that isolated builds and server application runtimes are available.';
  const actions = !workerOnline ? ['Start or restart the DeployHub worker, then refresh this check.']
    : !dockerAvailable ? ['Start Docker Desktop with Linux containers, or configure a Linux Docker worker.', 'You can upload an existing static dist/build/out folder without Docker.']
    : !sourceBuildsAvailable ? ['Enable BUILD_DOCKER_ENABLED and configure an approved dependency network or a prepared offline build image.']
    : !dynamicRuntimeAvailable ? ['Enable runtime containers on the worker before deploying server-rendered applications.'] : [];
  return { staticUploadsAvailable: true, workerOnline, dockerAvailable, sourceBuildsAvailable, dynamicRuntimeAvailable, supportedRuntimeFrameworks, checkedAt, reason, actions };
}
