ALTER TABLE "DeploymentArtifact" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'static';
ALTER TABLE "DeploymentArtifact" ADD COLUMN "runtimeImage" TEXT;
ALTER TABLE "DeploymentArtifact" ADD COLUMN "runtimeContainer" TEXT;
ALTER TABLE "DeploymentArtifact" ADD COLUMN "runtimeEndpoint" TEXT;
