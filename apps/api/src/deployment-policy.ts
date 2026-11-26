/** Preview containers carry preview secrets and storage, so they cannot become production by pointer switch. */
export function runtimeActivationProblem(deployment:{environment:string;artifact?:{kind?:string}|null}):string|null {
  if(deployment.artifact?.kind==='runtime' && deployment.environment==='preview') {
    return 'A preview runtime uses isolated preview settings and storage. Create a new production deployment from its retained source with POST /deployments/:id/retry and {environment:"production",authorizeProduction:true}. Existing production remains unchanged until verification.';
  }
  return null;
}
