/** Technical details (provider names, key problems, DB codes) are for admins and server logs only. End users get a generic message. */
export const detailFor = (req, technical, generic) => (req.user?.role === 'admin' ? technical : generic)
export const GENERIC = {
  ai: 'The AI service is temporarily unavailable. Please try again later.',
  aiOutput: 'The AI answer could not be validated, so it was not used.',
  billing: 'Payments are temporarily unavailable. Please try again later.',
}
