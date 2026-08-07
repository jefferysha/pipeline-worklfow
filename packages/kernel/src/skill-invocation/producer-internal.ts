/**
 * Trusted workspace producer bridge. This explicit package subpath is absent from the kernel root:
 * host/automation application adapters may consume it, while ordinary package consumers and the
 * stable read API cannot discover evidence-minting primitives from `@tenon/kernel`.
 */
export { issueVerifiedAfkInteractionReceipt } from './afk-interaction-receipt.js'
export { recordHostSkillInvocationInteraction } from './interaction-command.js'
export {
  recordCodexDocumentSkillConfirmation,
  recordNativeDocumentSkillConfirmation,
} from './document-confirmation.js'
export { recordCanonicalDocumentSkillInvocation } from './document-producer.js'
export {
  finishDurableAfkSkillInvocations,
  startDurableAfkSkillInvocations,
} from './afk-producer.js'
export { withSkillInvocationChangeLock } from './repository.js'
