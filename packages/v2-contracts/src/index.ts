/**
 * @cpf/v2-contracts — S05 immutable V2 contracts.
 * Source of truth is Zod; every contract carries `contract` + `version`
 * discriminators. Breaking changes require a new version literal, never an
 * in-place mutation.
 */
export {
  CONTRACT_VERSION,
  Uuid,
  IsoDateTime,
  Sha256Hex,
  IdempotencyKey,
  SessionStateV2,
  SessionEventV2,
  SESSION_TRANSITIONS_V2,
  IllegalTransitionV2Error,
  nextSessionState,
  ErrorEnvelopeV2,
} from "./session.js";
export { AssessmentManifestV2, ManifestToolPolicy, CompanionPolicy, ArtifactV2, ArtifactVersionV2, ArtifactKind } from "./manifest.js";
export {
  AiInteractionV2,
  FORBIDDEN_AI_OUTPUT_PATTERNS,
  violatesForbiddenOutput,
  PluginInvocationV2,
  PluginReceiptV2,
  IntegrityEventV2,
  TechnicalIncidentV2,
  DimensionReviewV2,
  ShutdownReceiptV2,
  EventBatchV2,
} from "./evidence.js";
export { manifestSigningPayload, signManifest, verifyManifestSignature } from "./signing.js";
